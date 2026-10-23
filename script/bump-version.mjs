// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Updates and verifies the "## Version Branches" section in README.md against
 * package.json's "version" field, resolved workspace library lockfiles, and remote
 * version-* branches.
 *
 * Usage:
 *   node script/bump-version.mjs [major|minor|patch|<newVersion>] [--changes "Summary of changes"] [--remote <url-or-name>]
 *   node script/bump-version.mjs --check [--remote <url-or-name>]
 */

import fs from "node:fs";
import { parseArgs } from "node:util";
import esMain from "es-main";
import { getPackageVersion, logError, logInfo, sh } from "./helper.mjs";

const PACKAGE_JSON_PATH = "package.json";
const README_PATH = "README.md";
export const DEFAULT_REMOTE_URL = "https://github.com/GoogleChrome/webai-compute-benchmark.git";

// Key libraries recorded under each entry in README.md's "## Version Branches" section,
// along with the lockfile where their exact installed version is resolved.
const TRACKED_LIBRARIES = [
    {
        name: "Transformers.js",
        lockfilePath: "resources/transformers-js/package-lock.json",
        packageName: "@huggingface/transformers",
    },
    {
        name: "LiteRT.js",
        lockfilePath: "resources/litert-js/package-lock.json",
        packageName: "@litertjs/core",
    },
    {
        name: "LiteRT-LM",
        lockfilePath: "resources/experimental/package-lock.json",
        packageName: "@litert-lm/core",
    },
];

/**
 * Formats instructions for creating and pushing the frozen branch for a previous version.
 */
function formatBranchInstructions(previousVersion, remote = DEFAULT_REMOTE_URL) {
    const branchName = `version-${previousVersion}`;
    return [`Create and push the "${branchName}" branch pointing to main:`, `    git fetch ${remote} main`, `    git branch ${branchName} FETCH_HEAD`, `    git push ${remote} ${branchName}`].join("\n");
}

/**
 * Reads the current resolved version of every library in TRACKED_LIBRARIES from disk.
 */
export function getCurrentLibraryVersions() {
    const libraries = [];
    for (const { name, lockfilePath, packageName } of TRACKED_LIBRARIES) {
        const lockfile = JSON.parse(fs.readFileSync(lockfilePath, "utf8"));
        libraries.push({
            name,
            version: getPackageVersion(lockfile, packageName),
        });
    }
    return libraries;
}

/**
 * Compares two semver strings (e.g. "0.3.0" vs "0.4.0").
 * Returns -1 if versionA < versionB, 1 if versionA > versionB, or 0 if equal.
 */
export function compareSemver(versionA, versionB) {
    const [coreA, preA] = versionA.replace(/^v/, "").split("-");
    const [coreB, preB] = versionB.replace(/^v/, "").split("-");
    const partsA = coreA.split(".").map(Number);
    const partsB = coreB.split(".").map(Number);

    for (let i = 0; i < 3; i++) {
        const diff = (partsA[i] || 0) - (partsB[i] || 0);
        if (diff !== 0) {
            return diff > 0 ? 1 : -1;
        }
    }

    if (preA && !preB) {
        return -1;
    }
    if (!preA && preB) {
        return 1;
    }
    if (preA && preB && preA !== preB) {
        return preA < preB ? -1 : 1;
    }
    return 0;
}

/**
 * Resolves the target benchmark version given the current version in package.json
 * and an optional CLI argument (either major/minor/patch or an explicit semver string).
 */
export function resolveTargetVersion(currentVersion, versionArg) {
    if (!versionArg) {
        return currentVersion;
    }

    const parts = currentVersion.split(".").map(Number);
    if (versionArg === "major") {
        return `${parts[0] + 1}.0.0`;
    }
    if (versionArg === "minor") {
        return `${parts[0]}.${parts[1] + 1}.0`;
    }
    if (versionArg === "patch") {
        return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    }

    const cleanVersion = versionArg.replace(/^v/, "");
    if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(cleanVersion)) {
        throw new Error(`Invalid target version "${versionArg}". Expected semver (e.g. 0.4.0) or major/minor/patch.`);
    }
    if (compareSemver(cleanVersion, currentVersion) < 0) {
        throw new Error(`Downgrading benchmark version from "${currentVersion}" to "${cleanVersion}" is not supported.`);
    }
    return cleanVersion;
}

/**
 * Parses the existing "- **main (vX.Y.Z)**" block in README.md and extracts:
 *   - fullBlock: the raw markdown block string for replacement
 *   - version: the version string recorded for main (e.g. "0.3.0")
 *   - libraries: Map<libraryName, versionString> recorded under main
 *   - existingChanges: any "- Changes: ..." text already recorded on main
 */
export function parseMainVersionEntry(readmeContent) {
    const mainBlockRegex = /^- \*\*main \(v([\d.]+(?:-[\w.]+)?)\)\*\*\n((?: {4}- .+\n)+)/m;
    const match = readmeContent.match(mainBlockRegex);
    if (!match) {
        throw new Error(`Could not find a "- **main (vX.Y.Z)**" entry in ${README_PATH}.`);
    }

    const fullBlock = match[0];
    const version = match[1];
    const bulletLines = match[2].trimEnd().split("\n");
    const libraries = new Map();
    let existingChanges = "";

    for (const line of bulletLines) {
        const libMatch = line.match(/^ {4}- (.+?): `([^`]+)`$/);
        if (libMatch) {
            libraries.set(libMatch[1], libMatch[2]);
            continue;
        }
        const changesMatch = line.match(/^ {4}- Changes: (.+)$/);
        if (changesMatch) {
            existingChanges = changesMatch[1];
        }
    }

    return {
        fullBlock,
        version,
        libraries,
        existingChanges,
    };
}

/**
 * Extracts all archived "- **version-X.Y.Z**" branch names listed in README.md.
 */
export function parseVersionBranches(readmeContent) {
    const matches = readmeContent.matchAll(/^- \*\*(version-[\d.]+(?:-[\w.]+)?)\*\*/gm);
    return Array.from(matches, (m) => m[1]);
}

/**
 * Validates that neither the benchmark version nor any tracked library was downgraded.
 */
function assertNoDowngrades(previousVersion, targetVersion, previousLibraries, currentLibraries) {
    if (compareSemver(targetVersion, previousVersion) < 0) {
        throw new Error(`Downgrading benchmark version from "${previousVersion}" to "${targetVersion}" is not supported.`);
    }

    for (const { name, version } of currentLibraries) {
        const prevVersion = previousLibraries.get(name);
        if (prevVersion && compareSemver(version, prevVersion) < 0) {
            throw new Error(`Downgrading ${name} from "${prevVersion}" to "${version}" is not supported.`);
        }
    }
}

/**
 * Builds the "- Changes: ..." description by comparing previous vs. current library
 * versions and appending any custom summary (such as a PR title or --changes flag).
 */
export function buildChangesSummary(previousLibraries, currentLibraries, explicitChanges) {
    const diffs = [];

    for (const { name, version } of currentLibraries) {
        const prevVersion = previousLibraries.get(name);
        if (!prevVersion) {
            diffs.push(`Added ${name} \`${version}\``);
        } else if (compareSemver(version, prevVersion) < 0) {
            throw new Error(`Downgrading ${name} from "${prevVersion}" to "${version}" is not supported.`);
        } else if (prevVersion !== version) {
            diffs.push(`Updated ${name} from \`${prevVersion}\` to \`${version}\``);
        }
    }

    if (explicitChanges) {
        diffs.push(explicitChanges.replace(/\.$/, ""));
    }

    if (diffs.length === 0) {
        return "";
    }
    return `${diffs.join("; ")}.`;
}

/**
 * Formats a "- **main (vX.Y.Z)**" Markdown block with 4-space indentation matching Prettier.
 */
function formatMainBlock(version, libraries, changesSummary) {
    const lines = [`- **main (v${version})**`];
    for (const { name, version: libVersion } of libraries) {
        lines.push(`    - ${name}: \`${libVersion}\``);
    }
    if (changesSummary) {
        lines.push(`    - Changes: ${changesSummary}`);
    }
    return `${lines.join("\n")}\n`;
}

/**
 * Updates README.md:
 *   - Rejects any benchmark or library version downgrade.
 *   - Rejects tracked library updates when targetVersion was not bumped.
 *   - If targetVersion is newer, renames "- **main (v<old>)**" to "- **version-<old>**"
 *     and inserts a new "- **main (v<targetVersion>)**" entry right above it.
 */
export function updateReadmeContent(readmeContent, targetVersion, currentLibraries, explicitChanges, remote = DEFAULT_REMOTE_URL) {
    const mainEntry = parseMainVersionEntry(readmeContent);
    assertNoDowngrades(mainEntry.version, targetVersion, mainEntry.libraries, currentLibraries);

    if (mainEntry.version === targetVersion) {
        const changedLibraries = currentLibraries.filter(({ name, version }) => mainEntry.libraries.get(name) !== version);
        if (changedLibraries.length > 0) {
            const summary = changedLibraries.map(({ name, version }) => `${name} (${mainEntry.libraries.get(name) ?? "none"} -> ${version})`).join(", ");
            throw new Error(
                `Tracked library version(s) changed (${summary}), so the benchmark version must be bumped.\n` +
                    `Run: node script/bump-version.mjs <major|minor|patch> --changes "<summary of changes>"\n` +
                    `Then ${formatBranchInstructions(mainEntry.version, remote)}`
            );
        }
        const updatedMainBlock = formatMainBlock(targetVersion, currentLibraries, mainEntry.existingChanges);
        return readmeContent.replace(mainEntry.fullBlock, updatedMainBlock);
    }

    const changesSummary = buildChangesSummary(mainEntry.libraries, currentLibraries, explicitChanges);
    const newMainBlock = formatMainBlock(targetVersion, currentLibraries, changesSummary);
    const archivedBranchBlock = mainEntry.fullBlock.replace(`- **main (v${mainEntry.version})**`, `- **version-${mainEntry.version}**`);

    return readmeContent.replace(mainEntry.fullBlock, `${newMainBlock}\n${archivedBranchBlock}`);
}

/**
 * Checks that README.md's "- **main (vX.Y.Z)**" entry matches both package.json's version
 * and the resolved library versions in workspace lockfiles. Throws an error with instructions if out of sync.
 */
export function verifyReadmeInSync(readmeContent, packageVersion, currentLibraries, remote = DEFAULT_REMOTE_URL) {
    const mainEntry = parseMainVersionEntry(readmeContent);
    assertNoDowngrades(mainEntry.version, packageVersion, mainEntry.libraries, currentLibraries);

    if (mainEntry.version !== packageVersion) {
        throw new Error(
            `README.md Version Branches section lists "main (v${mainEntry.version})", but package.json version is "${packageVersion}".\n\n` +
                "To fix this:\n" +
                "  1. Update README.md by running:\n" +
                '       node script/bump-version.mjs --changes "<summary of changes>"\n' +
                "  2. Commit the updated README.md.\n" +
                `  3. ${formatBranchInstructions(mainEntry.version, remote)}`
        );
    }

    for (const { name, version } of currentLibraries) {
        const readmeLibVersion = mainEntry.libraries.get(name);
        if (readmeLibVersion !== version) {
            throw new Error(
                `README.md lists ${name} version "${readmeLibVersion ?? "missing"}" under main (v${packageVersion}), but lockfile has "${version}".\n\n` +
                    `Because ${name} was updated, please bump the benchmark version, update README.md, and create the previous version branch:\n` +
                    "  1. Run:\n" +
                    '       node script/bump-version.mjs <major|minor|patch> --changes "<summary of changes>"\n' +
                    "  2. Commit the updated package.json and README.md.\n" +
                    `  3. ${formatBranchInstructions(mainEntry.version, remote)}`
            );
        }
    }
}

/**
 * Verifies that every "- **version-X.Y.Z**" branch listed in README.md exists on the target remote.
 */
export function verifyVersionBranchesExist(readmeContent, remoteBranches, remote = DEFAULT_REMOTE_URL) {
    const remoteBranchSet = new Set(remoteBranches);
    const listedBranches = parseVersionBranches(readmeContent);

    for (const branchName of listedBranches) {
        if (!remoteBranchSet.has(branchName)) {
            const version = branchName.replace(/^version-/, "");
            throw new Error(`Branch "${branchName}" is listed in README.md under "## Version Branches", but does not exist on ${remote}.\n\n` + `Before merging this PR, please ${formatBranchInstructions(version, remote)}`);
        }
    }
}

/**
 * Fetches all "version-*" branch names currently present on the target remote.
 */
async function getRemoteVersionBranches(remote = DEFAULT_REMOTE_URL) {
    const output = (await sh(["git", "ls-remote", "--heads", remote, "refs/heads/version-*"])).stdoutString.trim();
    if (!output) {
        return [];
    }
    return output
        .split("\n")
        .map((line) => line.split("\t")[1]?.replace(/^refs\/heads\//, ""))
        .filter(Boolean);
}

/**
 * Synchronizes README.md (and optionally package.json) with the target version
 * and resolved library versions from lockfiles. Returns true if README.md changed.
 */
export function syncReadmeWithPackageVersion({ versionArg, explicitChanges, remote = DEFAULT_REMOTE_URL } = {}) {
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
    const currentLibraries = getCurrentLibraryVersions();
    const readmeContent = fs.readFileSync(README_PATH, "utf8");
    const previousMainVersion = parseMainVersionEntry(readmeContent).version;

    const targetVersion = resolveTargetVersion(packageJson.version, versionArg);
    if (packageJson.version !== targetVersion) {
        packageJson.version = targetVersion;
        fs.writeFileSync(PACKAGE_JSON_PATH, `${JSON.stringify(packageJson, null, 4)}\n`);
        logInfo(`Updated ${PACKAGE_JSON_PATH} version to ${targetVersion}.`);
    }

    const updatedReadme = updateReadmeContent(readmeContent, targetVersion, currentLibraries, explicitChanges, remote);
    if (updatedReadme !== readmeContent) {
        fs.writeFileSync(README_PATH, updatedReadme);
        logInfo(`Updated ${README_PATH} for main (v${targetVersion}).`);
        if (previousMainVersion !== targetVersion) {
            logInfo(`\nReminder — before merging this version bump, ${formatBranchInstructions(previousMainVersion, remote)}`);
        }
        return true;
    }

    return false;
}

async function main() {
    const { values, positionals } = parseArgs({
        options: {
            changes: { type: "string", short: "c" },
            check: { type: "boolean", default: false },
            remote: { type: "string", short: "r", default: DEFAULT_REMOTE_URL },
        },
        allowPositionals: true,
    });

    if (values.check) {
        const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
        const currentLibraries = getCurrentLibraryVersions();
        const readmeContent = fs.readFileSync(README_PATH, "utf8");
        verifyReadmeInSync(readmeContent, packageJson.version, currentLibraries, values.remote);

        const remoteBranches = await getRemoteVersionBranches(values.remote);
        verifyVersionBranchesExist(readmeContent, remoteBranches, values.remote);

        logInfo(`Verified ${README_PATH} and remote version branches match package.json version v${packageJson.version}.`);
        return;
    }

    syncReadmeWithPackageVersion({
        versionArg: positionals[0],
        explicitChanges: values.changes,
        remote: values.remote,
    });
}

if (esMain(import.meta)) {
    try {
        await main();
    } catch (error) {
        logError(error.message);
        process.exit(1);
    }
}
