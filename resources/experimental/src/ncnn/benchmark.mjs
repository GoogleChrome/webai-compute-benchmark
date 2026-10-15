// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Experimental NCNN Wasm neural network inference benchmark (benchncnn).
 */

import BenchncnnModule from "./build/benchncnn.mjs";
import { AsyncBenchmarkStep, AsyncBenchmarkSuite, BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { forceLayout } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";

const benchncnnWasmUrl = new URL("./build/benchncnn.wasm", import.meta.url);

const PARAM_URLS = {
    "efficientnetv2_b0.param": new URL("./build/data/efficientnetv2_b0.param", import.meta.url),
    "resnet50_int8.param": new URL("./build/data/resnet50_int8.param", import.meta.url),
    "yolov4-tiny.param": new URL("./build/data/yolov4-tiny.param", import.meta.url),
};

/**
 * Matches benchncnn's per-model summary line written to stderr:
 *   `<model>  min = <ms>  max = <ms>  avg = <ms>`
 * The timing covers only `Extractor` input + extract (inference) for the timed
 * loop iterations, excluding param parsing, weight setup and the warm-up
 * iterations.
 */
const AVG_REGEX = /avg =\s+([0-9]*\.?[0-9]+)/;

/**
 * benchncnn positional arguments, matching wasm-perf/benchmarks/ncnn/ncnn.py:
 *   [loop count] [num threads] [powersave] [gpu device] [cooling down]
 * benchncnn always runs 8 untimed warm-up inferences before the timed loop.
 */
const LOOP_COUNT = "1";
const NUM_THREADS = "1";
const POWERSAVE = "0";
const GPU_DEVICE = "-1";
const COOLING_DOWN = "0";

/**
 * Weights are not loaded from disk: benchncnn uses an all-zero DataReader, so
 * only the network topology (`.param`) files are needed. Input tensors are
 * filled with a constant value.
 *
 * Each model is exposed as its own top-level suite (see the `<model>.mjs`
 * entry points). The three models were chosen to cover distinct Wasm SIMD
 * profiles with minimal overlap:
 *   - resnet50_int8: the only INT8-quantized model; exercises ncnn's integer
 *     quantize / int8 GEMM / dequantize kernels.
 *   - efficientnetv2_b0: the broadest FP32 op mix (fused-MBConv dense 3x3
 *     convs, depthwise MBConv, squeeze-and-excitation, Swish/exp).
 *   - yolov4-tiny: compute-bound dense FP32 3x3 convolution at 416x416 with
 *     large activations (cache/memory pressure) and detection ops.
 */
const MODELS = {
    resnet50_int8: { name: "resnet50_int8", shape: "[224,224,3]" },
    efficientnetv2_b0: { name: "efficientnetv2_b0", shape: "[224,224,3]" },
    "yolov4-tiny": { name: "yolov4-tiny", shape: "[416,416,3]" },
};

function instantiatePrecompiled(wasmModule) {
    return (imports, successCallback) => {
        const instance = new WebAssembly.Instance(wasmModule, imports);
        successCallback(instance, wasmModule);
        return instance.exports;
    };
}

async function fetchUint8Array(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return new Uint8Array(await response.arrayBuffer());
}

class NcnnBenchmark {
    constructor(model) {
        this.model = model;
        this.ncnnModule = null;
        this.paramBytes = null;
    }

    async init() {
        console.log("Compiling NCNN Wasm module and loading param file (not part of benchmark measurement)...");

        const paramFile = `${this.model.name}.param`;
        const [ncnnModule, paramBytes] = await Promise.all([WebAssembly.compileStreaming(fetch(benchncnnWasmUrl)), fetchUint8Array(PARAM_URLS[paramFile])]);
        this.ncnnModule = ncnnModule;
        this.paramBytes = paramBytes;

        console.log("NCNN Wasm module and param file loaded; starting measured benchmark runs...");
    }

    async runSubBenchmark({ name, shape }) {
        console.log(`Running ${name}...`);
        const paramFile = `${name}.param`;
        const paramBytes = this.paramBytes;

        // benchncnn reports its results on stderr.
        let stderr = "";
        await BenchncnnModule({
            arguments: [LOOP_COUNT, NUM_THREADS, POWERSAVE, GPU_DEVICE, COOLING_DOWN, `param=/${paramFile}`, `shape=${shape}`],
            preRun: [
                (mod) => {
                    mod.FS.writeFile(`/${paramFile}`, paramBytes);
                },
            ],
            print: (line) => console.log(`  [${name}] ${line}`),
            printErr: (line) => {
                console.log(`  [${name}] ${line}`);
                stderr += `${line}\n`;
            },
            instantiateWasm: instantiatePrecompiled(this.ncnnModule),
        });

        const match = stderr.match(AVG_REGEX);
        if (!match) {
            throw new Error(`Failed to parse benchncnn output for ${name}:\n${stderr}`);
        }

        return {
            tests: {},
            total: Number(match[1]),
        };
    }
}

function createNcnnSubSuite(benchmark, subBenchmark, subIterationCount) {
    const steps = Array.from({ length: subIterationCount }, (_, i) => {
        let parsedResult = null;
        const step = new AsyncBenchmarkStep(
            `sub-iter-${i + 1}`,
            async () => {
                forceLayout();
                parsedResult = await benchmark.runSubBenchmark(subBenchmark);
                forceLayout();
            },
            { measureAsync: false }
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

const appVersion = "20241226";

/**
 * Wires up the benchmark for one of the models in `MODELS`.
 *
 * @param {keyof typeof MODELS} modelName
 */
export async function initializeNcnnBenchmark(modelName) {
    const model = MODELS[modelName];
    if (!model) {
        throw new Error(`Unknown NCNN model "${modelName}", expected one of: ${Object.keys(MODELS).join(", ")}`);
    }

    const appName = `NCNN-${modelName}`;
    try {
        const benchmark = new NcnnBenchmark(model);
        await benchmark.init();

        const subSuite = createNcnnSubSuite(benchmark, model, params.subIterationCount);
        const steps = [
            {
                name: model.name,
                async runAndRecord(stepParams, _parentSuite, _parentRecord, onProgress) {
                    const { result } = await subSuite.runAndRecord(stepParams, onProgress);
                    return result;
                },
            },
        ];

        /*--------- Running test suites ---------*/
        const suites = {
            default: new AsyncBenchmarkSuite("default", steps),
        };

        const benchmarkConnector = new BenchmarkConnector(suites, appName, appVersion);
        benchmarkConnector.connect();
    } catch (error) {
        console.error(`Failed to initialize ${appName} benchmark:`, error);
        throw error;
    }
}
