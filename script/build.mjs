import {defaultSuites} from "../resources/default-tests.mjs"
import {logGroup, sh} from "./helper.mjs"

const workloadDirs = new Set();

for (const suite of defaultSuites) {
  const parts = suite.url.split("/");
  const workloadDir = parts.slice(0, parts.indexOf("dist")).join("/");
  workloadDirs.add(workloadDir);
}

for (const workloadDir of workloadDirs) {
  await logGroup(`BUILDING:${workloadDir}`, () => buildWorkload(workloadDir));
}

async function buildWorkload(workloadDir) {
  await sh(["npm", "install"], {cwd: workloadDir});
  await sh(["npm", "run", "build"], {cwd: workloadDir});
}
