
Using [gemma.cpp.js](https://github.com/brendandahl/gemma.cpp.js).

Build steps:

```bash
emcmake cmake -DCMAKE_BUILD_TYPE=Release -DENVIRONMENT=web -B build
emmake make -j -C build
cp build/gemma_cpp_js.* <path-to-webai-compute-benchmark>/resources/experimental/dist/gemma/build/
```
