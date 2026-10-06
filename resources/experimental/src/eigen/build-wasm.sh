#!/bin/bash
# Copyright 2026 Google LLC
#
# Use of this source code is governed by a BSD-style
# license that can be found in the LICENSE file or at
# https://developers.google.com/open-source/licenses/bsd
#
# Adapted from wasm-perf/benchmarks/eigen/build-wasm.sh:
# SPDX-FileCopyrightText: Copyright 2026 Arm Limited and/or its affiliates <open-source-office@arm.com>
# SPDX-License-Identifier: BSD-3-Clause

set -e

EIGEN_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
EXPERIMENTAL_DIR="$( cd "$EIGEN_DIR/../.." >/dev/null 2>&1 && pwd )"
SRC_DIR="$EIGEN_DIR/src"
EIGEN_SRC="$SRC_DIR/eigen"
BENCH="$EIGEN_SRC/bench"
OUT_DIR="$EXPERIMENTAL_DIR/dist/eigen"

if [[ "$1" != "--force" && -f "$OUT_DIR/eig33.mjs" && -f "$OUT_DIR/eig33.wasm" && -f "$OUT_DIR/geometry.mjs" && -f "$OUT_DIR/geometry.wasm" ]]; then
  echo "Eigen Wasm binaries already exist in $OUT_DIR. Skipping build."
  exit 0
fi

mkdir -p "$SRC_DIR"

if [[ -z "$CXX" ]]; then
  if command -v em++ >/dev/null 2>&1; then
    CXX="em++"
  elif [[ -n "$EMSDK" && -x "$EMSDK/upstream/emscripten/em++" ]]; then
    CXX="$EMSDK/upstream/emscripten/em++"
  elif [[ -x "$HOME/dev/emsdk/upstream/emscripten/em++" ]]; then
    CXX="$HOME/dev/emsdk/upstream/emscripten/em++"
  elif [[ -x "$SRC_DIR/emsdk/upstream/emscripten/em++" ]]; then
    CXX="$SRC_DIR/emsdk/upstream/emscripten/em++"
  else
    echo "em++ not found; installing emsdk into $SRC_DIR/emsdk..."
    git clone --depth 1 https://github.com/emscripten-core/emsdk.git "$SRC_DIR/emsdk"
    "$SRC_DIR/emsdk/emsdk" install latest
    "$SRC_DIR/emsdk/emsdk" activate latest
    CXX="$SRC_DIR/emsdk/upstream/emscripten/em++"
  fi
fi

DEFAULT_CFLAGS=(
  -O3
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
  -sENVIRONMENT=web
  -sMODULARIZE=1
  -sEXPORT_ES6=1
)
CFLAGS="${CFLAGS:-${DEFAULT_CFLAGS[*]}}"

if [[ ! -d "$EIGEN_SRC" ]]; then
  echo "Downloading Eigen source..."
  mkdir -p "$EIGEN_SRC"
  curl -LSs "https://gitlab.com/libeigen/eigen/-/archive/e0a59e5a66e6d16fa93ab4f5e48bf539205e837f/eigen-e0a59e5a66e6d16fa93ab4f5e48bf539205e837f.tar.gz" \
    | tar --strip-components=1 -xz -C "$EIGEN_SRC"
fi

mkdir -p "$OUT_DIR"

echo "Compiling eig33.mjs + eig33.wasm with Emscripten..."
$CXX $CFLAGS \
  "$BENCH/eig33.cpp" \
  -I "$EIGEN_SRC" \
  -o "$OUT_DIR/eig33.mjs"

echo "Compiling geometry.mjs + geometry.wasm with Emscripten..."
$CXX $CFLAGS \
  "$BENCH/geometry.cpp" \
  -I "$EIGEN_SRC" \
  -o "$OUT_DIR/geometry.mjs"

echo "Successfully built Eigen Wasm modules in $OUT_DIR"
