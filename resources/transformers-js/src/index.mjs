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

/*--------- Feature extraction workload using Xenova/UAE-Large-V1 model ---------*/

async function runFeatureExtraction(device) {
    const SENTENCE_1 = `San Francisco has a unique Mediterranean climate characterized by mild,
                        wet winters and dry, cool summers. The city is famous for its persistent
                        fog which keeps temperatures comfortable and often cool near the coast.`
    const output = document.getElementById('output');

    document.getElementById('device').textContent = device;
    document.getElementById('workload').textContent = "Feature extraction";
    document.getElementById('input').textContent = `"${SENTENCE_1}"`;

    const model = await pipeline('feature-extraction', "Xenova/UAE-Large-V1", { device, dtype: "fp32" },);

    const result = await model(SENTENCE_1, { pooling: 'mean', normalize: true });
    const embedding = Array.from(result.data);

    output.textContent = JSON.stringify(embedding.slice(0, 5) + '...', null, 2);
}

/*--------- Sentence similarity workload using Alibaba-NLP/gte-base-en-v1.5 model ---------*/

async function runSentenceSimilarity(device) {
    const SENTENCES = ["San Francisco has a unique Mediterranean climate characterized by mild, wet winters and dry, cool summers",
                        "The city is famous for its persistent fog which keeps temperatures comfortable and often cool near the coast"]

    const output = document.getElementById('output');

    document.getElementById('device').textContent = device;
    document.getElementById('workload').textContent = "sentence similarity";
    document.getElementById('input').textContent = `"${SENTENCES}"`;

    const model = await pipeline('feature-extraction', "Alibaba-NLP/gte-base-en-v1.5", { device, dtype: "fp32" },);

    const result = await model(SENTENCES, { pooling: 'cls', normalize: true });
    
    const [source_embeddings, ...document_embeddings ] = result.tolist();
    const similarities = document_embeddings.map(x => 100 * dot(source_embeddings, x));

    output.textContent = similarities;
}

/*--------- Workload configurations ---------*/

const modelConfigs = {
  'feature-extraction-cpu': {
    description: 'Feature extraction on cpu',
    run: () => { return runFeatureExtraction("wasm"); },
  },
  'feature-extraction-gpu': {
    description: 'Feature extraction on gpu',
    run: () => { return runFeatureExtraction("webgpu"); },
  },
  'sentence-similarity-cpu': {
    description: 'Sentence similarity on cpu',
    run: () => { return runSentenceSimilarity("wasm"); },
  },
  'sentence-similarity-gpu': {
    description: 'Sentence similarity on gpu',
    run: () => { return runSentenceSimilarity("webgpu"); },
  },
};

const appVersion = "1.0.0";
let appName;

export function initializeBenchmark(modelType) {
  if (!modelType || !modelConfigs[modelType]) {
    throw new Error(`Invalid configuration '${modelType}.'`);
  }

  appName = modelConfigs[modelType].description;
  const run =  modelConfigs[modelType].run;

  /*--------- Running test suites ---------*/

  const suites = {
      default: new AsyncBenchmarkSuite("default", [
          new AsyncBenchmarkStep("Benchmark", async () => {
              forceLayout();
              await run();
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
