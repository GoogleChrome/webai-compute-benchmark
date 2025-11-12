import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { AsyncBenchmarkStep, AsyncBenchmarkSuite } from "speedometer-utils/benchmark.mjs";
import { forceLayout } from "speedometer-utils/helpers.mjs";
import { pipeline, env, dot, read_audio } from '@huggingface/transformers';
import jfkAudio from '../../media/jfk_1962_0912_spaceeffort.wav';
import imageWithBackground from '../../media/image.jpg';

/*
Paste below into dev console for manual testing:
manualRun();
*/

// Disable the loading of remote models from the Hugging Face Hub:
env.localModelPath = '../models';
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
    this.model = await pipeline('feature-extraction', "Xenova/UAE-Large-V1", { device: this.device, dtype: "q4" },);
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
    // The int8 model does not perform well on WebGPU. We may want to use another dtype for WebGPU workload.
    this.model = await pipeline('feature-extraction', "Alibaba-NLP/gte-base-en-v1.5", { device: this.device, dtype: "int8" },);
  }

  async run() {
    const result = await this.model(this.SENTENCES, { pooling: 'cls', normalize: true });
    
    const [source_embeddings, ...document_embeddings ] = result.tolist();
    const similarities = document_embeddings.map(x => 100 * dot(source_embeddings, x));
    const output = document.getElementById('output');
    output.textContent = similarities;
  }
}

/*--------- Automatic speech recognition workload using Xenova/whisper-small model ---------*/

class SpeechRecognition {
  constructor(device) {
    this.device = device;
    this.audioURL = jfkAudio;
  }
  async init() {
    document.getElementById('device').textContent = this.device;
    document.getElementById('workload').textContent = "speech recognition";
    document.getElementById('input').textContent = `Transcribing local audio file.`;

    this.audioData = await read_audio(this.audioURL, 16000);
    
    // TODO: Initially we wanted to use distil-whisper/distil-large-v3 model, but the onnx files seems to be broken.
    // We should check if we can resolve this issue or select another model. In the meanwhile, we will use Xenova/whisper-small
    this.model = await pipeline('automatic-speech-recognition', "Xenova/whisper-small", { device: this.device, dtype: "q4f16" },);
  }

  async run() {
    const result = await this.model(this.audioData);
    const output = document.getElementById('output');
    output.textContent = result.text;
  }
}

/*--------- Background removal workload using Xenova/modnet model ---------*/

class BackgroundRemoval {
  constructor(device) {
    this.device = device;
    this.imageURL = imageWithBackground;
  }
  async init() {
    document.getElementById('device').textContent = this.device;
    document.getElementById('workload').textContent = "background removal";
    document.getElementById('input').textContent = `Removing background from local image.`;
    
    // TODO: Initially we wanted to use briaai/RMBG-2.0 model, but it has a known issue (https://github.com/microsoft/onnxruntime/issues/21968) cause it to be not usable.
    // We should check later if the issue has been resolved or select another model. In the meanwhile, we will use Xenova/modnet
    this.model = await pipeline('background-removal', "Xenova/modnet", { device: this.device, dtype: "uint8" },);
  }

  async run() {
    const result = await this.model(this.imageURL);
    const output = document.getElementById('output');
    // TODO(rezvan): Add image visualization.
    output.textContent = result;
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
  'speech-recognition-cpu': {
    description: 'Speech recognition on cpu',
    create: () => { return new SpeechRecognition('wasm'); },
  },
  'speech-recognition-gpu': {
    description: 'Speech recognition on gpu',
    create: () => { return new SpeechRecognition('webgpu'); },
  },
  'background-removal-cpu': {
    description: 'Background removal on cpu',
    create: () => { return new BackgroundRemoval('wasm'); },
  },
  'background-removal-gpu': {
    description: 'Background removal on gpu',
    create: () => { return new BackgroundRemoval('webgpu'); },
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
