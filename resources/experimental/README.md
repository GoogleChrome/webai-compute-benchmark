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
