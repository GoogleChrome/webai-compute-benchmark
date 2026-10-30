// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

import expect from "expect.js";
import { buildChangesSummary, compareSemver, parseMainVersionEntry, parseVersionBranches, resolveTargetVersion, updateReadmeContent, verifyReadmeInSync, verifyVersionBranchesExist } from "../../script/bump-version.mjs";

const SAMPLE_README = `# Web AI Compute Benchmark

## Version Branches

Here are the versions of key libraries and notable differences across branches:

- **main (v0.3.0)**
    - Transformers.js: \`4.0.1\`
    - LiteRT.js: \`2.4.0\`
    - LiteRT-LM: \`0.15.0\`
    - Changes: Split score into separate WASM and WebGPU scores.

- **version-0.2.0**
    - Transformers.js: \`4.0.1\`
    - LiteRT.js: \`2.4.0\`
    - Changes: Updated Transformers.js from \`3.7.5\` to \`4.0.1\`.
`;

const SAMPLE_LIBRARIES = [
    { name: "Transformers.js", version: "4.0.1" },
    { name: "LiteRT.js", version: "2.4.0" },
    { name: "LiteRT-LM", version: "0.15.0" },
];

describe("bump-version", () => {
    describe("compareSemver", () => {
        it("should return 0 for identical versions", () => {
            expect(compareSemver("0.3.0", "0.3.0")).to.equal(0);
            expect(compareSemver("v1.2.3", "1.2.3")).to.equal(0);
        });

        it("should compare major, minor, and patch versions numerically", () => {
            expect(compareSemver("0.4.0", "0.3.0")).to.equal(1);
            expect(compareSemver("0.2.0", "0.3.0")).to.equal(-1);
            expect(compareSemver("1.0.0", "0.9.9")).to.equal(1);
            expect(compareSemver("0.3.1", "0.3.2")).to.equal(-1);
        });

        it("should rank pre-release versions lower than release versions", () => {
            expect(compareSemver("0.3.0-alpha.1", "0.3.0")).to.equal(-1);
            expect(compareSemver("0.3.0", "0.3.0-alpha.1")).to.equal(1);
        });
    });

    describe("resolveTargetVersion", () => {
        it("should return currentVersion when versionArg is omitted", () => {
            expect(resolveTargetVersion("0.3.0", undefined)).to.equal("0.3.0");
        });

        it("should increment major, minor, and patch versions", () => {
            expect(resolveTargetVersion("0.3.2", "major")).to.equal("1.0.0");
            expect(resolveTargetVersion("0.3.2", "minor")).to.equal("0.4.0");
            expect(resolveTargetVersion("0.3.2", "patch")).to.equal("0.3.3");
        });

        it("should accept explicit semver strings with or without leading v", () => {
            expect(resolveTargetVersion("0.3.0", "0.4.0")).to.equal("0.4.0");
            expect(resolveTargetVersion("0.3.0", "v0.4.0")).to.equal("0.4.0");
        });

        it("should reject invalid version strings", () => {
            expect(() => resolveTargetVersion("0.3.0", "invalid")).to.throwError(/Invalid target version/);
        });

        it("should reject downgrading the benchmark version", () => {
            expect(() => resolveTargetVersion("0.3.0", "0.2.0")).to.throwError(/Downgrading benchmark version from "0.3.0" to "0.2.0" is not supported/);
        });
    });

    describe("parseMainVersionEntry", () => {
        it("should extract main version, library versions, and existing changes", () => {
            const parsed = parseMainVersionEntry(SAMPLE_README);
            expect(parsed.version).to.equal("0.3.0");
            expect(parsed.libraries.get("Transformers.js")).to.equal("4.0.1");
            expect(parsed.libraries.get("LiteRT.js")).to.equal("2.4.0");
            expect(parsed.libraries.get("LiteRT-LM")).to.equal("0.15.0");
            expect(parsed.existingChanges).to.equal("Split score into separate WASM and WebGPU scores.");
        });

        it("should throw when main version entry is missing", () => {
            expect(() => parseMainVersionEntry("# Empty README\n")).to.throwError(/Could not find/);
        });
    });

    describe("parseVersionBranches", () => {
        it("should extract all version-* branch names from README.md", () => {
            expect(parseVersionBranches(SAMPLE_README)).to.eql(["version-0.2.0"]);
        });
    });

    describe("buildChangesSummary", () => {
        it("should summarize library upgrades, additions, and explicit changes", () => {
            const previousLibraries = new Map([
                ["Transformers.js", "4.0.1"],
                ["LiteRT.js", "2.4.0"],
            ]);
            const currentLibraries = [
                { name: "Transformers.js", version: "4.1.0" },
                { name: "LiteRT.js", version: "2.4.0" },
                { name: "LiteRT-LM", version: "0.15.0" },
            ];

            const summary = buildChangesSummary(previousLibraries, currentLibraries, "Added WebNN support.");
            expect(summary).to.equal("Updated Transformers.js from `4.0.1` to `4.1.0`; Added LiteRT-LM `0.15.0`; Added WebNN support.");
        });

        it("should reject library downgrades", () => {
            const previousLibraries = new Map([["Transformers.js", "4.0.1"]]);
            const currentLibraries = [{ name: "Transformers.js", version: "3.7.5" }];

            expect(() => buildChangesSummary(previousLibraries, currentLibraries, "")).to.throwError(/Downgrading Transformers\.js from "4\.0\.1" to "3\.7\.5" is not supported/);
        });
    });

    describe("updateReadmeContent", () => {
        it("should archive the old main block as version-<old> and prepend the new main block on version bump", () => {
            const updatedLibraries = [
                { name: "Transformers.js", version: "4.1.0" },
                { name: "LiteRT.js", version: "2.4.0" },
                { name: "LiteRT-LM", version: "0.15.0" },
            ];

            const updated = updateReadmeContent(SAMPLE_README, "0.4.0", updatedLibraries, "Added WebNN workloads");
            expect(updated).to.contain("- **main (v0.4.0)**\n    - Transformers.js: `4.1.0`\n    - LiteRT.js: `2.4.0`\n    - LiteRT-LM: `0.15.0`\n    - Changes: Updated Transformers.js from `4.0.1` to `4.1.0`; Added WebNN workloads.");
            expect(updated).to.contain("- **version-0.3.0**\n    - Transformers.js: `4.0.1`");
        });

        it("should preserve existing changes when version and libraries are unchanged", () => {
            const updated = updateReadmeContent(SAMPLE_README, "0.3.0", SAMPLE_LIBRARIES, "Bump fast-uri");
            expect(updated).to.equal(SAMPLE_README);
        });

        it("should require a benchmark version bump when a tracked library is updated", () => {
            const updatedLibraries = [
                { name: "Transformers.js", version: "4.1.0" },
                { name: "LiteRT.js", version: "2.4.0" },
                { name: "LiteRT-LM", version: "0.15.0" },
            ];

            expect(() => updateReadmeContent(SAMPLE_README, "0.3.0", updatedLibraries, "")).to.throwError(/Tracked library version\(s\) changed \(Transformers\.js \(4\.0\.1 -> 4\.1\.0\)\), so the benchmark version must be bumped/);
        });

        it("should reject benchmark version downgrades relative to README.md", () => {
            expect(() => updateReadmeContent(SAMPLE_README, "0.2.0", SAMPLE_LIBRARIES, "")).to.throwError(/Downgrading benchmark version from "0.3.0" to "0.2.0" is not supported/);
        });

        it("should reject library version downgrades even when benchmark version is unchanged", () => {
            const downgradedLibraries = [
                { name: "Transformers.js", version: "4.0.1" },
                { name: "LiteRT.js", version: "2.3.0" },
                { name: "LiteRT-LM", version: "0.15.0" },
            ];

            expect(() => updateReadmeContent(SAMPLE_README, "0.3.0", downgradedLibraries, "")).to.throwError(/Downgrading LiteRT\.js from "2\.4\.0" to "2\.3\.0" is not supported/);
        });
    });

    describe("verifyReadmeInSync", () => {
        it("should pass when README.md matches package.json version and library versions", () => {
            expect(() => verifyReadmeInSync(SAMPLE_README, "0.3.0", SAMPLE_LIBRARIES)).to.not.throwError();
        });

        it("should throw with branch instructions when package.json version differs from README.md", () => {
            expect(() => verifyReadmeInSync(SAMPLE_README, "0.4.0", SAMPLE_LIBRARIES)).to.throwError(/git branch version-0\.3\.0 FETCH_HEAD/);
        });

        it("should throw with version bump and branch instructions when a library version differs from README.md", () => {
            const mismatchedLibraries = [
                { name: "Transformers.js", version: "4.2.0" },
                { name: "LiteRT.js", version: "2.4.0" },
                { name: "LiteRT-LM", version: "0.15.0" },
            ];
            expect(() => verifyReadmeInSync(SAMPLE_README, "0.3.0", mismatchedLibraries)).to.throwError(/Because Transformers\.js was updated, please bump the benchmark version[\s\S]*git branch version-0\.3\.0 FETCH_HEAD/);
        });
    });

    describe("verifyVersionBranchesExist", () => {
        it("should pass when all version-* branches in README.md exist on the remote", () => {
            expect(() => verifyVersionBranchesExist(SAMPLE_README, ["version-0.2.0", "version-0.1.0"])).to.not.throwError();
        });

        it("should throw with branch creation instructions using default remote URL when a version-* branch is missing", () => {
            expect(() => verifyVersionBranchesExist(SAMPLE_README, ["version-0.1.0"])).to.throwError(
                /Branch "version-0\.2\.0" is listed in README\.md[\s\S]*git fetch https:\/\/github\.com\/GoogleChrome\/webai-compute-benchmark\.git main[\s\S]*git branch version-0\.2\.0 FETCH_HEAD/
            );
        });

        it("should support a custom remote name or URL", () => {
            expect(() => verifyVersionBranchesExist(SAMPLE_README, ["version-0.1.0"], "upstream")).to.throwError(/does not exist on upstream[\s\S]*git fetch upstream main[\s\S]*git push upstream version-0\.2\.0/);
        });
    });
});
