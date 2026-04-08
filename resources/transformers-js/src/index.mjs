import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { createSubIteratedSuite, getVisualOutputCanvas } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";
import { pipeline, env, dot, read_audio, AutoTokenizer, AutoModelForSequenceClassification, AutoProcessor, RawImage, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, softmax, SamModel, SamProcessor } from '@huggingface/transformers';
import { KokoroTTS } from "kokoro-js";
import jfkAudio from '../../media/jfk_1962_0912_spaceeffort.wav';
import imageWithBackground from '../../media/image.jpg';

/*
Paste below into dev console for manual testing:
manualRun();
*/

// Workloads and models: https://docs.google.com/spreadsheets/d/1tRzuM34dUpijXcJwHmmK7-JDK6zZHhBPHECvBXEF0n8/edit?usp=sharing
// Model selection documentation: https://docs.google.com/document/d/1EDyRD5dHxYpONyE_xf_Tb1A3GvNSrLQpp-msCcWNnF0/edit?usp=sharing

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
    document.getElementById('workload').textContent = "feature extraction";
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
    // The fp16 model is the best option in terms of size and correctness of the result, but unfortunately in not working
    // on gLinux. So we are using fp32 model.
    this.model = await pipeline('feature-extraction', "Alibaba-NLP/gte-base-en-v1.5", { device: this.device, dtype: "fp32" },);
  }

  async run() {
    // You can ignore the warning in the console: https://github.com/huggingface/transformers.js/issues/736#issuecomment-2101078957
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
    // We should check if we can resolve this issue or select another model. In the meanwhile, we use Xenova/whisper-small.
    this.model = await pipeline('automatic-speech-recognition', "Xenova/whisper-small", { device: this.device, dtype: "q4" },);
  }

  async run() {
    const result = await this.model(this.audioData, {language: 'en'});
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
    // We should check later if the issue has been resolved or select another model. In the meanwhile, we will use Xenova/modnet.
    this.model = await pipeline('background-removal', "Xenova/modnet", { device: this.device, dtype: "uint8" },);
  }

  async run() {
    const result = await this.model(this.imageURL);
    
    // Prepare result to display
    const offscreenCanvas = await result.toCanvas();
    const { ctx } = await getVisualOutputCanvas(offscreenCanvas.width, offscreenCanvas.height);
    if (ctx) {
      ctx.drawImage(offscreenCanvas, 0, 0);
    } else {
      console.error("Could not get 2D context from the canvas.");
    }
  }
}

/*--------- Text reranking workload using mixedbread-ai/mxbai-rerank-base-v1 model ---------*/

class TextReranking {
  constructor(device) {
    this.device = device;
    this.query = "Who wrote 'To Kill a Mockingbird'?"
    this.documents = ["'To Kill a Mockingbird' is a novel by Harper Lee published in 1960. It was immediately successful, winning the Pulitzer Prize, and has become a classic of modern American literature.",
    "The novel 'Moby-Dick' was written by Herman Melville and first published in 1851. It is considered a masterpiece of American literature and deals with complex themes of obsession, revenge, and the conflict between good and evil.",
    "Harper Lee, an American novelist widely known for her novel 'To Kill a Mockingbird', was born in 1926 in Monroeville, Alabama. She received the Pulitzer Prize for Fiction in 1961.",
    "Jane Austen was an English novelist known primarily for her six major novels, which interpret, critique and comment upon the British landed gentry at the end of the 18th century.",
    "The 'Harry Potter' series, which consists of seven fantasy novels written by British author J.K. Rowling, is among the most popular and critically acclaimed books of the modern era.",
    "'The Great Gatsby', a novel written by American author F. Scott Fitzgerald, was published in 1925. The story is set in the Jazz Age and follows the life of millionaire Jay Gatsby and his pursuit of Daisy Buchanan."]
  }
  async init() {
    document.getElementById('device').textContent = this.device;
    document.getElementById('workload').textContent = "text reranking";
    document.getElementById('input').textContent = `"${this.documents}"`;

    const model_id = 'mixedbread-ai/mxbai-rerank-base-v1';
    this.model = await AutoModelForSequenceClassification.from_pretrained(model_id, { device: this.device, dtype: "fp32" });
    this.tokenizer = await AutoTokenizer.from_pretrained(model_id);
  }

    /**
   * Performs ranking with the CrossEncoder on the given query and documents. Returns a sorted list with the document indices and scores.
   * @param {string} query A single query
   * @param {string[]} documents A list of documents
   * @param {Object} options Options for ranking
   * @param {number} [options.top_k=undefined] Return the top-k documents. If undefined, all documents are returned.
   * @param {number} [options.return_documents=false] If true, also returns the documents. If false, only returns the indices and scores.
    */
  async rank(query, documents, {
      top_k = undefined,
      return_documents = false,} = {}) {
      const inputs = this.tokenizer(
          new Array(documents.length).fill(query),
          {
              text_pair: documents,
              padding: true,
              truncation: true,
          }
      )
      const { logits } = await this.model(inputs);
      return logits
          .sigmoid()
          .tolist()
          .map(([score], i) => ({
              corpus_id: i,
              score,
              ...(return_documents ? { text: documents[i] } : {})
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, top_k);
  }

  async run() {
    const results = await this.rank(this.query, this.documents, { return_documents: true, top_k: 3 });
    const output = document.getElementById('output');
    output.textContent = JSON.stringify(results, null, 2);
  }
}

/*--------- Image classification workload using AdamCodd/vit-base-nsfw-detector ---------*/

class ImageClassification {
  constructor(device) {
    this.device = device;
    this.imageURL = imageWithBackground;
  }
  async init() {
    document.getElementById('device').textContent = this.device;
    document.getElementById('workload').textContent = "image classification";
    document.getElementById('input').textContent = `Image classification of a local image.`;

    this.model = await pipeline('image-classification', "AdamCodd/vit-base-nsfw-detector", { device: this.device, dtype: "q4" },);
  }

  async run() {
    const result = await this.model(this.imageURL);
    const output = document.getElementById('output');
    output.textContent = result[0].label + ': ' + result[0].score;
  }
}

/*--------- Zero-shot image classification workload using Xenova/mobileclip_s0 ---------*/

class ZeroShotImageClassification {
  constructor(device) {
    this.device = device;
    this.imageURL = imageWithBackground;
    this.texts = ['a hat', 'a t-shirt', 'a hand', 'an origami'];
  }
  async init() {
    document.getElementById('device').textContent = this.device;
    document.getElementById('workload').textContent = "zero-shot image classification";
    document.getElementById('input').textContent = `Classifying a local image against the following labels: ${JSON.stringify(this.texts)}`;

    const model_id = "Xenova/mobileclip_s0";

    this.tokenizer = await AutoTokenizer.from_pretrained(model_id, { device: this.device });
    this.processor = await AutoProcessor.from_pretrained(model_id, { device: this.device });
    this.text_model = await CLIPTextModelWithProjection.from_pretrained(model_id, { device: this.device, dtype: "q4" });
    this.vision_model = await CLIPVisionModelWithProjection.from_pretrained(model_id, { device: this.device, dtype: "q4" });

    this.image = await RawImage.read(this.imageURL);
  }

  async run() {
    const text_inputs = this.tokenizer(this.texts, { padding: 'max_length', truncation: true });
    const image_inputs = await this.processor(this.image);

    const { text_embeds } = await this.text_model(text_inputs);
    const { image_embeds } = await this.vision_model(image_inputs);

    const normalized_text_embeds = text_embeds.normalize().tolist();
    const normalized_image_embeds = image_embeds.normalize().tolist()[0];
    const text_probs = softmax(normalized_text_embeds.map((text_embed) => 100.0 * dot(normalized_image_embeds, text_embed)));

    const output = document.getElementById('output');
    output.textContent = JSON.stringify(Object.fromEntries(this.texts.map((text, i) => [text, text_probs[i]])), null, 2);
  }
}

/*--------- Text to speech workload using onnx-community/Kokoro-82M-v1.0-ONNX model ---------*/

class TextToSpeech {
  constructor(device) {
    this.device = device;
    this.text = "Web AI is a new frontier for machine learning, enabling powerful applications to run directly in your browser."
  }
  async init() {
    document.getElementById('device').textContent = this.device;
    document.getElementById('workload').textContent = "text to speech";
    document.getElementById('input').textContent = `"${this.text}"`;
    this.model = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      device: this.device,
      dtype: "fp32",
    });
  }

  async run() {
    const result = await this.model.generate(this.text);
    const output = document.getElementById('output');
    const durationInMs = (result.audio.length / 24000) * 1000;
    output.textContent = `Generated audio of duration ${durationInMs.toFixed(2)} ms`;
  }
}

/*--------- Mask generation workload using Xenova/sam-vit-base model ---------*/

class MaskGeneration {
  constructor(device) {
    this.device = device;
    this.imageURL = imageWithBackground;
  }
  async init() {
    document.getElementById('device').textContent = this.device;
    document.getElementById('workload').textContent = "mask generation";
    document.getElementById('input').textContent = `Generating a mask for one positive and one negative marker.`;

    const model_id = "Xenova/sam-vit-base";
    this.processor = await SamProcessor.from_pretrained(model_id);
    this.model = await SamModel.from_pretrained(model_id, {
      device: this.device,
      dtype: 'fp32'
    });

    this.image = await RawImage.read(this.imageURL);

    // First point is origami, second point is hand
    this.input_points = [[[480, 580], [360, 900]]];
    // 1 to include, 0 to exclude
    this.input_labels = [[1, 0]];
  }

  async run() {
    const inputs = await this.processor(this.image, { input_points: this.input_points, input_labels: this.input_labels });
    const outputs = await this.model(inputs);

    const masks = await this.processor.post_process_masks(
      outputs.pred_masks,
      inputs.original_sizes,
      inputs.reshaped_input_sizes
    );

    const mask = masks[0];
    const offscreenCanvas = await this.image.toCanvas();
    const { ctx } = await getVisualOutputCanvas(offscreenCanvas.width, offscreenCanvas.height);
    if (ctx) {
      ctx.drawImage(offscreenCanvas, 0, 0);

      const maskData = mask.data;

      const maskDims = mask.dims;
      const height = maskDims[2];
      const width = maskDims[3];
      const maskSize = height * width;

      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      // The `maskData` contains 3 flattened masks (whole, sub-part, part).
      // We use the first one (index 0) directly, so no offset is needed.
      let dataIndex = 0;
      for (let i = 0; i < maskSize; ++i) {
        if (maskData[i]) {
          data[dataIndex] = 0;         // R
          data[dataIndex + 1] = 212;   // G
          data[dataIndex + 2] = 255;   // B
          data[dataIndex + 3] = 153;   // A (approx 60% opacity)
        }
        dataIndex += 4;
      }
      ctx.putImageData(imageData, 0, 0);
    } else {
      console.error("Could not get 2D context from the canvas.");
    }
  }
}

/*--------- Workload configurations ---------*/

const modelConfigs = {
  'feature-extraction-cpu': {
    description: 'Feature extraction on cpu',
    create() { return new FeatureExtraction('wasm'); },
  },
  'feature-extraction-gpu': {
    description: 'Feature extraction on gpu',
    create() { return new FeatureExtraction('webgpu'); },
  },
  'sentence-similarity-cpu': {
    description: 'Sentence similarity on cpu',
    create() { return new SentenceSimilarity('wasm'); },
  },
  'sentence-similarity-gpu': {
    description: 'Sentence similarity on gpu',
    create() { return new SentenceSimilarity('webgpu'); },
  },
  'speech-recognition-cpu': {
    description: 'Speech recognition on cpu',
    create() { return new SpeechRecognition('wasm'); },
  },
  'speech-recognition-gpu': {
    description: 'Speech recognition on gpu',
    create() { return new SpeechRecognition('webgpu'); },
  },
  'background-removal-cpu': {
    description: 'Background removal on cpu',
    create() { return new BackgroundRemoval('wasm'); },
  },
  'background-removal-gpu': {
    description: 'Background removal on gpu',
    create() { return new BackgroundRemoval('webgpu'); },
  },
  'text-reranking-cpu': {
    description: 'Text reranking on cpu',
    create() { return new TextReranking('wasm'); },
  },
  'text-reranking-gpu': {
    description: 'Text reranking on gpu',
    create() { return new TextReranking('webgpu'); },
  },
  'image-classification-cpu': {
    description: 'Image classification on cpu',
    create() { return new ImageClassification('wasm'); },
  },
  'image-classification-gpu': {
    description: 'Image classification on gpu',
    create() { return new ImageClassification('webgpu'); },
  },
  'zero-shot-image-classification-cpu': {
    description: 'Zero shot image classification on cpu',
    create() { return new ZeroShotImageClassification('wasm'); },
  },
  'zero-shot-image-classification-gpu': {
    description: 'Zero shot image classification on gpu',
    create() { return new ZeroShotImageClassification('webgpu'); },
  },
  'text-to-speech-cpu': {
    description: 'Text to speech on cpu',
    create() { return new TextToSpeech('wasm'); },
  },
  'text-to-speech-gpu': {
    description: 'Text to speech on gpu',
    create() { return new TextToSpeech('webgpu'); },
  },
  'mask-generation-cpu': {
    description: 'Mask generation on cpu',
    create() { return new MaskGeneration('wasm'); },
  },
  'mask-generation-gpu': {
    description: 'Mask generation on gpu',
    create() { return new MaskGeneration('webgpu'); },
  },
};

const appVersion = "1.0.0";
let appName;

export async function initializeBenchmark(modelType) {
  if (!modelType || !modelConfigs[modelType]) {
    throw new Error(`Invalid configuration '${modelType}.'`);
  }

  appName = modelConfigs[modelType].description;
  let benchmark;
  try {
    benchmark = modelConfigs[modelType].create();
    await benchmark.init();
  } catch (error) {
    console.error(error);
  }
  

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