#!/bin/bash
# Copyright 2026 Google LLC
#
# Use of this source code is governed by a BSD-style
# license that can be found in the LICENSE file or at
# https://developers.google.com/open-source/licenses/bsd
#
# Adapted from wasm-perf/benchmarks/meshoptimizer/build-wasm.sh:
# SPDX-FileCopyrightText: Copyright 2026 Arm Limited and/or its affiliates <open-source-office@arm.com>
# SPDX-License-Identifier: BSD-3-Clause

set -e

MESHOPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
EXPERIMENTAL_DIR="$( cd "$MESHOPT_DIR/../.." >/dev/null 2>&1 && pwd )"
SRC_DIR="$MESHOPT_DIR/src"
MESHOPT_SRC="$SRC_DIR/meshoptimizer"
OUT_DIR="$EXPERIMENTAL_DIR/dist/meshoptimizer"

if [[ "$1" != "--force" && -f "$OUT_DIR/codecbench.mjs" && -f "$OUT_DIR/codecbench.wasm" ]]; then
  echo "Meshoptimizer Wasm binaries already exist in $OUT_DIR. Skipping build."
  exit 0
fi

mkdir -p "$SRC_DIR"

CXX="${CXX:-em++}"
if ! command -v "$CXX" >/dev/null 2>&1; then
  echo "Error: $CXX not found. Please activate emsdk or set CXX." >&2
  exit 1
fi

DEFAULT_CFLAGS=(
  -O2
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
  -sEXPORTED_RUNTIME_METHODS=callMain
  -sALLOW_MEMORY_GROWTH=1
)

MESHOPT_VERSION="v0.25"

if [[ ! -d "$MESHOPT_SRC" ]]; then
  echo "Downloading Meshoptimizer ($MESHOPT_VERSION)..."
  mkdir -p "$MESHOPT_SRC"
  curl -LSs "https://github.com/zeux/meshoptimizer/archive/refs/tags/$MESHOPT_VERSION.tar.gz" \
    | tar --strip-components=1 -xz -C "$MESHOPT_SRC"
fi

mkdir -p "$OUT_DIR"

echo "Compiling codecbench.mjs + codecbench.wasm with Emscripten..."
"$CXX" $CFLAGS -DNDEBUG "${EM_LDFLAGS[@]}" \
  "$MESHOPT_SRC"/src/*.cpp \
  "$MESHOPT_SRC"/tools/codecbench.cpp \
  -o "$OUT_DIR/codecbench.mjs"

echo "Successfully built Meshoptimizer Wasm module in $OUT_DIR"
