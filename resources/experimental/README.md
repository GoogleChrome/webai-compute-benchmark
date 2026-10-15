An experimental workload runner.

## Build steps

Webpack bundles all the output into the `dist` folder.

```
npm install
npm run build
```

## Requirements

Node, NPM, Git LFS, and [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) are required to install dependencies, download models, compile Wasm workloads, and run scripts to serve a local server.

```
* Node (min version: 18.13.0)
* NPM (min version: 8.19.3)
* Git LFS
* Emscripten (emcc / em++ in PATH)
```

## Wasm workloads

Some workloads (e.g. GGML in `src/ggml/`, NCNN in `src/ncnn/`, and Tract in `src/tract/`) are compiled from C/C++ or Rust with Emscripten. Their build output (`src/<workload>/build/`) is checked into the repository, so Emscripten, Rust, and CMake are **not** needed for `npm run build`, CI, or deployments.

To refresh the checked-in binaries (e.g. after bumping a source version or changing compiler flags), install and activate [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) (`emcc` / `em++` in `PATH`), [Rust](https://rustup.rs/) (`cargo` / `rustup` in `PATH`), and [CMake](https://cmake.org/download/) (`cmake` in `PATH`, used by NCNN), then run:

```bash
./build-wasm-workloads.sh
```

(or `./build-wasm-workloads.sh <workload>` to rebuild a specific workload, or `npm run build:wasm-workloads` from the repository root) and commit the updated files under `src/<workload>/build/`.
