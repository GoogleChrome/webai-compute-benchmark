import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { createSubIteratedSuite } from "speedometer-utils/helpers.mjs";
import { pipeline, env } from '@huggingface/transformers';

/*
Paste below into dev console for manual testing:
manualRun();
*/

// Please ensure that models are self-contained for this benchmark and not loaded remotely from a CDN or the Hugging Face Hub.

env.localModelPath = '../models';
env.allowRemoteModels = false;
env.allowLocalModels = true;

env.backends.onnx.wasm.wasmPaths = '';

/*--------- Example workload: Text2Text generation workload using Xenova/flan-t5-small model ---------*/

class Text2TextGeneration {
  constructor(device) {
    this.device = device;
    this.sentence = "Translate English to German: How are you?";
  }

  async init() {
    document.getElementById('device').textContent = this.device;
    document.getElementById('workload').textContent = "text2text generation";
    document.getElementById('input').textContent = `"${this.sentence}"`;

    // None of the smaller models have correct answer on wasm and webgpu for out input, so we use fp32 model.
    this.model = await pipeline('text2text-generation', 'Xenova/flan-t5-small', {
      device: this.device,
      dtype: "fp32" 
    });
  }

  async run() {
    const result = await this.model(this.sentence, {
      max_new_tokens: 20,
    });
    document.getElementById('output').textContent = `"${result[0].generated_text}"`;
  }
}

/*--------- Workload configurations ---------*/

const modelConfigs = {
  'text2text-generation-cpu': {
    description: 'Text2Text generation on cpu',
    create: () => { return new Text2TextGeneration('wasm'); },
  },
  'text2text-generation-gpu': {
    description: 'Text2Text generation on gpu',
    create: () => { return new Text2TextGeneration('webgpu'); },
  },
};

const appVersion = "1.0.0";
let appName;

export async function initializeBenchmark(modelType) {
  if (!modelType || !modelConfigs[modelType]) {
    throw new Error(`Invalid configuration '${modelType}.'`);
  }

  appName = modelConfigs[modelType].description;
  const benchmark = modelConfigs[modelType].create();
  await benchmark.init();

  /*--------- Running test suites ---------*/
  const suites = {
    default: createSubIteratedSuite(benchmark, params.subIterationCount),
  };

  const benchmarkConnector = new BenchmarkConnector(suites, appName, appVersion);
  benchmarkConnector.connect();
}

globalThis.manualRun = () => {
  window.addEventListener("message", (event) => console.log(event.data));
  window.postMessage({ id: appName + '-' + appVersion, key: "benchmark-connector", type: "benchmark-suite", name: "default" }, "*");
}
