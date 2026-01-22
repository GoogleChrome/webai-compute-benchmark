import { env, pipeline, SiglipVisionModel, AutoImageProcessor, SiglipTextModel, AutoTokenizer } from '@huggingface/transformers';
import { KokoroTTS } from "kokoro-js";
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import DownloadCache from '../../shared/download-cache.mjs';

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
        dtype: 'fp32'
    },
    { 
        id: 'Xenova/whisper-small', 
        task: 'automatic-speech-recognition', 
        dtype: 'q4'
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
        dtype: 'q4'
    }
];

const KOKORO_REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_FILES = [
   'model.onnx',
   'config.json',
   'tokenizer.json',
   'tokenizer_config.json',
];

const MARGO_MODELS_TO_DOWNLOAD = [
    {
        class: 'SiglipVisionModel',
        dtype: 'bnb4',
    },
    {
        class: 'AutoImageProcessor',
    },
    {
        class: 'SiglipTextModel',
        dtype: 'bnb4',
    },
    {
        class: 'AutoTokenizer',
        dtype: 'bnb4',
    }
];
const MARGO_NAME_TO_CLASS = {
    'SiglipVisionModel': SiglipVisionModel,
    'AutoImageProcessor': AutoImageProcessor,
    'SiglipTextModel': SiglipTextModel,
    'AutoTokenizer': AutoTokenizer,
};

function getHuggingFaceUrl(repo, filename, branch = 'main') {
    if(filename.endsWith('.onnx')) {
        return `https://huggingface.co/${repo}/resolve/${branch}/onnx/${filename}`;
    }
    return `https://huggingface.co/${repo}/resolve/${branch}/${filename}`;
}

async function downloadModels() {
    const CACHE_FILE = path.join(MODEL_DIR, 'cache.json');
    const cache = new DownloadCache(CACHE_FILE, process.argv.includes('--force'));
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
            
            const cacheKey = `${modelId}-${modelTask}-${modelDType}`;
            if (cache.has(cacheKey)) {
                console.log(`Model ${modelId} (${modelTask}, dtype: ${modelDType}) already cached. Skipping.`);
                continue;
            }

            console.log(`Downloading files for ${modelId} (${modelTask}, dtype: ${modelDType})...`);
            
            await pipeline(
                modelTask, 
                modelId, 
                { 
                    cache_dir: env.localModelPath,
                    dtype: modelDType
                });
            
            console.log(`Successfully downloaded and cached ${modelId}`);
            cache.put(cacheKey);
        }

        // Download Marqo/marqo-fashionSigLIP model
        console.log(`Checking Marqo/marqo-fashionSigLIP models...`);
        for (const modelInfo of MARGO_MODELS_TO_DOWNLOAD) {
            const cacheKey = `${modelInfo.class}-${modelInfo.dtype}`;
            if (cache.has(cacheKey)) {
                console.log(`Model ${modelInfo.class} (dtype: ${modelInfo.dtype}) already cached. Skipping.`);
                continue;
            }

            console.log(`Downloading Marqo/marqo-fashionSigLIP (${modelInfo.class}${modelInfo.dtype ? `, dtype: ${modelInfo.dtype}` : ''})...`);
            await MARGO_NAME_TO_CLASS[modelInfo.class].from_pretrained("Marqo/marqo-fashionSigLIP", {
                cache_dir: env.localModelPath,
                dtype: modelInfo.dtype
            });

            cache.put(cacheKey);
        }
        console.log(`Successfully checked Marqo/marqo-fashionSigLIP`);

        // Download onnx-community/Kokoro-82M-v1.0-ONNX model
        console.log(`Starting manual download check for ${KOKORO_REPO}...`);
        const kokoroModelPath = path.join(MODEL_DIR, KOKORO_REPO);
        if (!fs.existsSync(kokoroModelPath)) {
            fs.mkdirSync(kokoroModelPath, { recursive: true });
        }

        for (const filename of KOKORO_FILES) {
            const cacheKey = `${KOKORO_REPO}-${filename}`;
            if (cache.has(cacheKey)) {
                console.log(`  ${filename} already exists, skipping.`);
                continue;
            }
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

                cache.put(cacheKey);
            } catch (err) {
                console.error(`  Failed to download ${filename}:`, err.message);
            }
        }
        console.log(`Successfully checked all files for ${KOKORO_REPO}`);

    } catch (err) {
        console.error("Model download failed:", err);
        env.allowRemoteModels = originalAllowRemote;
        throw err;
    }
    env.allowRemoteModels = originalAllowRemote;
}

downloadModels().catch(err => {
    console.error("Download process terminated.", err);
    process.exit(1);
});
