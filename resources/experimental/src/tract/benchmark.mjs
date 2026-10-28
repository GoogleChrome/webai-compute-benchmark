// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Experimental Tract Wasm neural network inference benchmark.
 */

import OnnxMobilenetModule from "./build/example-onnx-mobilenet-v2.mjs";
import PytorchResnetModule from "./build/example-pytorch-resnet.mjs";
import TfliteMobilenetModule from "./build/example-tflite-mobilenet-v3.mjs";
import { AsyncBenchmarkSuite, BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { createSubIteratedSteps, instantiatePrecompiled } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";

const WASM_URLS = {
    onnxMobilenet: new URL("./build/example_onnx_mobilenet_v2.wasm", import.meta.url),
    pytorchResnet: new URL("./build/example_pytorch_resnet.wasm", import.meta.url),
    tfliteMobilenet: new URL("./build/example_tflite_mobilenet_v3.wasm", import.meta.url),
};

const DATA_URLS = {
    "elephants.jpg": new URL("./build/data/elephants.jpg", import.meta.url),
    "grace_hopper.jpg": new URL("./build/data/grace_hopper.jpg", import.meta.url),
    "mobilenet_v3_small_100_224.tflite": new URL("./build/data/mobilenet_v3_small_100_224.tflite", import.meta.url),
    "mobilenetv2-7-qdq.onnx": new URL("./build/data/mobilenetv2-7-qdq.onnx", import.meta.url),
    "mobilenetv2-7-qo.onnx": new URL("./build/data/mobilenetv2-7-qo.onnx", import.meta.url),
    "mobilenetv2-7.onnx": new URL("./build/data/mobilenetv2-7.onnx", import.meta.url),
    "resnet-qdq.onnx": new URL("./build/data/resnet-qdq.onnx", import.meta.url),
    "resnet-qo.onnx": new URL("./build/data/resnet-qo.onnx", import.meta.url),
    "resnet.onnx": new URL("./build/data/resnet.onnx", import.meta.url),
};

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
const MODEL_SUITES = {
    "onnx-mobilenet-v2": [
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
    ],
    "pytorch-resnet": [
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
    ],
    "tflite-mobilenet-v3": [
        {
            name: "example-tflite-mobilenet-v3",
            runnerKey: "tfliteMobilenet",
            moduleFactory: TfliteMobilenetModule,
            model: "mobilenet_v3_small_100_224.tflite",
            image: "grace_hopper.jpg",
        },
    ],
};

async function fetchUint8Array(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return new Uint8Array(await response.arrayBuffer());
}

class TractBenchmark {
    constructor(subBenchmarks) {
        this.subBenchmarks = subBenchmarks;
        this.wasmModules = {};
        this.dataFiles = new Map();
    }

    async init() {
        console.log("Compiling Tract Wasm module and loading models/images (not part of benchmark measurement)...");

        const runnerKeys = [...new Set(this.subBenchmarks.map(({ runnerKey }) => runnerKey))];
        const dataFilenames = [...new Set(this.subBenchmarks.flatMap(({ model, image }) => [model, image]))];

        await Promise.all([
            ...runnerKeys.map(async (runnerKey) => {
                this.wasmModules[runnerKey] = await WebAssembly.compileStreaming(fetch(WASM_URLS[runnerKey]));
            }),
            ...dataFilenames.map(async (filename) => {
                const bytes = await fetchUint8Array(DATA_URLS[filename]);
                this.dataFiles.set(filename, bytes);
            }),
        ]);

        console.log("Tract Wasm module and models loaded; starting measured benchmark runs...");
    }

    async runSubBenchmark({ name, runnerKey, moduleFactory, model, image }) {
        console.log(`Running ${name}...`);
        const wasmModule = this.wasmModules[runnerKey];
        const modelBytes = this.dataFiles.get(model);
        const imageBytes = this.dataFiles.get(image);

        let stdout = "";
        await new Promise((resolve, reject) => {
            moduleFactory({
                arguments: [`/${model}`, `/${image}`],
                preRun: [
                    (mod) => {
                        mod.FS.writeFile(`/${model}`, modelBytes);
                        mod.FS.writeFile(`/${image}`, imageBytes);
                    },
                ],
                print: (line) => {
                    console.log(`  [${name}] ${line}`);
                    stdout += `${line}\n`;
                },
                printErr: (line) => console.error(`  [${name}] ${line}`),
                instantiateWasm: instantiatePrecompiled(wasmModule, reject),
            }).then(resolve, reject);
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

// TODO(ryandiaz) We may want to report the total as a geomean
// so one sub benchmark doesn't dominate.
function createSuiteSteps(benchmark, subBenchmarks, subIterationCount) {
    return subBenchmarks.map((subBenchmark) => {
        const subSuite = new AsyncBenchmarkSuite(
            subBenchmark.name,
            createSubIteratedSteps(() => benchmark.runSubBenchmark(subBenchmark), subIterationCount)
        );
        return {
            name: subBenchmark.name,
            async runAndRecord(stepParams, _parentSuite, _parentRecord, onProgress) {
                const { result } = await subSuite.runAndRecord(stepParams, onProgress);
                return result;
            },
        };
    });
}

const appVersion = "0.22.0";

/**
 * Wires up the benchmark for one of the model suites in `MODEL_SUITES`.
 *
 * @param {keyof typeof MODEL_SUITES} suiteName
 */
export async function initializeTractBenchmark(suiteName) {
    const subBenchmarks = MODEL_SUITES[suiteName];
    if (!subBenchmarks) {
        throw new Error(`Unknown Tract suite "${suiteName}", expected one of: ${Object.keys(MODEL_SUITES).join(", ")}`);
    }

    const appName = `Tract-${suiteName}`;
    try {
        const benchmark = new TractBenchmark(subBenchmarks);
        await benchmark.init();

        /*--------- Running test suites ---------*/
        const suites = {
            default: new AsyncBenchmarkSuite("default", createSuiteSteps(benchmark, subBenchmarks, params.subIterationCount)),
        };

        const benchmarkConnector = new BenchmarkConnector(suites, appName, appVersion);
        benchmarkConnector.connect();
    } catch (error) {
        console.error(`Failed to initialize ${appName} benchmark:`, error);
        throw error;
    }
}
