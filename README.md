# Web AI Workloads

This repository contains interesting AI workloads running on the Web, using WebAssembly (Wasm), WebGPU, WebNN or other underlying technologies.
Those workloads help us to evaluate the performance of the implementation, e.g., in browsers or JavaScript and WebAssembly runtimes.

The runner, which allows to select workloads, including ones from external sources, and collects and displays metrics, is based on the [Speedometer runner](https://github.com/WebKit/Speedometer).
See the Speedometer repo for a more detailed explanation, e.g., in which phases workloads are run and measured.

## Setup Instructions, How to Run Workloads

TODO(dlehmann): Once the first real workloads lands.

- Prerequisites.
- Starting the web server.
- Running a workload in the browser.
- Inspecting and understanding metrics.
- A screenshot.
- Most important files:
    - Workloads are in `resources/*/`, each being an NPM package.
    - Shared files are in `resources/shared/`, which is depended-upon as a local package.
    - The default suite / tests to run are in `resources/default-tests.mjs`.
    - An example config (which can be loaded from externally) is in `resources/config.json`, but it is not used (more an example).

## How to Add a New Workload

- Copy the dummy empty workload from `resources/empty` to `resources/<your-workload-name>`.
- Rename the `name` field in `resources/<your-workload-name>/package.json` and in `resources/<your-workload-name>/src/index.js`.
- Run `npm install` inside `resources/<your-workload-name>`, e.g., to copy over the shared scripts local package.
- Adjust the benchmarking steps in `resources/<your-workload-name>/src/workload-test.mjs`, e.g., click on a button, or if run automatically at startup no steps are needed.
- Run `npm run build` inside `resources/<your-workload-name>` to produce output in `dist/`
- Test the workload individually (without the runner) via `npm run serve` inside `resources/<your-workload-name>`. Browser to http://localhost:7006/.
- Add the workload to `resources/default-tests.mjs`, analogous to the existing `empty` workload.
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
