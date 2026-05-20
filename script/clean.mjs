// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

import {defaultSuites} from "../resources/default-tests.mjs";
import {logInfo} from "./helper.mjs";
import fs from "node:fs";
import path from "node:path";

const workloadDirs = new Set();

for (const suite of defaultSuites) {
  const parts = suite.url.split("/");
  const workloadDir = parts.slice(0, parts.indexOf("dist")).join("/");
  workloadDirs.add(workloadDir);
}

logInfo(`CLEANING ${workloadDirs.size} WORKLOADS`);

for (const workloadDir of workloadDirs) {
  const modelsDir = path.join(workloadDir, "models");
  const distDir = path.join(workloadDir, "dist");

  if (fs.existsSync(distDir)) {
    logInfo(`  Removing ${distDir}...`);
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  if (fs.existsSync(modelsDir)) {
    logInfo(`  Cleaning ${modelsDir}...`);
    for (const item of fs.readdirSync(modelsDir)) {
      if (item === "gemma") {
        logInfo(`    Preserving ${path.join(modelsDir, item)}...`);
        continue;
      }
      const itemPath = path.join(modelsDir, item);
      logInfo(`    Removing ${itemPath}...`);
      fs.rmSync(itemPath, { recursive: true, force: true });
    }
  }
}

logInfo("Clean successfully completed.");
