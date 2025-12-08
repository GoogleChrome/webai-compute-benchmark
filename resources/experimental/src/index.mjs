import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { AsyncBenchmarkStep, AsyncBenchmarkSuite } from "speedometer-utils/benchmark.mjs";
import { forceLayout } from "speedometer-utils/helpers.mjs";

/*
Paste below into dev console for manual testing:
manualRun();
*/

// Disable the loading of remote models from the Hugging Face Hub:
env.localModelPath = '../models';
env.allowRemoteModels = false;
env.allowLocalModels = true;


/*--------- Empty extraction workload ---------*/

class EmptyExample {
  constructor(device) {
    this.device = device;
  }

  async init() {
    document.getElementById('device').textContent = this.device;
    document.getElementById('workload').textContent = "example";
    
    // Load model here
  }

  async run() {
    // Use the model
  }
}

/*--------- Workload configurations ---------*/

const modelConfigs = {
  'empty-cpu': {
    description: 'Empty on cpu',
    create: () => { return new EmptyExample('wasm'); },
  },
  'empty-gpu': {
    description: 'Empty on gpu',
    create: () => { return new EmptyExample('webgpu'); },
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
