// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

import {defaultSuites} from "../resources/default-tests.mjs"
import {logGroup, logInfo, sh} from "./helper.mjs"
import fs from "node:fs";

const workloadDirs = new Set();

for (const suite of defaultSuites) {
  const parts = suite.url.split("/");
  const workloadDir = parts.slice(0, parts.indexOf("dist")).join("/");
  workloadDirs.add(workloadDir);
}

logInfo(`BUILDING ${workloadDirs.size} WORKLOADS`);
for (const workloadDir of workloadDirs) {
  logInfo(`  - ${workloadDir}`);
}
logInfo("");

for (const workloadDir of workloadDirs) {
  await logGroup(`BUILDING: ${workloadDir}`, () => buildWorkload(workloadDir));
}

await logGroup("UPDATING VERSION INFO", updateVersionInfo);

async function buildWorkload(workloadDir) {
  await sh(["npm", "install"], {cwd: workloadDir});
  await sh(["npm", "run", "build"], {cwd: workloadDir});
}

async function updateVersionInfo() {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const version = packageJson.version;
  const gitHash = (await sh(["git", "rev-parse", "HEAD"])).stdoutString.trim();
  const shortGitHash = gitHash.substring(0, 7);
  const gitLink = `<a href="https://github.com/GoogleChrome/webai-compute-benchmark/commit/${gitHash}" target="_blank">${shortGitHash}</a>`;

  let indexHtml = fs.readFileSync("index.html", "utf8");
  indexHtml = indexHtml.replace(/(<!-- package-version -->)(.*?)(<!-- \/package-version -->)/, `$1${version}$3`);
  indexHtml = indexHtml.replace(/(<!-- git-hash -->)(.*?)(<!-- \/git-hash -->)/, `$1${gitLink}$3`);
  fs.writeFileSync("index.html", indexHtml);
  logInfo(`Updated index.html with version ${version} and git hash ${shortGitHash}`);
}
