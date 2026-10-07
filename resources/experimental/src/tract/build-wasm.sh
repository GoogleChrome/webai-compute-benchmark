#!/bin/bash
# Copyright 2026 Google LLC
#
# Use of this source code is governed by a BSD-style
# license that can be found in the LICENSE file or at
# https://developers.google.com/open-source/licenses/bsd
#
# Adapted from wasm-perf/benchmarks/tract/build-wasm.sh:
# SPDX-FileCopyrightText: Copyright 2026 Arm Limited and/or its affiliates <open-source-office@arm.com>
# SPDX-License-Identifier: BSD-3-Clause

set -euo pipefail

TRACT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
EXPERIMENTAL_DIR="$( cd "$TRACT_DIR/../.." >/dev/null 2>&1 && pwd )"
SRC_DIR="$TRACT_DIR/src"
TRACT_SRC="$SRC_DIR/tract"
TARGET_DIR="$SRC_DIR/target"
OUT_DIR="$EXPERIMENTAL_DIR/dist/tract"
DATA_CACHE_DIR="$SRC_DIR/data"
OUT_DATA_DIR="$OUT_DIR/data"

DATA_FILES=(
  "elephants.jpg"
  "grace_hopper.jpg"
  "mobilenet_v3_small_100_224.tflite"
  "mobilenetv2-7-qdq.onnx"
  "mobilenetv2-7-qo.onnx"
  "mobilenetv2-7.onnx"
  "resnet-qdq.onnx"
  "resnet-qo.onnx"
  "resnet.onnx"
)

WASM_DATA_BASE_URL="https://gitlab.arm.com/runtimes/wasm-perf/-/raw/main/benchmarks/tract/data"

all_outputs_exist() {
  local required=(
    "$OUT_DIR/example-onnx-mobilenet-v2.mjs"
    "$OUT_DIR/example_onnx_mobilenet_v2.wasm"
    "$OUT_DIR/example-pytorch-resnet.mjs"
    "$OUT_DIR/example_pytorch_resnet.wasm"
    "$OUT_DIR/example-tflite-mobilenet-v3.mjs"
    "$OUT_DIR/example_tflite_mobilenet_v3.wasm"
  )
  for f in "${required[@]}"; do
    [[ -f "$f" ]] || return 1
  done
  for f in "${DATA_FILES[@]}"; do
    [[ -f "$OUT_DATA_DIR/$f" ]] || return 1
  done
  return 0
}

if [[ "${1:-}" != "--force" ]] && all_outputs_exist; then
  echo "Tract Wasm binaries and data files already exist in $OUT_DIR. Skipping build."
  exit 0
fi

for cmd in cargo rustup emcc; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: $cmd not found. Please ensure Rust (cargo/rustup) and Emscripten (emcc) are in PATH." >&2
    exit 1
  fi
done

rustup target add wasm32-unknown-emscripten

TRACT_VERSION="0.22.0"

if [[ ! -f "$TRACT_SRC/.patched" ]]; then
  echo "Downloading Tract ($TRACT_VERSION)..."
  rm -rf "$TRACT_SRC"
  mkdir -p "$TRACT_SRC"
  curl -LSfs "https://github.com/sonos/tract/archive/refs/tags/$TRACT_VERSION.tar.gz" \
    | tar --strip-components=1 -xz -C "$TRACT_SRC"
  patch -i "$TRACT_DIR/tract.patch" -p 1 --directory="$TRACT_SRC"
  touch "$TRACT_SRC/.patched"
fi

DEFAULT_RUSTFLAGS=(
  -C opt-level=2
  -C target-feature=+bulk-memory
  -C target-feature=+extended-const
  -C target-feature=+fp16
  -C target-feature=+multivalue
  -C target-feature=+mutable-globals
  -C target-feature=+nontrapping-fptoint
  -C target-feature=+relaxed-simd
  -C target-feature=+sign-ext
  -C target-feature=+simd128
  -C link-arg=-sENVIRONMENT=web
  -C link-arg=-sMODULARIZE=1
  -C link-arg=-sEXPORT_ES6=1
  -C link-arg=-sALLOW_MEMORY_GROWTH=1
  -C link-arg=-sFORCE_FILESYSTEM=1
  -C link-arg=-sEXPORTED_RUNTIME_METHODS=FS,callMain
)

export CARGO_TARGET_WASM32_UNKNOWN_EMSCRIPTEN_RUSTFLAGS="${RUSTFLAGS:-${DEFAULT_RUSTFLAGS[*]}}"
export CARGO_TARGET_DIR="$TARGET_DIR"

echo "Compiling Tract example binaries to Wasm with Emscripten..."
cargo build --target wasm32-unknown-emscripten --release \
  --manifest-path="$TRACT_SRC/Cargo.toml" \
  --bin example-onnx-mobilenet-v2 \
  --bin example-tflite-mobilenet-v3 \
  --bin example-pytorch-resnet

mkdir -p "$OUT_DIR" "$DATA_CACHE_DIR" "$OUT_DATA_DIR"

RELEASE_DIR="$TARGET_DIR/wasm32-unknown-emscripten/release"
for bin in example-onnx-mobilenet-v2 example-pytorch-resnet example-tflite-mobilenet-v3; do
  wasm_name="${bin//-/_}.wasm"
  cp "$RELEASE_DIR/$bin.js" "$OUT_DIR/$bin.mjs"
  cp "$RELEASE_DIR/$wasm_name" "$OUT_DIR/$wasm_name"
done

for f in "${DATA_FILES[@]}"; do
  if [[ ! -f "$DATA_CACHE_DIR/$f" ]]; then
    echo "Downloading Tract data file $f..."
    curl -LSfs "$WASM_DATA_BASE_URL/$f" -o "$DATA_CACHE_DIR/$f.tmp"
    mv "$DATA_CACHE_DIR/$f.tmp" "$DATA_CACHE_DIR/$f"
  fi
  cp "$DATA_CACHE_DIR/$f" "$OUT_DATA_DIR/$f"
done

echo "Successfully built Tract Wasm modules and data in $OUT_DIR"
