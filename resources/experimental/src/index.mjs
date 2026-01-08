import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { AsyncBenchmarkStep, AsyncBenchmarkSuite } from "speedometer-utils/benchmark.mjs";
import { forceLayout } from "speedometer-utils/helpers.mjs";
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

/*--------- Example workload: Summarization workload using Xenova/distilbart-cnn-6-6 model ---------*/

class Summarization {
  constructor(device) {
    this.device = device;
    this.paragraph = "San Francisco is defined by a unique Mediterranean climate, characterized by cool, fog-shrouded summers and mild, wet winters influenced by the cold currents of the Pacific Ocean. " +
      "However, this delicate ecosystem is increasingly threatened by climate change, which has intensified the frequency of extreme heat events and prolonged droughts across Northern California. " +
      "Rising sea levels pose a direct risk to the city’s extensive waterfront infrastructure, while shifting precipitation patterns have heightened the perennial threat of wildfires in the surrounding region. " +
      "As the city adapts, it faces the complex challenge of preserving its iconic temperate environment against the backdrop of a rapidly warming planet.";
  }

  async init() {
    document.getElementById('device').textContent = this.device;
    document.getElementById('workload').textContent = "summarization";
    document.getElementById('input').textContent = `"${this.paragraph}"`;

    // None of the smaller models have correct answer on wasm and webgpu on mac and gLinux, so we use fp32 model.
    this.model = await pipeline('summarization', 'Xenova/distilbart-cnn-6-6', {
      device: this.device,
      dtype: "fp32" 
    });
  }

  async run() {
    const result = await this.model(this.paragraph, {
      max_new_tokens: 100,
    });
    document.getElementById('output').textContent = `"${result[0].summary_text}"`;
  }
}

/*--------- Workload configurations ---------*/

const modelConfigs = {
  'summarization-cpu': {
    description: 'Summarization on cpu',
    create: () => { return new Summarization('wasm'); },
  },
  'summarization-gpu': {
    description: 'Summarization on gpu',
    create: () => { return new Summarization('webgpu'); },
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
      default: new AsyncBenchmarkSuite("default", [
          new AsyncBenchmarkStep("Benchmark", async () => {
              forceLayout();
              await benchmark.run();
              forceLayout();
          }),
      ], true),
  };

  const benchmarkConnector = new BenchmarkConnector(suites, appName, appVersion);
  benchmarkConnector.connect();
}

globalThis.manualRun = () => {
  window.addEventListener("message", (event) => console.log(event.data));
  window.postMessage({ id: appName + '-' + appVersion, key: "benchmark-connector", type: "benchmark-suite", name: "default" }, "*");
}
