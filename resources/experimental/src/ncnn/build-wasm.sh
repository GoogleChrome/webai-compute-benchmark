#!/bin/bash
# Copyright 2026 Google LLC
#
# Use of this source code is governed by a BSD-style
# license that can be found in the LICENSE file or at
# https://developers.google.com/open-source/licenses/bsd
#
# Adapted from wasm-perf/benchmarks/ncnn/build-wasm.sh:
# SPDX-FileCopyrightText: Copyright 2026 Arm Limited and/or its affiliates <open-source-office@arm.com>
# SPDX-License-Identifier: BSD-3-Clause

set -euo pipefail

NCNN_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
EXPERIMENTAL_DIR="$( cd "$NCNN_DIR/../.." >/dev/null 2>&1 && pwd )"
SRC_DIR="$NCNN_DIR/src"
NCNN_SRC="$SRC_DIR/ncnn"
BUILD_DIR="$SRC_DIR/build"
OUT_DIR="$EXPERIMENTAL_DIR/dist/ncnn"
OUT_DATA_DIR="$OUT_DIR/data"

# Must match SUB_BENCHMARKS in benchmark.mjs. This is the subset selected in
# wasm-perf/benchmarks/ncnn/ncnn.py to cover a range of profiles while keeping
# run time down.
PARAM_FILES=(
  "alexnet.param"
  "efficientnetv2_b0.param"
  "googlenet.param"
  "googlenet_int8.param"
  "mobilenet_v3.param"
  "regnety_400m.param"
  "resnet18.param"
  "resnet50_int8.param"
  "squeezenet_ssd.param"
  "squeezenet_ssd_int8.param"
  "yolov4-tiny.param"
)

all_outputs_exist() {
  [[ -f "$OUT_DIR/benchncnn.mjs" && -f "$OUT_DIR/benchncnn.wasm" ]] || return 1
  for f in "${PARAM_FILES[@]}"; do
    [[ -f "$OUT_DATA_DIR/$f" ]] || return 1
  done
  return 0
}

if [[ "${1:-}" != "--force" ]] && all_outputs_exist; then
  echo "NCNN Wasm binary and param files already exist in $OUT_DIR. Skipping build."
  exit 0
fi

CXX="${CXX:-em++}"
for cmd in "$CXX" emcmake cmake curl unzip patch; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: $cmd not found. Please activate emsdk (em++/emcmake) and install cmake, curl, unzip and patch." >&2
    exit 1
  fi
done

NCNN_VERSION="20241226"

if [[ ! -f "$NCNN_SRC/.patched" ]]; then
  echo "Downloading NCNN ($NCNN_VERSION)..."
  rm -rf "$NCNN_SRC" "$BUILD_DIR"
  mkdir -p "$NCNN_SRC"
  ZIP_NAME="ncnn-$NCNN_VERSION-full-source.zip"
  curl -LSfs "https://github.com/Tencent/ncnn/releases/download/$NCNN_VERSION/$ZIP_NAME" \
    -o "$SRC_DIR/$ZIP_NAME"
  unzip -q "$SRC_DIR/$ZIP_NAME" -d "$NCNN_SRC"
  rm "$SRC_DIR/$ZIP_NAME"
  # benchncnn mounts NODEFS under Emscripten, which is unavailable on the web.
  patch -i "$NCNN_DIR/ncnn.patch" -p 1 --directory="$NCNN_SRC"
  touch "$NCNN_SRC/.patched"
fi

# wasm-perf builds ncnn with -O3 and -ffast-math (ncnn's CMake always enables
# fast-math) plus its common set of Wasm target features.
DEFAULT_CFLAGS=(
  -O3
  -ffast-math
  -fno-exceptions
  -mbulk-memory
  -mextended-const
  -mfp16
  -mmultivalue
  -mmutable-globals
  -mnontrapping-fptoint
  -mrelaxed-simd
  -msign-ext
  -msimd128
)
CFLAGS="${CFLAGS:-${DEFAULT_CFLAGS[*]}}"

EM_LDFLAGS=(
  -sENVIRONMENT=web
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=256MB
  -sFORCE_FILESYSTEM=1
  -sEXPORTED_RUNTIME_METHODS=FS,callMain
)

# Only the ncnn library is built through CMake. benchncnn is linked separately
# below so we control the Emscripten link settings for the browser (the
# upstream benchmark target links nodefs.js).
#
# Threads/OpenMP are disabled to match wasm-perf's single-threaded run.
# NCNN_RUNTIME_CPU is OFF because Emscripten has no runtime-dispatched ISA
# variants; SIMD comes from NCNN_SSE2 which ncnn maps to -msimd128 under
# Emscripten.
echo "Configuring NCNN with Emscripten..."
emcmake cmake \
  -B "$BUILD_DIR" \
  -S "$NCNN_SRC" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
  -DCMAKE_C_FLAGS="$CFLAGS" \
  -DCMAKE_CXX_FLAGS="$CFLAGS" \
  -DNCNN_OPENMP=OFF \
  -DNCNN_SIMPLEOMP=OFF \
  -DNCNN_THREADS=OFF \
  -DNCNN_BENCHMARK=OFF \
  -DNCNN_RUNTIME_CPU=OFF \
  -DNCNN_SSE2=ON \
  -DNCNN_VULKAN=OFF \
  -DNCNN_BUILD_BENCHMARK=OFF \
  -DNCNN_BUILD_TOOLS=OFF \
  -DNCNN_BUILD_EXAMPLES=OFF \
  -DNCNN_BUILD_TESTS=OFF

echo "Building NCNN library..."
cmake --build "$BUILD_DIR" --target ncnn --parallel

mkdir -p "$OUT_DIR" "$OUT_DATA_DIR"

echo "Linking benchncnn.mjs + benchncnn.wasm with Emscripten..."
"$CXX" $CFLAGS "${EM_LDFLAGS[@]}" \
  "$NCNN_SRC/benchmark/benchncnn.cpp" \
  -I "$NCNN_SRC/src" \
  -I "$BUILD_DIR/src" \
  "$BUILD_DIR/src/libncnn.a" \
  -o "$OUT_DIR/benchncnn.mjs"

for f in "${PARAM_FILES[@]}"; do
  cp "$NCNN_SRC/benchmark/$f" "$OUT_DATA_DIR/$f"
done

echo "Successfully built NCNN Wasm module and param files in $OUT_DIR"
