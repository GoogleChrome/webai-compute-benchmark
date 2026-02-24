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
await logGroup("UPDATING LIBRARY VERSION INFO", updateLibraryVersionInfo);
await logGroup("UPDATING MODEL INFO TABLE", updateModelInfoTable);

async function buildWorkload(workloadDir) {
  await sh(["npm", "install"], {cwd: workloadDir});
  await sh(["npm", "run", "build"], {cwd: workloadDir});
}

async function updateVersionInfo() {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const gitHash = (await sh(["git", "rev-parse", "HEAD"])).stdoutString.trim();
  const shortGitHash = gitHash.substring(0, 7);
  const gitLink = `<a href="https://github.com/GoogleChrome/webai-compute-benchmark/commit/${gitHash}" target="_blank">${shortGitHash}</a>`;

  let indexHtml = fs.readFileSync("index.html", "utf8");
  indexHtml = indexHtml.replace(/(<!-- package-version -->)(.*?)(<!-- \/package-version -->)/, `$1${packageJson.version}$3`);
  indexHtml = indexHtml.replace(/(<!-- git-hash -->)(.*?)(<!-- \/git-hash -->)/, `$1${gitLink}$3`);
  fs.writeFileSync("index.html", indexHtml);
  logInfo(`Updated index.html with version ${packageJson.version} and git hash ${shortGitHash}`);
}

async function updateLibraryVersionInfo() {
  const getPackageVersion = (lockfile, packageName) => {
    const matchingPaths = Object.keys(lockfile.packages).filter(path => 
      path === `node_modules/${packageName}` || path.endsWith(`/node_modules/${packageName}`)
    );

    if (matchingPaths.length === 0) {
      throw new Error(`Could not find package "${packageName}" in lockfile.`);
    } else if (matchingPaths.length > 1) {
      throw new Error(`Found multiple occurrences of package "${packageName}" in lockfile: ${matchingPaths.join(", ")}. Please specify which one to use.`);
    }

    return lockfile.packages[matchingPaths[0]].version;
  };

  const transformersLock = JSON.parse(fs.readFileSync("resources/transformers-js/package-lock.json", "utf8"));
  const litertLock = JSON.parse(fs.readFileSync("resources/litert-js/package-lock.json", "utf8"));

  const transformersVersion = getPackageVersion(transformersLock, "@huggingface/transformers");
  const onnxruntimeVersion = getPackageVersion(transformersLock, "onnxruntime-web");
  const litertVersion = getPackageVersion(litertLock, "@litertjs/core");

  const libraryVersionsHtml = `
                            <li>Transformers.js: ${transformersVersion}</li>
                            <li>ONNX Runtime: ${onnxruntimeVersion}</li>
                            <li>LiteRT.js: ${litertVersion}</li>
                            `;

  let aboutHtml = fs.readFileSync("about.html", "utf8");
  aboutHtml = aboutHtml.replace(/(<!-- library-versions -->)([\s\S]*?)(<!-- \/library-versions -->)/, `$1${libraryVersionsHtml}$3`);
  fs.writeFileSync("about.html", aboutHtml);
  logInfo("Updated about.html with library versions");
}

async function updateModelInfoTable() {
  // TODO(dlehmann): Instead of hardcoding this mapping here,
  // programmatically extract it from the resources/ directory.
  const suiteToModelId = {
    "Feature-Extraction-wasm": "Xenova/UAE-Large-V1",
    "Feature-Extraction-webgpu": "Xenova/UAE-Large-V1",
    "Sentence-Similarity-wasm": "Alibaba-NLP/gte-base-en-v1.5",
    "Sentence-Similarity-webgpu": "Alibaba-NLP/gte-base-en-v1.5",
    "Speech-Recognition-wasm": "Xenova/whisper-small",
    "Speech-Recognition-webgpu": "Xenova/whisper-small",
    "Background-Removal-wasm": "Xenova/modnet",
    "Background-Removal-webgpu": "Xenova/modnet",
    "Text-Reranking-wasm": "mixedbread-ai/mxbai-rerank-base-v1",
    "Text-Reranking-webgpu": "mixedbread-ai/mxbai-rerank-base-v1",
    "SFW-Image-Classification-wasm": "AdamCodd/vit-base-nsfw-detector",
    "SFW-Image-Classification-webgpu": "AdamCodd/vit-base-nsfw-detector",
    "Zero-shot-Image-Classification-wasm": "Marqo/marqo-fashionSigLIP",
    "Zero-shot-Image-Classification-webgpu": "Marqo/marqo-fashionSigLIP",
    "Text-to-Speech-wasm": "onnx-community/Kokoro-82M-v1.0-ONNX",
    "Text-to-Speech-webgpu": "onnx-community/Kokoro-82M-v1.0-ONNX",
    "Image-Segmentation-LiteRT.js-wasm": "qualcomm/MediaPipe-Selfie-Segmentation",
    "Image-Segmentation-LiteRT.js-webgpu": "qualcomm/MediaPipe-Selfie-Segmentation",
    "Image-Classification-LiteRT.js-wasm": "qualcomm/MobileNet-v3-Small",
    "Image-Classification-LiteRT.js-webgpu": "qualcomm/MobileNet-v3-Small",
    "Hand-Detection-LiteRT.js-wasm": "qualcomm/MediaPipe-Hand-Detection",
    "Hand-Detection-LiteRT.js-webgpu": "qualcomm/MediaPipe-Hand-Detection",
  };

  let modelVersionsHtml = "";
  for (const suite of defaultSuites) {
    if (!suite.tags || !suite.tags.includes("default")) {
      continue;
    }
    const modelId = suiteToModelId[suite.name];
    if (!modelId) {
      throw new Error(`No model ID found for benchmark suite: ${suite.name}`);
    }
    const modelUrl = `https://huggingface.co/${modelId}`;
    modelVersionsHtml += `
                                <tr>
                                    <td>${suite.name}</td>
                                    <td><a href="${modelUrl}" target="_blank">${modelId}</a></td>
                                </tr>`;
  }
  modelVersionsHtml += "\n                                "

  let aboutHtml = fs.readFileSync("about.html", "utf8");
  aboutHtml = aboutHtml.replace(/(<!-- model-versions -->)([\s\S]*?)(<!-- \/model-versions -->)/, `$1${modelVersionsHtml}$3`);
  fs.writeFileSync("about.html", aboutHtml);
  logInfo("Updated about.html with model information");
}
