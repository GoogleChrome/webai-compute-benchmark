import { env, pipeline, SiglipVisionModel, AutoImageProcessor, SiglipTextModel, AutoTokenizer } from '@huggingface/transformers';
import { KokoroTTS } from "kokoro-js";
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const MODEL_DIR = './models';
env.localModelPath = MODEL_DIR;

const MODELS_TO_DOWNLOAD = [
    { 
        id: 'Xenova/UAE-Large-V1', 
        task: 'feature-extraction', 
        dtype: 'q4'
    },
    { 
        id: 'Alibaba-NLP/gte-base-en-v1.5', 
        task: 'feature-extraction', 
        dtype: 'fp16'
    },
    { 
        id: 'Xenova/whisper-small', 
        task: 'automatic-speech-recognition', 
        dtype: 'q4f16'
    },
    { 
        id: 'Xenova/modnet', 
        task: 'background-removal', 
        dtype: 'uint8'
    },
    { 
        id: 'mixedbread-ai/mxbai-rerank-base-v1', 
        task: 'text-classification', 
        dtype: 'fp32'
    },
    { 
        id: 'AdamCodd/vit-base-nsfw-detector', 
        task: 'image-classification', 
        dtype: 'q4f16'
    }
];

const KOKORO_REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_FILES = [
   'model.onnx',
   'config.json',
   'tokenizer.json',
   'tokenizer_config.json',
];

function getHuggingFaceUrl(repo, filename, branch = 'main') {
    if(filename.endsWith('.onnx')) {
        return `https://huggingface.co/${repo}/resolve/${branch}/onnx/${filename}`;
    }
    return `https://huggingface.co/${repo}/resolve/${branch}/${filename}`;
}

async function downloadModels() {
    if (!fs.existsSync(MODEL_DIR)) {
        console.log(`Creating directory: ${MODEL_DIR}`);
        fs.mkdirSync(MODEL_DIR, { recursive: true }); 
    }

    console.log(`Starting model downloads to: ${MODEL_DIR}`);

    const originalAllowRemote = env.allowRemoteModels;
    env.allowRemoteModels = true; 

    try {
        // Download models that work with pipeline
        for (const modelInfo of MODELS_TO_DOWNLOAD) {
            const { id: modelId, task: modelTask, dtype: modelDType } = modelInfo;
            
            console.log(`Downloading files for ${modelId} (${modelTask}, dtype: ${modelDType})...`);
            
            await pipeline(
                modelTask, 
                modelId, 
                { 
                    cache_dir: env.localModelPath,
                    dtype: modelDType
                });
            
            console.log(`Successfully downloaded and cached ${modelId}`);
        }

        // Download Marqo/marqo-fashionSigLIP model
        console.log(`Downloading files for Marqo/marqo-fashionSigLIP (zero-shot-image-classification, dtype: bnb4)...`);
        await SiglipVisionModel.from_pretrained("Marqo/marqo-fashionSigLIP" ,{ 
                    cache_dir: env.localModelPath,
                    dtype: 'bnb4'
                });
        await AutoImageProcessor.from_pretrained("Marqo/marqo-fashionSigLIP", {
            cache_dir: env.localModelPath,
        });
        await SiglipTextModel.from_pretrained("Marqo/marqo-fashionSigLIP", {
            cache_dir: env.localModelPath,
            dtype: 'bnb4'
        });
        await AutoTokenizer.from_pretrained("Marqo/marqo-fashionSigLIP", {
            cache_dir: env.localModelPath,
        });
        console.log(`Successfully downloaded and cached Marqo/marqo-fashionSigLIP`);

        // Download onnx-community/Kokoro-82M-v1.0-ONNX model
        console.log(`Starting manual download for ${KOKORO_REPO}...`);
        const kokoroModelPath = path.join(MODEL_DIR, KOKORO_REPO);
        if (!fs.existsSync(kokoroModelPath)) {
            fs.mkdirSync(kokoroModelPath, { recursive: true });
        }

        for (const filename of KOKORO_FILES) {
            const isOnnxFile = filename.endsWith('.onnx') || filename.endsWith('.onnx_data');
            const modelUrl = getHuggingFaceUrl(KOKORO_REPO, filename);
            let outputPath;

            if (isOnnxFile) {
                const onnxDir = path.join(kokoroModelPath, 'onnx');
                if (!fs.existsSync(onnxDir)) {
                    fs.mkdirSync(onnxDir, { recursive: true });
                }
                outputPath = path.join(onnxDir, filename);
            } else {
                outputPath = path.join(kokoroModelPath, filename);
            }

            console.log(`  Downloading ${filename}...`);
            try {
                const response = await fetch(modelUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${filename}: ${response.statusText}`);
                }
                const fileStream = fs.createWriteStream(outputPath);
                await new Promise((resolve, reject) => {
                    response.body.pipe(fileStream);
                    response.body.on('error', reject);
                    fileStream.on('finish', resolve);
                });
            } catch (err) {
                console.error(`  Failed to download ${filename}:`, err.message);
            }
        }
        console.log(`Successfully downloaded all files for ${KOKORO_REPO}`);

    } catch (err) {
        console.error("Model download failed:", err);
        env.allowRemoteModels = originalAllowRemote;
        throw err;
    }
    env.allowRemoteModels = originalAllowRemote;
}

downloadModels().catch(err => {
    console.error("Download process terminated.");
    process.exit(1);
});