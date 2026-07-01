import { env, pipeline} from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';
import DownloadCache from '../../shared/download-cache.mjs';
import { retry } from '../../shared/download-utils.mjs';

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
        console.log(`Downloading all experimental models in parallel...`);
        await Promise.all(
            MODELS_TO_DOWNLOAD.map(modelInfo => downloadPipelineModel(modelInfo, cache))
        );
        console.log(`Successfully checked and downloaded all models.`);

    } catch (err) {
        console.error("Model download failed:", err);
        env.allowRemoteModels = originalAllowRemote;
        throw err;
    }
    env.allowRemoteModels = originalAllowRemote;
}

async function downloadPipelineModel(modelInfo, cache) {
    const { id: modelId, task: modelTask, dtype: modelDType } = modelInfo;
    
    const cacheKey = `${modelId}-${modelTask}-${modelDType}`;
    if (cache.has(cacheKey)) {
        console.log(`Model ${modelId} (${modelTask}, dtype: ${modelDType}) already cached. Skipping.`);
        return;
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

downloadModels().catch(err => {
    console.error("Download process terminated.");
    process.exit(1);
});
