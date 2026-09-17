import Gemma from './build/gemma_cpp_js.mjs';
import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { createDownloadProgressLogger } from "speedometer-utils/download-utils.mjs";
import { createSubIteratedSuite } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";
import {
  LLM_BENCHMARK_PROMPT,
  LLM_MAX_OUTPUT_TOKENS,
  LLM_TEMPERATURE,
  LLM_TOP_K,
} from "../llm-benchmark-config.mjs";

const weightsPath = '../models/gemma/270m-sfp-it.sbs';

class GemmaBenchmark {
  constructor() {
    this.model = null;
  }
  async init() {
    const gemma = await Gemma();
    console.log('Downloading weights and initializing pipeline...');
    this.model = await gemma.pipeline(weightsPath, { progress: createDownloadProgressLogger() });
  }
  async run() {
    console.log('Generating...');
    console.time('gemma-generation')
    const result = await this.model(LLM_BENCHMARK_PROMPT, {
      max_tokens: LLM_MAX_OUTPUT_TOKENS,
      temperature: LLM_TEMPERATURE,
      top_k: LLM_TOP_K,
      ignore_eos: true,
    });
    console.timeEnd('gemma-generation')
    console.log(result);
  }
}

const appName = "Gemma";
const appVersion = "0.1.0";

let benchmark;
try {
    benchmark = new GemmaBenchmark();
    await benchmark.init();
 } catch (error) {
    console.error(error.message);
 }

/*--------- Running test suites ---------*/
const suites = {
  default: createSubIteratedSuite(benchmark, params.subIterationCount),
};

const benchmarkConnector = new BenchmarkConnector(suites, appName, appVersion);
benchmarkConnector.connect();
