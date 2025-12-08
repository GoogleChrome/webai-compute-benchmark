# Contributing

We welcome contributions! If you believe a model should be included in our benchmark, please submit a pull request to add it as a new workload.

As of Q1 2026, the benchmark is under active development, and we are refining aspects such as the scoring calculation. We welcome your input on design considerations or other general feedback. Please open an issue to start a discussion.

To propose a new workload, please add it to the `resources/experimental` directory and submit a pull request. In your pull request, please explain the workload's relevance and provide technical details about its integration.

## How to Add a New Workload

### Adding Experimental Workloads (for external contributors)

- Update the `description` and `dependencies` in `resources/experimental/package.json`.
- Adjust the code inside `resources/experimental/src/index.html`, `resources/experimental/src/index.mjs`.
- Update `resources/experimental/src/download-models.mjs` to download the model. You can refer to `resources/transformers-js/src/download-models.mjs` and `resources/litert-js/src/download-models.mjs` as examples.
- Add `<your-new-workload-name>.mjs` inside `resources/experimental/src`, similar to the existing ones.
- Update the entries and plugins in `resources/experimental/webpack.common.js`.
- Update `.gitignore` if needed.
- Run `npm install` and `npm run build` inside `resources/experimental` to produce output in `dist/`.
- Add the workload to `resources/default-tests.mjs`, analogous to the existing workloads.
- Serve the overall runner via `npm run dev` in the repository root directory.
- Browse to `http://localhost:8080` and click "Run" to run the benchmark.

### Adding Transformers.js-based Workloads (for approved contributors)

- Inside `resources/transformers-js/src/index.mjs`, add a new async function and `ModelConfig` for your workload.
- Add the name of your model to `MODELS_TO_DOWNLOAD` in `resources/transformers-js/src/download-models.mjs`.
- Add `<your-new-workload-name>.mjs` inside `resources/transformers-js/src`, similar to the existing ones.
- Add an entry and a plugin for the new workload in `resources/transformers-js/webpack.common.js`.
- Run `npm install` and `npm run build` inside `resources/transformers-js` to produce output in `dist/`.
- Add the workload to `resources/default-tests.mjs`, analogous to the existing workloads.
- Serve the overall runner via `npm run dev` in the repository root directory.
- Browse to `http://localhost:8080` and click "Run" to run the benchmark.

### Adding LiteRT.js-based Workloads (for approved contributors)

- Inside `resources/litert-js/src/index.mjs`, add a new async function and `ModelConfig` for your workload.
- Add the name of your model to `MODELS_TO_DOWNLOAD` in `resources/litert-js/src/download-models.mjs`.
- Add `<your-new-workload-name>.mjs` inside `resources/litert-js/src`, similar to the existing ones.
- Add an entry and a plugin for the new workload in `resources/litert-js/webpack.common.js`.
- Run `npm install` and `npm run build` inside `resources/litert-js` to produce output in `dist/`.
- Add the workload to `resources/default-tests.mjs`, analogous to the existing workloads.
- Serve the overall runner via `npm run dev` in the repository root directory.
- Browse to `http://localhost:8080` and click "Run" to run the benchmark.
