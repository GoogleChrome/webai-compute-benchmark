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
const THRESHOLD = 0.99; // Threshold for determining person vs. background

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

/**
 * Renders the segmentation mask onto the output canvas.
 * @param {Float32Array} maskData - Raw probability scores for the mask (0.0 to 1.0).
 * @param {HTMLImageElement} originalImage - Reference to the loaded <img> element.
 */
async function renderSegmentation(maskData, originalImage) {
    const outputCanvas = document.getElementById('outputCanvas');
    const ctx = outputCanvas.getContext('2d');
    // 1. Draw the original image onto the canvas
    ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    ctx.drawImage(originalImage, 0, 0, outputCanvas.width, outputCanvas.height);

    // 2. Get the pixel data array (RGBA) from the drawn image
    const imageData = ctx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
    const pixels = imageData.data; 

    // 3. Apply the Mask: Modify the background pixels based on the LiteRT output
    for (let i = 0; i < maskData.length; i++) {
        const maskValue = maskData[i];
        
        // If mask value is below threshold, it's considered BACKGROUND
        const isBackground = maskValue < THRESHOLD; 
        const pixelIndex = i * 4;

        if (isBackground) {
            // Highlight background in bright GREEN
            pixels[pixelIndex] = 0;
            pixels[pixelIndex + 1] = 255; 
            pixels[pixelIndex + 2] = 0;
        }
    }
    
    // 4. Put the modified image data back onto the canvas
    ctx.putImageData(imageData, 0, 0);
}

   /**
   * Handles the output tensor: copies it to CPU if needed, renders the visualization,
   * and cleans up the tensor memory.
   * @param {Tensor} maskTensor The output tensor from the model run.
   */
  async function visualizeOutput(maskTensor) {
    // If the output tensor is on the GPU, we must copy it to the CPU first.
    let cpuMaskTensor;
    if (maskTensor.accelerator === 'webgpu') {
      cpuMaskTensor = await maskTensor.copyTo('wasm');
      maskTensor.delete(); // The original GPU tensor is no longer needed.
    } else {
      cpuMaskTensor = maskTensor;
    }

    const maskData = cpuMaskTensor.toTypedArray();
    const inputImage = document.getElementById('inputImage'); 
    await renderSegmentation(maskData, inputImage);

    cpuMaskTensor.delete();
  }

class ImageSegmentation {
  constructor(device) {
    this.device = device;
  }

  async init() {
    document.getElementById('device').textContent = this.device;
    document.getElementById('workload').textContent = "Image segmentation";
    // document.getElementById('input').textContent = `Image segmentation on local image.`;
    
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
    const [maskTensor] = await this.model.run([this.litertImageTensor]);
    await visualizeOutput(maskTensor);
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

  // To make sure image container is not showing in case of having non-image workloads in future.
  if (modelType === 'image-segmentation-cpu' || modelType === 'image-segmentation-gpu') {
    document.getElementById('imageContainer').style.display = 'block';
    document.getElementById('textContainer').style.display = 'none';
  } else {
    document.getElementById('imageContainer').style.display = 'none'; 
    document.getElementById('textContainer').style.display = 'block';
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
