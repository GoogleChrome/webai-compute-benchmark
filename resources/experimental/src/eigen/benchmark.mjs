// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Experimental Eigen Wasm benchmark (eig33 and geometry).
 */

import Eig33Module from "../../dist/eigen/eig33.mjs";
import GeometryModule from "../../dist/eigen/geometry.mjs";
import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { createSubIteratedSuite } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";

const eig33Url = new URL("../../dist/eigen/eig33.wasm", import.meta.url);
const geometryUrl = new URL("../../dist/eigen/geometry.wasm", import.meta.url);

function instantiatePrecompiled(wasmModule) {
  return (imports, successCallback) => {
    const instance = new WebAssembly.Instance(wasmModule, imports);
    successCallback(instance, wasmModule);
    return instance.exports;
  };
}

class EigenBenchmark {
  constructor() {
    this.eig33Module = null;
    this.geometryModule = null;
  }

  async init() {
    console.log(
      "Compiling Eigen Wasm modules (not part of benchmark measurement)...",
    );
    [this.eig33Module, this.geometryModule] = await Promise.all([
      WebAssembly.compileStreaming(fetch(eig33Url)),
      WebAssembly.compileStreaming(fetch(geometryUrl)),
    ]);
    console.log(
      "Eigen Wasm modules compiled; starting measured benchmark runs...",
    );
  }

  async run() {
    console.log("Running eig33.wasm...");
    await Eig33Module({
      instantiateWasm: instantiatePrecompiled(this.eig33Module),
    });
    console.log("Running geometry.wasm...");
    await GeometryModule({
      instantiateWasm: instantiatePrecompiled(this.geometryModule),
    });
  }
}

const appName = "Eigen";
const appVersion = "0.1.0";

try {
  const benchmark = new EigenBenchmark();
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
  console.error("Failed to initialize Eigen benchmark:", error);
  throw error;
}
