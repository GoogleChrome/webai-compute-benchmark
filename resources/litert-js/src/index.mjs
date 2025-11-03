import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { AsyncBenchmarkStep, AsyncBenchmarkSuite } from "speedometer-utils/benchmark.mjs";
import { forceLayout } from "speedometer-utils/helpers.mjs";
import * as tf from '@tensorflow/tfjs';
import { loadAndCompile, loadLiteRt, Tensor } from '@litertjs/core';
import imageWithBackground from '../../media/image.jpg';

/*
Paste below into dev console for manual testing:
manualRun();
*/

// TODO: Model loading time is not currently included in the benchmark. We should
// investigate if the model loading code is different for the different device types.

/*--------- Image segmentation workload using MediaPipe-Selfie-Segmentation_float model ---------*/
const MODEL_URL = '../models/MediaPipe-Selfie-Segmentation_float.tflite';
const INPUT_WIDTH = 256;
const INPUT_HEIGHT = 256;
const WASM_PATH = 'resources/wasm/';

/**
 * Loads image from URL, and converts it to a normalized Float32 Tensor.
 * @returns {tf.Tensor4D} The processed image tensor [1, H, W, 3].
 */
async function processImageToTensor() {
    // 1. Fetch the image data
    const response = await fetch(imageWithBackground);
    const blob = await response.blob();
    const imgBitmap = await createImageBitmap(blob);

    // 2. Use the imported TFJS core utilities for resize and normalization
    return tf.tidy(() => {
        // Convert the image data (from the bitmap) to a tensor [H, W, 3]
        let tensor = tf.browser.fromPixels(imgBitmap);
        
        // Resize and Normalize 
        const resized = tf.image.resizeBilinear(tensor, [INPUT_HEIGHT, INPUT_WIDTH]);
        const normalized = resized.div(255.0); 
        
        // Add batch dimension: [H, W, 3] -> [1, H, W, 3]
        return normalized.expandDims(0);
    });
}

class ImageSegmentation {
  constructor(device) {
    this.device = device;
  }

  async init() {
    document.getElementById('device').textContent = this.device;
    document.getElementById('workload').textContent = "Image segmentation";
    document.getElementById('input').textContent = `Image segmentation on local image.`;
    
    // Loading model
    await loadLiteRt(WASM_PATH, {threads: false});
    this.model = await loadAndCompile(MODEL_URL, {accelerator: this.device});

    // Preparing image
    const imageTensor = await processImageToTensor();
    const imageData = imageTensor.dataSync(); 
    const cpuTensor = new Tensor(imageData, [1, INPUT_HEIGHT, INPUT_WIDTH, 3]);
    imageTensor.dispose(); 

    if (this.device === 'webgpu') {
      this.litertImageTensor = await cpuTensor.moveTo('webgpu');
    } else {
      this.litertImageTensor = cpuTensor;
    }
  }

  async run() {
    const [maskTensor] = this.model.run([this.litertImageTensor]);

    const output = document.getElementById('output');
    // result is a raw image so nothing meaningful will be shown. Kept this line to be consistent with other workloads.
    output.textContent = maskTensor;

    maskTensor.delete();
  }

  cleanup() {
    this.litertImageTensor.delete();
  }
}

/*--------- Workload configurations ---------*/

const modelConfigs = {
  'image-segmentation-cpu': {
    description: 'Image segmentation on wasm',
    create: () => { return new ImageSegmentation('wasm'); },
  },
  'image-segmentation-gpu': {
    description: 'Image segmentation on webgpu',
    create: () => { return new ImageSegmentation('webgpu'); },
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

  // Monkey-patch the disconnect method to call our cleanup function.
  const originalDisconnect = benchmarkConnector.disconnect.bind(benchmarkConnector);
  benchmarkConnector.disconnect = () => {
    benchmark.cleanup();
    originalDisconnect();
  };

  benchmarkConnector.connect();
}

globalThis.manualRun = () => {
  window.addEventListener("message", (event) => console.log(event.data));
  window.postMessage({ id: appName + '-' + appVersion, key: "benchmark-connector", type: "benchmark-suite", name: "default" }, "*");
}
