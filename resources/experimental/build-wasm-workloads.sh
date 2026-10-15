#!/bin/bash
# Copyright 2026 Google LLC
#
# Use of this source code is governed by a BSD-style
# license that can be found in the LICENSE file or at
# https://developers.google.com/open-source/licenses/bsd
#
# Rebuilds the Emscripten-compiled Wasm workloads used by the experimental
# benchmarks. The build output is checked into the repository so that
# Emscripten and Rust are NOT required for `npm run build`, CI, or deployments.
#
# Run this manually (with emsdk activated and Rust installed) only when you
# want to refresh the checked-in binaries, e.g. after bumping a source commit
# or compiler flags, then commit the updated files under src/<workload>/build/.
#
# Usage:
#   ./build-wasm-workloads.sh [workload...]

set -euo pipefail

EXPERIMENTAL_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

DEFAULT_WORKLOADS=(
  ggml
  tract
)

WORKLOADS=("${@:-${DEFAULT_WORKLOADS[@]}}")

for workload in "${WORKLOADS[@]}"; do
  script="$EXPERIMENTAL_DIR/src/$workload/build-wasm.sh"
  if [[ ! -f "$script" ]]; then
    echo "Error: Unknown Wasm workload '$workload' ($script not found)." >&2
    exit 1
  fi
  bash "$script"
done

echo "Done. Review and commit the updated build output under src/*/build/."
