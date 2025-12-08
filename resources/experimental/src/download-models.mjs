import fs from 'fs';

const MODEL_DIR = './models';

env.localModelPath = MODEL_DIR;

async function downloadModels() {
    if (!fs.existsSync(MODEL_DIR)) {
        console.log(`Creating directory: ${MODEL_DIR}`);
        fs.mkdirSync(MODEL_DIR, { recursive: true });
    }

    console.log(`Starting model downloads to: ${MODEL_DIR}`);

    const originalAllowRemote = env.allowRemoteModels;
    env.allowRemoteModels = true;

    try {
      // Download models here!  
    } catch (err) {
        console.error("Model download failed:", err);
        throw err;
    } finally {
        env.allowRemoteModels = originalAllowRemote;
    }
}

downloadModels().catch(err => {
    console.error("Download process terminated unexpectedly.");
    process.exit(1);
});
