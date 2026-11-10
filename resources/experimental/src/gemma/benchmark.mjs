// Must be imported before any ML runtime is initialized, see workload-teardown.mjs.
import { registerTeardown } from "speedometer-utils/workload-teardown.mjs";
import Gemma from "./build/gemma_cpp_js.mjs";
import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { createDownloadProgressLogger } from "speedometer-utils/download-utils.mjs";
import { createLlmSubIteratedSuite } from "speedometer-utils/llm-metrics.mjs";
import { params } from "speedometer-utils/params.mjs";
import { LLM_BENCHMARK_PROMPT, LLM_MAX_OUTPUT_TOKENS, LLM_TEMPERATURE, LLM_TOP_K } from "../llm-benchmark-config.mjs";

const weightsPath = "../models/gemma/270m-sfp-it.sbs";

class GemmaBenchmark {
    constructor() {
        this.model = null;
    }
    async init() {
        const gemma = await Gemma();
        console.log("Downloading weights and initializing pipeline...");
        this.model = await gemma.pipeline(weightsPath, { progress: createDownloadProgressLogger() });
    }
    async run() {
        console.log("Generating...");
        console.time("gemma-generation");
        const result = await this.model(LLM_BENCHMARK_PROMPT, {
            max_tokens: LLM_MAX_OUTPUT_TOKENS,
            temperature: LLM_TEMPERATURE,
            top_k: LLM_TOP_K,
            ignore_eos: true,
        });
        console.timeEnd("gemma-generation");
        console.log(result?.text ?? result);
        const metrics = result?.metrics;
        return {
            ttftMs: metrics?.ttft_ms,
            prefillTokensPerSec: metrics?.prefill_tokens_per_sec,
            decodeTokensPerSec: metrics?.decode_tokens_per_sec,
        };
    }
    dispose() {
        this.model?.delete();
        this.model = null;
    }
}

const appName = "Gemma";
const appVersion = "0.1.0";

let benchmark;
try {
    benchmark = new GemmaBenchmark();
    // Registered before init() so a partially initialized workload is released as well.
    registerTeardown(() => benchmark.dispose());
    await benchmark.init();
} catch (error) {
    console.error(error.message);
}

/*--------- Running test suites ---------*/
const suites = {
    default: createLlmSubIteratedSuite(benchmark, params.subIterationCount),
};

const benchmarkConnector = new BenchmarkConnector(suites, appName, appVersion);
benchmarkConnector.connect();
