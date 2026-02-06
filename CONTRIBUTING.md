# How to Contribute

We would love to accept your patches and contributions to this project.

## Before you begin

### Sign our Contributor License Agreement

Contributions to this project must be accompanied by a
[Contributor License Agreement](https://cla.developers.google.com/about) (CLA).
You (or your employer) retain the copyright to your contribution; this simply
gives us permission to use and redistribute your contributions as part of the
project.

If you or your current employer have already signed the Google CLA (even if it
was for a different project), you probably don't need to do it again.

Visit <https://cla.developers.google.com/> to see your current agreements or to
sign a new one.

### Review our Community Guidelines

This project follows [Google's Open Source Community
Guidelines](https://opensource.google/conduct/).

## Contribution process

If you believe a model should be included in our benchmark, please submit a pull request to add it as a new workload.

As of Q1 2026, the benchmark is under active development, and we are refining aspects such as the scoring calculation. We welcome your input on design considerations or other general feedback. Please open an issue to start a discussion.

To propose a new workload, please add it to the `resources/experimental` directory and submit a pull request. In your pull request, please explain the workload's relevance and provide technical details about its integration.

### Adding Experimental Workloads

- Update the `description` and `dependencies` in `resources/experimental/package.json`.
- Inside `resources/experimental/src/index.mjs`, add a new async function and `ModelConfig` for your workload similar to the existing example.
- Adjust the code inside `resources/experimental/src/index.html` if needed.
- Update `resources/experimental/src/download-models.mjs` to download the model. You can refer to `resources/transformers-js/src/download-models.mjs` and `resources/litert-js/src/download-models.mjs` as examples.
- Add licensing information of the new model in `resources/experimental/license/NOTICE.md` and add any required license file in `resources/experimental/license/`.
- Add `<your-new-workload-name>.mjs` inside `resources/experimental/src`, similar to the existing ones.
- Add an entry and a plugin for the new workload in `resources/experimental/webpack.common.js`.
- Update `.gitignore` if needed.
- Run `npm run build` in the repository root directory. Alternatively, you can run `npm install` and `npm run build` inside `resources/experimental`.
- Add the workload to `resources/default-tests.mjs` with (optionally) the `Experimental-` prefix and `experimental` tag, analogous to the existing workloads.
- Serve the overall runner via `npm run dev` in the repository root directory.
- The experimental workloads are not part of default set of workloads. Browse to `http://localhost:8080/?developerMode`, select the added workloads alogside any other workloads and click "Start Test" to run the benchmark. You can find more instructions about how to use the Developer Mode in [Developer Mode and Custom Parameters](README.md#developer-mode-and-custom-parameters).
- To run individual experimental workloads,  navigate to `http://localhost:8080/resources/experimental/dist/<workload>.html` then do `manualRun()` in the dev console of the browser.

### Code Reviews

All submissions, including submissions by project members, require review. We
use [GitHub pull requests](https://docs.github.com/articles/about-pull-requests)
for this purpose.
