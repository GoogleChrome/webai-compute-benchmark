import { env, pipeline} from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';
import DownloadCache from '../../shared/download-cache.mjs';

const MODEL_DIR = './models';
env.localModelPath = MODEL_DIR;
const CACHE_VERSION = 1;

const MODELS_TO_DOWNLOAD = [
    { 
        id: 'Xenova/flan-t5-small',
        task: 'text2text-generation', 
        dtype: 'fp32'
    },
];

async function retry(fn, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            console.warn(`Attempt ${i + 1} failed. Retrying in ${delay}ms...`, err.message);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function downloadModels() {
    const CACHE_FILE = path.join(MODEL_DIR, 'cache.json');
    const cache = new DownloadCache(CACHE_FILE, CACHE_VERSION, process.argv.includes('--force'));

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
            
            await retry(() => pipeline(
                modelTask, 
                modelId, 
                { 
                    cache_dir: env.localModelPath,
                    dtype: modelDType
                }));
            
            console.log(`Successfully downloaded and cached ${modelId}`);
            cache.put(cacheKey);
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
