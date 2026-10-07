// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Experimental Tract Wasm neural network inference benchmark.
 */

import OnnxMobilenetModule from "../../dist/tract/example-onnx-mobilenet-v2.mjs";
import PytorchResnetModule from "../../dist/tract/example-pytorch-resnet.mjs";
import TfliteMobilenetModule from "../../dist/tract/example-tflite-mobilenet-v3.mjs";
import {
  AsyncBenchmarkStep,
  AsyncBenchmarkSuite,
  BenchmarkConnector,
} from "speedometer-utils/benchmark.mjs";
import { forceLayout } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";

const onnxMobilenetWasmUrl = new URL(
  "../../dist/tract/example_onnx_mobilenet_v2.wasm",
  import.meta.url,
);
const pytorchResnetWasmUrl = new URL(
  "../../dist/tract/example_pytorch_resnet.wasm",
  import.meta.url,
);
const tfliteMobilenetWasmUrl = new URL(
  "../../dist/tract/example_tflite_mobilenet_v3.wasm",
  import.meta.url,
);

const DATA_BASE_URL = new URL("tract/data/", window.location.href);

/**
 * Matches Tract's internal timing output (`println!("time: {total_time:?}")`),
 * which sums model graph optimization (`into_optimized()?.into_runnable()?`)
 * and tensor preprocessing + inference (`model.run(...)`), excluding file I/O
 * and JPEG image decoding.
 */
const TIME_REGEX = /time:\s*([0-9]*\.?[0-9]+)(ms|s)/;

/**
 * Tract sub-benchmarks adapted from wasm-perf/benchmarks/tract/tract.py:
 *
 * A. ONNX MobileNetV2 (example-onnx-mobilenet-v2):
 *   - example-onnx-mobilenet-v2: FP32 ONNX MobileNetV2 inference on
 *     grace_hopper.jpg.
 *   - example-onnx-mobilenet-v2-quantized-qdq: INT8 QuantizeLinear /
 *     DequantizeLinear (QDQ) ONNX MobileNetV2 inference.
 *   - example-onnx-mobilenet-v2-quantized-qo: INT8 QOperator (integer ops)
 *     ONNX MobileNetV2 inference.
 *
 * B. PyTorch-exported ONNX ResNet (example-pytorch-resnet):
 *   - example-pytorch-resnet: FP32 ONNX ResNet inference on elephants.jpg.
 *   - example-pytorch-resnet-quantized-qdq: INT8 QDQ ONNX ResNet inference.
 *   - example-pytorch-resnet-quantized-qo: INT8 QOperator ONNX ResNet
 *     inference.
 *
 * C. TFLite MobileNetV3 (example-tflite-mobilenet-v3):
 *   - example-tflite-mobilenet-v3: FP32 TFLite MobileNetV3-Small inference on
 *     grace_hopper.jpg.
 */
const SUB_BENCHMARKS = [
  {
    name: "example-onnx-mobilenet-v2",
    runnerKey: "onnxMobilenet",
    moduleFactory: OnnxMobilenetModule,
    model: "mobilenetv2-7.onnx",
    image: "grace_hopper.jpg",
  },
  {
    name: "example-onnx-mobilenet-v2-quantized-qdq",
    runnerKey: "onnxMobilenet",
    moduleFactory: OnnxMobilenetModule,
    model: "mobilenetv2-7-qdq.onnx",
    image: "grace_hopper.jpg",
  },
  {
    name: "example-onnx-mobilenet-v2-quantized-qo",
    runnerKey: "onnxMobilenet",
    moduleFactory: OnnxMobilenetModule,
    model: "mobilenetv2-7-qo.onnx",
    image: "grace_hopper.jpg",
  },
  {
    name: "example-pytorch-resnet",
    runnerKey: "pytorchResnet",
    moduleFactory: PytorchResnetModule,
    model: "resnet.onnx",
    image: "elephants.jpg",
  },
  {
    name: "example-pytorch-resnet-quantized-qdq",
    runnerKey: "pytorchResnet",
    moduleFactory: PytorchResnetModule,
    model: "resnet-qdq.onnx",
    image: "elephants.jpg",
  },
  {
    name: "example-pytorch-resnet-quantized-qo",
    runnerKey: "pytorchResnet",
    moduleFactory: PytorchResnetModule,
    model: "resnet-qo.onnx",
    image: "elephants.jpg",
  },
  {
    name: "example-tflite-mobilenet-v3",
    runnerKey: "tfliteMobilenet",
    moduleFactory: TfliteMobilenetModule,
    model: "mobilenet_v3_small_100_224.tflite",
    image: "grace_hopper.jpg",
  },
];

function instantiatePrecompiled(wasmModule) {
  return (imports, successCallback) => {
    WebAssembly.instantiate(wasmModule, imports).then((instance) => {
      successCallback(instance, wasmModule);
    });
    return {};
  };
}

async function fetchUint8Array(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

class TractBenchmark {
  constructor() {
    this.wasmModules = {};
    this.dataFiles = new Map();
  }

  async init() {
    console.log(
      "Compiling Tract Wasm modules and loading models/images (not part of benchmark measurement)...",
    );

    const uniqueFiles = new Set();
    for (const { model, image } of SUB_BENCHMARKS) {
      uniqueFiles.add(model);
      uniqueFiles.add(image);
    }

    const [onnxMobilenet, pytorchResnet, tfliteMobilenet] = await Promise.all([
      WebAssembly.compileStreaming(fetch(onnxMobilenetWasmUrl)),
      WebAssembly.compileStreaming(fetch(pytorchResnetWasmUrl)),
      WebAssembly.compileStreaming(fetch(tfliteMobilenetWasmUrl)),
      ...Array.from(uniqueFiles).map(async (filename) => {
        const bytes = await fetchUint8Array(new URL(filename, DATA_BASE_URL));
        this.dataFiles.set(filename, bytes);
      }),
    ]);

    this.wasmModules = {
      onnxMobilenet,
      pytorchResnet,
      tfliteMobilenet,
    };

    console.log(
      "Tract Wasm modules and models loaded; starting measured benchmark runs...",
    );
  }

  async runSubBenchmark({ name, runnerKey, moduleFactory, model, image }) {
    console.log(`Running ${name}...`);
    const wasmModule = this.wasmModules[runnerKey];
    const modelBytes = this.dataFiles.get(model);
    const imageBytes = this.dataFiles.get(image);

    let stdout = "";
    await moduleFactory({
      arguments: [`/${model}`, `/${image}`],
      preRun: [
        (mod) => {
          mod.FS.writeFile(`/${model}`, modelBytes);
          mod.FS.writeFile(`/${image}`, imageBytes);
        },
      ],
      print: (line) => {
        console.log(`  [${name}] ${line}`);
        stdout += line + "\n";
      },
      printErr: (line) => console.error(`  [${name}] ${line}`),
      instantiateWasm: instantiatePrecompiled(wasmModule),
    });

    const match = stdout.match(TIME_REGEX);
    if (!match) {
      throw new Error(`Failed to parse Tract timing output for ${name}:\n${stdout}`);
    }

    let timeMs = Number(match[1]);
    const scale = match[2];
    if (scale === "s") {
      timeMs *= 1000;
    }

    return {
      tests: {},
      total: timeMs,
    };
  }
}

function createTractSubSuite(benchmark, subBenchmark, subIterationCount) {
  const steps = Array.from({ length: subIterationCount }, (_, i) => {
    let parsedResult = null;
    const step = new AsyncBenchmarkStep(
      `sub-iter-${i + 1}`,
      async () => {
        forceLayout();
        parsedResult = await benchmark.runSubBenchmark(subBenchmark);
        forceLayout();
      },
      { measureAsync: false },
    );
    return {
      name: step.name,
      async runAndRecord(stepParams, suite, recordCallback) {
        await step.runAndRecord(stepParams, suite, recordCallback);
        return parsedResult;
      },
    };
  });
  return new AsyncBenchmarkSuite(subBenchmark.name, steps);
}

const appName = "Tract";
const appVersion = "0.22.0";

try {
  const benchmark = new TractBenchmark();
  await benchmark.init();

  const steps = SUB_BENCHMARKS.map((subBenchmark) => {
    const subSuite = createTractSubSuite(
      benchmark,
      subBenchmark,
      params.subIterationCount,
    );
    return {
      name: subBenchmark.name,
      async runAndRecord(stepParams) {
        const { result } = await subSuite.runAndRecord(stepParams);
        return result;
      },
    };
  });

  /*--------- Running test suites ---------*/
  const suites = {
    default: new AsyncBenchmarkSuite("default", steps),
  };

  const benchmarkConnector = new BenchmarkConnector(
    suites,
    appName,
    appVersion,
  );
  benchmarkConnector.connect();
} catch (error) {
  console.error("Failed to initialize Tract benchmark:", error);
  throw error;
}
