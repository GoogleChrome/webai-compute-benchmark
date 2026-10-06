// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Experimental Meshoptimizer Wasm benchmark (codecbench).
 */

import CodecbenchModule from "../../dist/meshoptimizer/codecbench.mjs";
import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { createSubIteratedSuite } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";

const codecbenchUrl = new URL(
  "../../dist/meshoptimizer/codecbench.wasm",
  import.meta.url,
);

function instantiatePrecompiled(wasmModule) {
  return (imports, successCallback) => {
    const instance = new WebAssembly.Instance(wasmModule, imports);
    successCallback(instance, wasmModule);
    return instance.exports;
  };
}

class MeshoptimizerBenchmark {
  constructor() {
    this.meshoptimizerModule = null;
  }

  async init() {
    console.log(
      "Compiling Meshoptimizer Wasm module (not part of benchmark measurement)...",
    );
    this.meshoptimizerModule = await WebAssembly.compileStreaming(
      fetch(codecbenchUrl),
    );
    console.log(
      "Meshoptimizer Wasm module compiled; starting measured benchmark runs...",
    );
  }

  async run() {
    await CodecbenchModule({
      print: () => {},
      printErr: () => {},
      instantiateWasm: instantiatePrecompiled(this.meshoptimizerModule),
    });
  }
}

const appName = "Meshoptimizer";
const appVersion = "0.25";

try {
  const benchmark = new MeshoptimizerBenchmark();
  await benchmark.init();

  /*--------- Running test suites ---------*/
  const suites = {
    default: createSubIteratedSuite(benchmark, params.subIterationCount),
  };

  const benchmarkConnector = new BenchmarkConnector(
    suites,
    appName,
    appVersion,
  );
  benchmarkConnector.connect();
} catch (error) {
  console.error("Failed to initialize Meshoptimizer benchmark:", error);
  throw error;
}
