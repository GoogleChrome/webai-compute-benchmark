// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Experimental glam-rs Wasm benchmark (criterion benches of glam's linear
 * algebra types, compiled from Rust with Emscripten and split by operation
 * category via criterion's CLI filter regex).
 */

import Affine2Module from "./build/affine2.mjs";
import Affine3Module from "./build/affine3.mjs";
import Mat2Module from "./build/mat2.mjs";
import Mat3Module from "./build/mat3.mjs";
import QuatModule from "./build/quat.mjs";
import Vec2Module from "./build/vec2.mjs";
import Vec4Module from "./build/vec4.mjs";
import { AsyncBenchmarkStep, AsyncBenchmarkSuite, BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { forceLayout } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";

/**
 * glam criterion bench binaries, matching the reduced subset used by
 * `wasm-perf/benchmarks/glam_rs/glam_rs.py`:
 *   - affine2 / affine3: 2D / 3D affine transforms.
 *   - mat2 / mat3: 2x2 / 3x3 matrices.
 *   - quat: quaternions.
 *   - vec2 / vec4: 2D / 4D vectors.
 */
const BENCH_MODULES = {
    affine2: { name: "affine2", moduleFactory: Affine2Module, wasmUrl: new URL("./build/affine2.wasm", import.meta.url) },
    affine3: { name: "affine3", moduleFactory: Affine3Module, wasmUrl: new URL("./build/affine3.wasm", import.meta.url) },
    mat2: { name: "mat2", moduleFactory: Mat2Module, wasmUrl: new URL("./build/mat2.wasm", import.meta.url) },
    mat3: { name: "mat3", moduleFactory: Mat3Module, wasmUrl: new URL("./build/mat3.wasm", import.meta.url) },
    quat: { name: "quat", moduleFactory: QuatModule, wasmUrl: new URL("./build/quat.wasm", import.meta.url) },
    vec2: { name: "vec2", moduleFactory: Vec2Module, wasmUrl: new URL("./build/vec2.wasm", import.meta.url) },
    vec4: { name: "vec4", moduleFactory: Vec4Module, wasmUrl: new URL("./build/vec4.wasm", import.meta.url) },
};

/**
 * Operation-focused suites partitioning glam's criterion benchmarks via
 * criterion's positional CLI filter regex:
 *   - mul: Matrix, vector, quaternion, and affine multiplications (16 benches
 *     across all 7 bench binaries).
 *   - transform: 2D and 3D point/vector spatial transformations (8 benches
 *     across affine2, affine3, mat3).
 *   - invert: Matrix inversion, determinant, transpose, and quaternion
 *     conjugate (9 benches across affine2, affine3, mat2, mat3, quat).
 *   - construct-interp: Euler/SRT construction, linear/spherical interpolation
 *     (`lerp`/`slerp`), and `angle_to` (7 benches across affine2, affine3,
 *     mat3, quat, vec2).
 */
const OPERATION_SUITES = {
    mul: {
        filter: " mul ",
        benches: ["affine2", "affine3", "mat2", "mat3", "quat", "vec2", "vec4"],
    },
    transform: {
        filter: "transform",
        benches: ["affine2", "affine3", "mat3"],
    },
    invert: {
        filter: "inverse|determinant|transpose|conjugate",
        benches: ["affine2", "affine3", "mat2", "mat3", "quat"],
    },
    "construct-interp": {
        filter: "from |lerp|slerp|angle_to",
        benches: ["affine2", "affine3", "mat3", "quat", "vec2"],
    },
};

/**
 * Criterion's defaults (3 s warm-up + 5 s measurement + 100,000 bootstrap
 * resamples per bench function) would make a single run take several minutes,
 * so warm-up, measurement time, and bootstrap resamples are reduced while
 * keeping Criterion's default 100 samples per function.
 */
const WARM_UP_TIME_S = 0.1;
const MEASUREMENT_TIME_S = 0.3;
const NUM_RESAMPLES = 1000;
const CRITERION_ARGS = ["--bench", "--noplot", "--color", "never", "--warm-up-time", String(WARM_UP_TIME_S), "--measurement-time", String(MEASUREMENT_TIME_S), "--nresamples", String(NUM_RESAMPLES)];

const NUM_PATTERN = "([0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?)";
const UNIT_PATTERN = "(ps|ns|µs|us|ms|s)";
/**
 * Matches criterion's `time: [lower_bound estimate upper_bound]` lines.
 */
const TIME_REGEX = new RegExp(`time:\\s+\\[${NUM_PATTERN} ${UNIT_PATTERN} ${NUM_PATTERN} ${UNIT_PATTERN} ${NUM_PATTERN} ${UNIT_PATTERN}\\]`, "g");

const NS_PER_UNIT = {
    ps: 1e-3,
    ns: 1,
    µs: 1e3,
    us: 1e3,
    ms: 1e6,
    s: 1e9,
};

function geometricMean(values) {
    const logSum = values.reduce((sum, v) => sum + Math.log(v), 0);
    return Math.exp(logSum / values.length);
}

function instantiatePrecompiled(wasmModule, onError) {
    return (imports, successCallback) => {
        WebAssembly.instantiate(wasmModule, imports).then((instance) => {
            successCallback(instance, wasmModule);
        }, onError);
        return {};
    };
}

/**
 * Following `glam_rs.py`, a bench binary's result is the geometric mean of the
 * criterion point estimates (the middle value of each `time:` line), in ns.
 */
export function parseCriterionOutput(name, stdout) {
    // Emscripten reports stdout as a TTY, so strip any ANSI color codes in case
    // criterion still emits them.
    // eslint-disable-next-line no-control-regex
    const plainStdout = stdout.replace(/\x1b\[[0-9;]*m/g, "");
    const matches = [...plainStdout.matchAll(TIME_REGEX)];
    if (matches.length === 0) {
        throw new Error(`Failed to parse glam-rs "${name}" criterion output:\n${stdout}`);
    }
    const estimatesNs = matches.map((match) => Number(match[3]) * NS_PER_UNIT[match[4]]);
    if (estimatesNs.some((v) => !Number.isFinite(v) || v <= 0)) {
        throw new Error(`Invalid glam-rs "${name}" timing values (ns): ${estimatesNs.join(", ")}\n${stdout}`);
    }
    return geometricMean(estimatesNs);
}

class GlamBenchmark {
    constructor(suiteName, { filter, benches }) {
        this.suiteName = suiteName;
        this.filter = filter;
        this.subBenchmarks = benches.map((name) => BENCH_MODULES[name]);
        this.wasmModules = new Map();
    }

    async init() {
        console.log(`Compiling glam-rs Wasm modules for ${this.suiteName} (not part of benchmark measurement)...`);
        await Promise.all(
            this.subBenchmarks.map(async ({ name, wasmUrl }) => {
                this.wasmModules.set(name, await WebAssembly.compileStreaming(fetch(wasmUrl)));
            })
        );
        console.log(`glam-rs Wasm modules compiled; starting measured ${this.suiteName} benchmark runs...`);
    }

    /**
     * Runs a single criterion bench binary (filtered to `this.filter`) in a
     * fresh module instance (and thus a fresh MEMFS), so criterion never
     * compares against a baseline saved by a previous run.
     */
    async runSubBenchmark({ name, moduleFactory }) {
        console.log(`Running glam-rs (${this.suiteName}) ${name}...`);
        let stdout = "";
        await new Promise((resolve, reject) => {
            moduleFactory({
                // Pass a fresh array: Emscripten's callMain() mutates `arguments`.
                arguments: [...CRITERION_ARGS, this.filter],
                print: (line) => {
                    console.log(`  [${this.suiteName}:${name}] ${line}`);
                    stdout += `${line}\n`;
                },
                printErr: (line) => console.error(`  [${this.suiteName}:${name}] ${line}`),
                instantiateWasm: instantiatePrecompiled(this.wasmModules.get(name), reject),
            }).then(resolve, reject);
        });
        return {
            tests: {},
            total: parseCriterionOutput(`${this.suiteName}:${name}`, stdout),
        };
    }
}

function createGlamSubSuite(benchmark, subBenchmark, subIterationCount) {
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

// TODO(ryandiaz) We may want to report the total as a geomean
// so one sub benchmark doesn't dominate.
function createSuiteSteps(benchmark, subBenchmarks, subIterationCount) {
    return subBenchmarks.map((subBenchmark) => {
        const subSuite = createGlamSubSuite(benchmark, subBenchmark, subIterationCount);
        return {
            name: subBenchmark.name,
            async runAndRecord(stepParams, _parentSuite, _parentRecord, onProgress) {
                const { result } = await subSuite.runAndRecord(stepParams, onProgress);
                return result;
            },
        };
    });
}

const appVersion = "0.30.5";

/**
 * Wires up the benchmark for one of the operation suites in `OPERATION_SUITES`.
 *
 * @param {keyof typeof OPERATION_SUITES} suiteName
 */
export async function initializeGlamBenchmark(suiteName) {
    const suiteConfig = OPERATION_SUITES[suiteName];
    if (!suiteConfig) {
        throw new Error(`Unknown glam-rs suite "${suiteName}", expected one of: ${Object.keys(OPERATION_SUITES).join(", ")}`);
    }

    const appName = `Glam-rs-${suiteName}`;
    try {
        const benchmark = new GlamBenchmark(suiteName, suiteConfig);
        await benchmark.init();

        /*--------- Running test suites ---------*/
        const suites = {
            default: new AsyncBenchmarkSuite("default", createSuiteSteps(benchmark, benchmark.subBenchmarks, params.subIterationCount)),
        };

        const benchmarkConnector = new BenchmarkConnector(suites, appName, appVersion);
        benchmarkConnector.connect();
    } catch (error) {
        console.error(`Failed to initialize ${appName} benchmark:`, error);
        throw error;
    }
}
