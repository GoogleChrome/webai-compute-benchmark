import Gemma from './build/gemma_cpp_js.mjs';
import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { createSubIteratedSuite } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";

const weightsPath = '../models/gemma/270m-sfp-it.sbs';

let lastPercent = -1;
function logDownloadProgress(progress) {
  if (progress.total) {
    const percent = Math.floor((progress.loaded / progress.total) * 100);
    if (percent !== lastPercent) {
      console.log(`Downloading model: ${percent}%`);
      lastPercent = percent;
    }
  } else {
    // Log every 10 MB if total length is unknown
    if (Math.floor(progress.loaded / 10485760) !== Math.floor((progress.loaded - progress.chunkLength) / 10485760)) {
      console.log(`Downloading model: ${Math.floor(progress.loaded / 1048576)} MB`);
    }
  }
}

class GemmaBenchmark {
  constructor() {
    this.model = null;
  }
  async init() {
    const gemma = await Gemma();
    console.log('Downloading weights and initializing pipeline...');
    this.model = await gemma.pipeline(weightsPath, { progress: logDownloadProgress });
  }
  async run() {
    const sentence = 'Max 100 word response. Why is the sky blue?';
    console.log('Generating...');
    console.time('gemma-generation')
    const result = await this.model(sentence);
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
