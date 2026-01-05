import { env, pipeline} from '@huggingface/transformers';
import fs from 'fs';

const MODEL_DIR = './models';
env.localModelPath = MODEL_DIR;

const MODELS_TO_DOWNLOAD = [
    { 
        id: 'Xenova/flan-t5-small',
        task: 'text2text-generation', 
        dtype: 'fp32'
    },
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
