import { env, pipeline } from '@huggingface/transformers';
import path from 'path';
import fs from 'fs';

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
        dtype: 'int8'
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
    }
];

async function downloadModels() {
    if (!fs.existsSync(MODEL_DIR)) {
        console.log(`Creating directory: ${MODEL_DIR}`);
        fs.mkdirSync(MODEL_DIR, { recursive: true }); 
    }

    console.log(`Starting model downloads to: ${MODEL_DIR}`);

    const originalAllowRemote = env.allowRemoteModels;
    env.allowRemoteModels = true; 

    try {
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