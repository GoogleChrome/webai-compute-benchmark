// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Keeps the "## Version Branches" section in README.md synchronized with
 * package.json's "version" field and resolved workspace library lockfiles.
 *
 * This script runs automatically:
 *   1. Locally during `npm run build` (via script/build.mjs) whenever package.json
 *      or workspace lockfiles change.
 *   2. Automatically on Pull Requests via GitHub Actions (.github/workflows/version-branch.yml)
 *      whenever "version" in package.json is edited in a PR.
 *
 * It can also be run directly if desired:
 *   node script/bump-version.mjs [newVersion] [--changes "Summary of changes"]
 *   node script/bump-version.mjs --check
 */

import esMain from "es-main";
import fs from "node:fs";
import { parseArgs } from "node:util";
import { logError, logInfo } from "./helper.mjs";

const PACKAGE_JSON_PATH = "package.json";
const README_PATH = "README.md";

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
 * Looks up the resolved version of an npm package inside a parsed package-lock.json file.
 */
function getPackageVersion(lockfile, packageName) {
    const matchingPaths = Object.keys(lockfile.packages).filter((path) => path === `node_modules/${packageName}` || path.endsWith(`/node_modules/${packageName}`));

    if (matchingPaths.length === 0) {
        throw new Error(`Could not find package "${packageName}" in lockfile.`);
    } else if (matchingPaths.length > 1) {
        throw new Error(`Found multiple occurrences of package "${packageName}" in lockfile: ${matchingPaths.join(", ")}.`);
    }

    return lockfile.packages[matchingPaths[0]].version;
}

/**
 * Reads the current resolved version of every library in TRACKED_LIBRARIES from disk.
 */
function readCurrentLibraries() {
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
 * Resolves the target benchmark version given the current version in package.json
 * and an optional CLI argument (either major/minor/patch or an explicit semver string).
 */
function resolveTargetVersion(currentVersion, versionArg) {
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
    return cleanVersion;
}

/**
 * Parses the existing "- **main (vX.Y.Z)**" block in README.md and extracts:
 *   - fullBlock: the raw markdown block string for replacement
 *   - version: the version string recorded for main (e.g. "0.3.0")
 *   - libraries: Map<libraryName, versionString> recorded under main
 *   - existingChanges: any "- Changes: ..." text already recorded on main
 */
function parseMainVersionEntry(readmeContent) {
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
 * Builds the "- Changes: ..." description by comparing previous vs. current library
 * versions and appending any custom summary (such as a PR title or --changes flag).
 */
function buildChangesSummary(previousLibraries, currentLibraries, explicitChanges) {
    const diffs = [];

    for (const { name, version } of currentLibraries) {
        const prevVersion = previousLibraries.get(name);
        if (!prevVersion) {
            diffs.push(`Added ${name} \`${version}\``);
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
 *   - If targetVersion matches the version already listed on main, updates that block in place.
 *   - If targetVersion is newer, renames "- **main (v<old>)**" to "- **version-<old>**"
 *     and inserts a new "- **main (v<targetVersion>)**" entry right above it.
 */
function updateReadmeContent(readmeContent, targetVersion, currentLibraries, explicitChanges) {
    const mainEntry = parseMainVersionEntry(readmeContent);

    if (mainEntry.version === targetVersion) {
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
 * and the resolved library versions in workspace lockfiles. Throws an error if out of sync.
 */
export function verifyReadmeInSync(readmeContent, packageVersion, currentLibraries) {
    const mainEntry = parseMainVersionEntry(readmeContent);

    if (mainEntry.version !== packageVersion) {
        throw new Error(`README.md Version Branches section lists "main (v${mainEntry.version})", ` + `but package.json version is "${packageVersion}".`);
    }

    for (const { name, version } of currentLibraries) {
        const readmeLibVersion = mainEntry.libraries.get(name);
        if (readmeLibVersion !== version) {
            throw new Error(`README.md lists ${name} version "${readmeLibVersion ?? "missing"}" under main (v${packageVersion}), ` + `but lockfile has "${version}".`);
        }
    }
}

/**
 * Synchronizes README.md (and optionally package.json) with the target version
 * and resolved library versions from lockfiles. Returns true if README.md changed.
 */
export function syncReadmeWithPackageVersion({ versionArg, explicitChanges } = {}) {
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
    const currentLibraries = readCurrentLibraries();
    const readmeContent = fs.readFileSync(README_PATH, "utf8");

    const targetVersion = resolveTargetVersion(packageJson.version, versionArg);
    if (packageJson.version !== targetVersion) {
        packageJson.version = targetVersion;
        fs.writeFileSync(PACKAGE_JSON_PATH, `${JSON.stringify(packageJson, null, 4)}\n`);
        logInfo(`Updated ${PACKAGE_JSON_PATH} version to ${targetVersion}.`);
    }

    const updatedReadme = updateReadmeContent(readmeContent, targetVersion, currentLibraries, explicitChanges);
    if (updatedReadme !== readmeContent) {
        fs.writeFileSync(README_PATH, updatedReadme);
        logInfo(`Updated ${README_PATH} for main (v${targetVersion}).`);
        return true;
    }

    return false;
}

function main() {
    const { values, positionals } = parseArgs({
        options: {
            changes: { type: "string", short: "c" },
            check: { type: "boolean", default: false },
        },
        allowPositionals: true,
    });

    if (values.check) {
        const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
        const currentLibraries = readCurrentLibraries();
        const readmeContent = fs.readFileSync(README_PATH, "utf8");
        verifyReadmeInSync(readmeContent, packageJson.version, currentLibraries);
        logInfo(`Verified ${README_PATH} matches package.json version v${packageJson.version}.`);
        return;
    }

    syncReadmeWithPackageVersion({
        versionArg: positionals[0],
        explicitChanges: values.changes,
    });
}

if (esMain(import.meta)) {
    try {
        main();
    } catch (error) {
        logError(error.message);
        process.exit(1);
    }
}
