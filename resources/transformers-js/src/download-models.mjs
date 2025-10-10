import { env, pipeline } from '@huggingface/transformers';
import path from 'path';
import fs from 'fs';

const MODEL_DIR = './models';
env.localModelPath = MODEL_DIR;

const MODELS_TO_DOWNLOAD = [
    'Xenova/UAE-Large-V1',
    'Alibaba-NLP/gte-base-en-v1.5',
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
        for (const modelId of MODELS_TO_DOWNLOAD) {
            console.log(`Downloading all files for ${modelId}...`);
            
            await pipeline('feature-extraction', modelId, { 
                cache_dir: env.localModelPath 
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