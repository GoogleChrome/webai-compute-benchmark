import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { AsyncBenchmarkStep, AsyncBenchmarkSuite } from "speedometer-utils/benchmark.mjs";
import { forceLayout } from "speedometer-utils/helpers.mjs";
import * as tf from '@tensorflow/tfjs';
import { loadAndCompile, loadLiteRt, Tensor } from '@litertjs/core';
import origamiImage from '../../media/image.jpg';
import handImage from '../../media/hand.jpg';

/*
Paste below into dev console for manual testing:
manualRun();
*/

// TODO: Model loading time is not currently included in the benchmark. We should
// investigate if the model loading code is different for the different device types.

const WASM_PATH = 'resources/wasm/';

/**
* Loads image from URL, and converts it to a normalized Float32 Tensor.
* @param {HTMLImageElement} image - The image to process.
* @param {number} height - The target height.
* @param {number} width - The target width.
* @returns {tf.Tensor4D} The processed image tensor [1, H, W, 3].
*/
function processImageToTensor(image, height, width) {
   return tf.tidy(() => {
       const tensor = tf.browser.fromPixels(image);
       const resized = tf.image.resizeBilinear(tensor, [height, width]);
       const normalized = resized.div(255.0);
       return normalized.expandDims(0);
   });
}

/*--------- Image segmentation workload using qualcomm/MediaPipe-Selfie-Segmentation_float model ---------*/

class ImageSegmentation {
 constructor(device) {
   this.device = device;
   this.originalImage = new Image();
   this.MODEL_URL = '../models/MediaPipe-Selfie-Segmentation_float.tflite';
   this.INPUT_WIDTH = 256;
   this.INPUT_HEIGHT = 256;
   this.THRESHOLD = 0.99; // Threshold for determining person vs. background
 }

 /**
* Renders the segmentation mask onto the output canvas.
* @param {Float32Array} maskData - Raw probability scores for the mask (0.0 to 1.0).
* @param {HTMLImageElement} originalImage - Reference to the loaded <img> element.
*/
async renderSegmentation(maskData, originalImage) {
   const outputCanvas = document.getElementById('outputCanvas');
   const ctx = outputCanvas.getContext('2d');

   // 1. Draw the original image onto the canvas. This is fast.
   ctx.drawImage(originalImage, 0, 0, outputCanvas.width, outputCanvas.height);

   // 2. Create a new ImageData object in memory to hold the mask.
   const maskImageData = new ImageData(outputCanvas.width, outputCanvas.height);
   const maskPixels = maskImageData.data;

   // 3. Apply the Mask: Populate the mask's pixel data on the CPU.
   for (let i = 0; i < maskData.length; i++) {
       const pixelIndex = i * 4;
       if (maskData[i] < this.THRESHOLD) { // Background
           maskPixels[pixelIndex] = 0;     // R
           maskPixels[pixelIndex + 1] = 255; // G
           maskPixels[pixelIndex + 2] = 0;     // B
           maskPixels[pixelIndex + 3] = 255; // Alpha (fully opaque)
       }
       // Pixels that are not background remain transparent (default R=G=B=A=0).
   }

   // 4. Draw the mask overlay. This is much faster than reading from the canvas.
   ctx.putImageData(maskImageData, 0, 0);
}

  /**
  * Handles the output tensor: copies it to CPU if needed, renders the visualization,
  * and cleans up the tensor memory.
  * @param {Tensor} maskTensor The output tensor from the model run.
  */
 async visualizeOutput(maskTensor, originalImage) {
   // If the output tensor is on the GPU, we must copy it to the CPU first.
   // To use result in javascript logic and DOM manipulation, we need CPU tensors.
   let cpuMaskTensor;
   if (maskTensor.accelerator === 'webgpu') {
     cpuMaskTensor = await maskTensor.copyTo('wasm');
     maskTensor.delete(); // The original GPU tensor is no longer needed.
   } else {
     cpuMaskTensor = maskTensor;
   }

   const maskData = cpuMaskTensor.toTypedArray();
   await this.renderSegmentation(maskData, originalImage);

   cpuMaskTensor.delete();
 }

 async init() {
   document.getElementById('device').textContent = this.device;
   document.getElementById('workload').textContent = "Image segmentation";
   document.getElementById('input').textContent = `Segmentation on a local image.`;
   document.getElementById('result-text').textContent = 'Segmentation Result';
 
   // Load the input image into an in-memory Image object.
   this.originalImage.src = origamiImage;
   await this.originalImage.decode();

   // Loading model
   await loadLiteRt(WASM_PATH, {threads: false});
   this.model = await loadAndCompile(this.MODEL_URL, {accelerator: this.device});

   // Preparing image
   const imageTensor = processImageToTensor(this.originalImage, this.INPUT_HEIGHT, this.INPUT_WIDTH);
   const imageData = imageTensor.dataSync();
   const cpuTensor = new Tensor(imageData, [1, this.INPUT_HEIGHT, this.INPUT_WIDTH, 3]);
   imageTensor.dispose();

   if (this.device === 'webgpu') {
     this.litertImageTensor = await cpuTensor.moveTo('webgpu');
   } else {
     this.litertImageTensor = cpuTensor;
   }
 }

 async run() {
   const [maskTensor] = this.model.run([this.litertImageTensor]);
   await this.visualizeOutput(maskTensor, this.originalImage);
 }
}

/*--------- Image classification workload using qualcomm/MobileNet-v3-Small model ---------*/

class ImageClassification {
 constructor(device) {
   this.device = device;
   this.originalImage = new Image();
   this.MODEL_URL = '../models/MobileNet-v3-Small_float.tflite';
   this.INPUT_WIDTH = 224;
   this.INPUT_HEIGHT = 224;
   this.LABELS_URL = '../models/imagenet_class_index.json';
   this.labels = [];
 }

  /**
  * Processes classification probabilities and displays the top 5 results.
  * @param {Float32Array} probabilities - The raw probability array from the model.
  */
 displayTop5Results(probabilities) {
    // Get top 5 probabilities and their indices
    const top5 = Array.from(probabilities)
      .map((probability, index) => ({ probability: probability * 10, index }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);

    // Format and display the results
    const results = top5.map(p => {
      const className = this.labels[p.index][1].replace(/_/g, ' ');
      return `${className}: ${p.probability.toFixed(4)}`;
    });

    document.getElementById('output').textContent = `Top 5 Classification results:\n${results.join('\n')}`;
  }

 async init() {
   document.getElementById('device').textContent = this.device;
   document.getElementById('workload').textContent = "Image classification";
   document.getElementById('input').textContent = `Classification on a local image.`;
 
   // Load the input image into an in-memory Image object.
   this.originalImage.src = origamiImage;
   await this.originalImage.decode();

   // Loading model
   await loadLiteRt(WASM_PATH, {threads: false});
   this.model = await loadAndCompile(this.MODEL_URL, {accelerator: this.device});

   // Fetch class labels
   const labelsResponse = await fetch(this.LABELS_URL);
   this.labels = await labelsResponse.json();

   // Preparing image
   const imageTensor = processImageToTensor(this.originalImage, this.INPUT_HEIGHT, this.INPUT_WIDTH);
   const imageData = imageTensor.dataSync();
   const cpuTensor = new Tensor(imageData, [1, this.INPUT_HEIGHT, this.INPUT_WIDTH, 3]);
   imageTensor.dispose();

   if (this.device === 'webgpu') {
     this.litertImageTensor = await cpuTensor.moveTo('webgpu');
   } else {
     this.litertImageTensor = cpuTensor;
   }
 }

 async run() {
   const [outputTensor] = this.model.run([this.litertImageTensor]);
   let cpuOutputTensor;
   if (outputTensor.accelerator === 'webgpu') {
     cpuOutputTensor = await outputTensor.copyTo('wasm');
     outputTensor.delete(); // The original GPU tensor is no longer needed.
   } else {
     cpuOutputTensor = outputTensor;
   }
   const probabilities = cpuOutputTensor.toTypedArray();
   cpuOutputTensor.delete();

   this.displayTop5Results(probabilities);
 }
}

/*--------- Hand detection workload using qualcomm/MediaPipe-Hand-Detection model ---------*/

class HandDetection {
  constructor(device) {
    this.device = device;
    this.originalImage = new Image();
    this.MODEL_URL = '../models/MediaPipe-Hand-Detection_HandLandmarkDetector_float.tflite';
    this.INPUT_WIDTH = 256;
    this.INPUT_HEIGHT = 256;
    this.CONFIDENCE_THRESHOLD = 0.9;
    this.NUM_KEYPOINTS = 21; // The landmark model provides 21 keypoints
  }

  /**
  * Draws hand landmarks and connecting lines on the output canvas.
  * @param {Float32Array} landmarkData - The raw landmark data from the model.
  */
  drawHandLandmarks(landmarkData) {
    const outputCanvas = document.getElementById('outputCanvas');
    const ctx = outputCanvas.getContext('2d');
    ctx.drawImage(this.originalImage, 0, 0, outputCanvas.width, outputCanvas.height);

    // Define connections between landmarks
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index finger
      [5, 9], [9, 10], [10, 11], [11, 12], // Middle finger
      [9, 13], [13, 14], [14, 15], [15, 16], // Ring finger
      [13, 17], [0, 17], [17, 18], [18, 19], [19, 20], // Pinky finger
    ];

    // Process and draw landmarks directly
    const landmarks = [];
    for (let i = 0; i < this.NUM_KEYPOINTS; i++) {
      // Directly scale normalized coordinates to canvas size
      const x = landmarkData[i * 3] * outputCanvas.width;
      const y = landmarkData[i * 3 + 1] * outputCanvas.height;
      landmarks.push({ x, y });

      // Draw landmark point
      ctx.fillStyle = '#FF0000'; // Red
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Draw connections
    ctx.strokeStyle = '#00FF00'; // Lime Green
    ctx.lineWidth = 3;
    for (const conn of connections) {
      const start = landmarks[conn[0]];
      const end = landmarks[conn[1]];
      if (start && end) {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    }
  }

  async init() {
    document.getElementById('device').textContent = this.device;
    document.getElementById('workload').textContent = "Hand detection";
    document.getElementById('input').textContent = `Hand detection on a local image.`;
    document.getElementById('result-text').textContent = 'Hand Detection Result';

    this.originalImage.src = handImage;
    await this.originalImage.decode();

    await loadLiteRt(WASM_PATH, { threads: false });
    this.model = await loadAndCompile(this.MODEL_URL, { accelerator: this.device });
 
    const imageTensor = processImageToTensor(this.originalImage, this.INPUT_HEIGHT, this.INPUT_WIDTH);
    const imageData = imageTensor.dataSync();
    const cpuTensor = new Tensor(imageData, [1, this.INPUT_HEIGHT, this.INPUT_WIDTH, 3], 'float32');
    imageTensor.dispose();
 
    if (this.device === 'webgpu') {
      this.litertImageTensor = await cpuTensor.moveTo('webgpu');
    } else {
      this.litertImageTensor = cpuTensor;
    }
  }
 
  async run() {
    // The landmark model has 3 outputs: landmarks, world_landmarks, handedness
    // landmarks: 21 landmarks suitable for 2D drawing
    // world_landmarks: 21 landmarks suitable for real world 3D coordination system
    // handedness: left hand or right hand
    const [landmarks, worldLandmarks, handedness] = this.model.run([this.litertImageTensor]);

    let landmarksTensor;
    if (this.device === 'webgpu') {
      // Copy tensors from GPU to CPU before reading data
      landmarksTensor = await landmarks.copyTo('wasm');
      landmarks.delete();
      worldLandmarks.delete(); // Not used, but must be cleaned up
      handedness.delete(); // Not used, but must be cleaned up
    } else {
      landmarksTensor = landmarks;
      worldLandmarks.delete();
      handedness.delete();
    }

    const landmarkData = landmarksTensor.toTypedArray();
    landmarksTensor.delete();

    this.drawHandLandmarks(landmarkData);
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
 'image-classification-cpu': {
   description: 'Image classification on wasm',
   create: () => { return new ImageClassification('wasm'); },
 },
 'image-classification-gpu': {
   description: 'Image classification on webgpu',
   create: () => { return new ImageClassification('webgpu'); },
 },
 'hand-detection-cpu': {
    description: 'Hand detection on wasm',
    create: () => { return new HandDetection('wasm'); },
  },
 'hand-detection-gpu': {
    description: 'Hand detection on webgpu',
    create: () => { return new HandDetection('webgpu'); },
  },
};

const appVersion = "1.0.0";
let appName;

export async function initializeBenchmark(modelType) {
 if (!modelType || !modelConfigs[modelType]) {
   throw new Error(`Invalid configuration '${modelType}.'`);
 }

 // To make sure image container is not showing for text-only workloads.
 if (modelType.startsWith('image-segmentation') || modelType.startsWith('hand-detection')) {
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
