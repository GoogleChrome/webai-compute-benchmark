import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { AsyncBenchmarkStep, AsyncBenchmarkSuite } from "speedometer-utils/benchmark.mjs";
import { forceLayout } from "speedometer-utils/helpers.mjs";
import { pipeline, env, dot } from '@huggingface/transformers';

/*
Paste below into dev console for manual testing:
manualRun();
*/

// Disable the loading of remote models from the Hugging Face Hub:
env.allowRemoteModels = false;
env.allowLocalModels = true;

// Set location of .wasm files so the CDN is not used.
env.backends.onnx.wasm.wasmPaths = '';

// TODO: Model loading time is not currently included in the benchmark. We should
// investigate if the model loading code is different for the different device types.

/*--------- Feature extraction workload using Xenova/UAE-Large-V1 model ---------*/

class FeatureExtraction {
  constructor(device) {
    this.device = device;
    this.SENTENCE_1 = `San Francisco has a unique Mediterranean climate characterized by mild,
                       wet winters and dry, cool summers. The city is famous for its persistent
                       fog which keeps temperatures comfortable and often cool near the coast.`
  }

  async init() {
    document.getElementById('device').textContent = this.device;
    document.getElementById('workload').textContent = "Feature extraction";
    document.getElementById('input').textContent = `"${this.SENTENCE_1}"`;
    this.model = await pipeline('feature-extraction', "Xenova/UAE-Large-V1", { device: this.device, dtype: "fp32" },);
  }

  async run() {
    const result = await this.model(this.SENTENCE_1, { pooling: 'mean', normalize: true });
    const embedding = Array.from(result.data);
    const output = document.getElementById('output');
    output.textContent = JSON.stringify(embedding.slice(0, 5) + '...', null, 2);
  }
}

/*--------- Sentence similarity workload using Alibaba-NLP/gte-base-en-v1.5 model ---------*/

class SentenceSimilarity {
  constructor(device) {
    this.device = device;
    this.SENTENCES = ["San Francisco has a unique Mediterranean climate characterized by mild, wet winters and dry, cool summers",
                      "The city is famous for its persistent fog which keeps temperatures comfortable and often cool near the coast"]

  }

  async init() {
    document.getElementById('device').textContent = this.device;
    document.getElementById('workload').textContent = "sentence similarity";
    document.getElementById('input').textContent = `"${this.SENTENCES}"`;
    this.model = await pipeline('feature-extraction', "Alibaba-NLP/gte-base-en-v1.5", { device: this.device, dtype: "fp32" },);
  }

  async run() {
    const result = await this.model(this.SENTENCES, { pooling: 'cls', normalize: true });
    
    const [source_embeddings, ...document_embeddings ] = result.tolist();
    const similarities = document_embeddings.map(x => 100 * dot(source_embeddings, x));
    const output = document.getElementById('output');
    output.textContent = similarities;
  }
}

/*--------- Workload configurations ---------*/

const modelConfigs = {
  'feature-extraction-cpu': {
    description: 'Feature extraction on cpu',
    create: () => { return new FeatureExtraction('wasm'); },
  },
  'feature-extraction-gpu': {
    description: 'Feature extraction on gpu',
    create: () => { return new FeatureExtraction('webgpu'); },
  },
  'sentence-similarity-cpu': {
    description: 'Sentence similarity on cpu',
    create: () => { return new SentenceSimilarity('wasm'); },
  },
  'sentence-similarity-gpu': {
    description: 'Sentence similarity on gpu',
    create: () => { return new SentenceSimilarity('webgpu'); },
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
