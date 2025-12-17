# Web AI Workloads

This repository contains interesting AI workloads running on the Web, using WebAssembly (Wasm), WebGPU, WebNN or other underlying technologies.
Those workloads help us to evaluate the performance of the implementation, e.g., in browsers or JavaScript and WebAssembly runtimes.

The runner, which allows to select workloads, including ones from external sources, and collects and displays metrics, is based on the [Speedometer runner](https://github.com/WebKit/Speedometer).
See the Speedometer repo for a more detailed explanation, e.g., in which phases workloads are run and measured.

## Platform Support

The `main` branch is tested and is runnable on MacBook Pro (M3). If you want to run the benchmark on gLinux machines, please use the `running-models-on-glinux` branch.

## Setup Instructions, How to Run Workloads

- Prerequisites: NPM, node. `npm install` to install the dependencies of the runner.
- Building the individual workloads: Run `npm run build` in the root directory. This will install dependencies and build all workloads in `resources/`. Alternatively, you can also manually run `npm install` and `npm run build` inside each `resources/<workload-group>/` sub-directory to produce output in `resources/<workload-group>/dist/`.
- Starting the web server: `npm run dev` in the root directory.
- Running a workload in the browser: TODO.
- Inspecting and understanding metrics: TODO.
- Most important files:
    - Workloads are in `resources/*/`.
    - Shared files are in `resources/shared/`, which is depended-upon as a local package.
    - The default suite / tests to run are in `resources/default-tests.mjs`.
    - An example config (which can be loaded from externally) is in `resources/config.json`, but it is not used (more an example).

TODO: Add a screenshot of the runner, after updating logo and name and some minor styling of the workloads.

## How to Run Individual Workload

- If you have not done that yet, run `npm install` and `npm run build` inside `resources/<workload-group>/` to produce output in `dist/`.
- `npm run dev` in the root directory to start the server
-  Navigate to `http://localhost:8080/resources/<workload-group>/dist/<workload>.html` (e.g. http://localhost:8080/resources/transformers-js/dist/feature-extraction-cpu.html ) then do `manualRun()` in dev console.

## How to Add a New Workload

### Transformers.js-based workloads

- Inside `resources/transformers-js/src/index.mjs`, add a new async function and `ModelConfig` for your workload.
- Add the name of your model to `MODELS_TO_DOWNLOAD` in `resources/transformers-js/src/download-models.mjs`.
- Add `<your-new-workload-name>.mjs` inside `resources/transformers-js/src`, similar to the existing ones.
- Add an entry and a plugin for the new workload in `resources/transformers-js/webpack.commom.js`.
- Run `npm install` and `npm run build` inside `resources/transformers-js` to produce output in `dist/`.
- Add the workload to `resources/default-tests.mjs`, analogous to the existing workloads.
- Serve the overall runner via `npm run dev` in the repository root directory.
- Browse to http://localhost:8080, click on run to see the new workload.

### LiteRT.js-based workloads

- Inside `resources/litert-js/src/index.mjs`, add a new async function and `ModelConfig` for your workload.
- Add the name of your model to `MODELS_TO_DOWNLOAD` in `resources/litert-js/src/download-models.mjs`.
- Add `<your-new-workload-name>.mjs` inside `resources/litert-js/src`, similar to the existing ones.
- Add an entry and a plugin for the new workload in `resources/litert-js/webpack.commom.js`.
- Run `npm install` and `npm run build` inside `resources/litert-js` to produce output in `dist/`.
- Add the workload to `resources/default-tests.mjs`, analogous to the existing workloads.
- Serve the overall runner via `npm run dev` in the repository root directory.
- Browse to http://localhost:8080, click on run to see the new workload.

### Other workloads

- Make a copy of `resources/transformers-js` and rename it to `resources/<your-selected-name>`.
- Update the `description` and `dependencies` in `resources/<your-selected-name>/package.json`.
- Adjust the code inside `resources/<your-selectedname>/src/index.html`, `resources/<your-selected-name>/src/index.mjs` and `resources/<your-selected-name>/src/download-models.mjs`.
- Update entries and a plugins in `resources/<your-selected-name>/webpack.commom.js`.
- Update `.gitignore`.
- Delete `resources/<your-selected-name>/models` if you have any.
- Run `npm install` and `npm run build` inside `resources/<your-selected-name>` to produce output in `dist/`.
- Add the workload to `resources/default-tests.mjs`, analogous to the existing workloads.
- Serve the overall runner via `npm run dev` in the repository root directory.
- Browse to http://localhost:8080, click on run to see the new workload.


## Source Code Headers

Every file containing source code must include copyright and license
information.
This includes any JS/CSS files that you might be serving out to
browsers.
(This is to help well-intentioned people avoid accidental copying that doesn't comply with the license.)

BSD 2-clause header:

    Copyright 2025 Google LLC

    Use of this source code is governed by a BSD-style
    license that can be found in the LICENSE file or at
    https://developers.google.com/open-source/licenses/bsd

Workloads from third party projects or files from the original Speedometer runner may have different, but compatible licenses (e.g., Apache 2).
The respective subdirectories should have the appropriate LICENSE file.
