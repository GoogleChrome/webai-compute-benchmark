// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

import {defaultSuites} from "../resources/default-tests.mjs"
import {logGroup, sh} from "./helper.mjs"

const workloadDirs = new Set();

for (const suite of defaultSuites) {
  const parts = suite.url.split("/");
  const workloadDir = parts.slice(0, parts.indexOf("dist")).join("/");
  workloadDirs.add(workloadDir);
}

for (const workloadDir of workloadDirs) {
  await logGroup(`BUILDING: ${workloadDir}`, () => buildWorkload(workloadDir));
}

async function buildWorkload(workloadDir) {
  await sh(["npm", "install"], {cwd: workloadDir});
  await sh(["npm", "run", "build"], {cwd: workloadDir});
}
