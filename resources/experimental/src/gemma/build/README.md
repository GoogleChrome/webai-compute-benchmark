
Using [gemma.cpp.js](https://github.com/brendandahl/gemma.cpp.js).

Build steps:

```bash
emcmake cmake -DCMAKE_BUILD_TYPE=Release -DENVIRONMENT=web -B build
emmake make -j -C build
cp build/gemma_cpp_js.* <path-to-webai-compute-benchmark>/resources/experimental/dist/gemma/build/
```

Model download:

[Download gemma 3.0 270m it sfp](https://www.kaggle.com/models/google/gemma-3/gemmaCpp/3.0-270m-it-sfp) and place it in `resources/experimental/dist/gemma/models/gemma/`.
