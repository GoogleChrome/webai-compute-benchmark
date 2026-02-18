import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import DownloadCache from '../../shared/download-cache.mjs';
import AdmZip from 'adm-zip';

// --- Configuration ---
const MODEL_DIR = './models';
const CACHE_VERSION = 2;

const MODELS_TO_DOWNLOAD = [
    {
        repo: 'qualcomm/MediaPipe-Selfie-Segmentation', 
        filename: 'mediapipe_selfie-tflite-float.zip',
        url: 'https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/mediapipe_selfie/releases/v0.46.0/mediapipe_selfie-tflite-float.zip'
    },
    { 
        repo: 'qualcomm/MobileNet-v3-Small', 
        filename: 'mobilenet_v3_small-tflite-float.zip',
        url: 'https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/mobilenet_v3_small/releases/v0.46.0/mobilenet_v3_small-tflite-float.zip'
    },
    { 
        repo: 'qualcomm/MediaPipe-Hand-Detection', 
        filename: 'mediapipe_hand-tflite-float.zip',
        url: 'https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/mediapipe_hand/releases/v0.46.0/mediapipe_hand-tflite-float.zip'
    }
];

async function downloadModels() {
    const CACHE_FILE = path.join(MODEL_DIR, 'cache.json');
    const cache = new DownloadCache(CACHE_FILE, CACHE_VERSION, process.argv.includes('--force'));

    if (!fs.existsSync(MODEL_DIR)) {
        console.log(`Creating directory: **${MODEL_DIR}**`);
        fs.mkdirSync(MODEL_DIR, { recursive: true }); 
    }

    console.log(`Starting TFLite model downloads to: **${MODEL_DIR}**`);

    for (const modelInfo of MODELS_TO_DOWNLOAD) {
        const { repo, filename, url } = modelInfo;

        const cacheKey = `${repo}-${filename}`;
        if (cache.has(cacheKey)) {
            console.log(`Model ${filename} from ${repo} already cached. Skipping.`);
            continue;
        }

        const modelUrl = url;
        const outputPath = path.join(MODEL_DIR, path.basename(filename));

        console.log(`\nAttempting to download **${filename}** from **${repo}**...`);
        console.log(`URL: ${modelUrl}`);

        try {
            const response = await fetch(modelUrl);

            if (!response.ok) {
                throw new Error(`Failed to fetch: ${response.statusText} (${response.status})`);
            }

            const fileStream = fs.createWriteStream(outputPath);
            await new Promise((resolve, reject) => {
                response.body.pipe(fileStream);
                response.body.on('error', reject);
                fileStream.on('finish', resolve);
            });
            
            console.log(`Successfully downloaded **${filename}** to **${outputPath}**`);

            if (path.extname(filename) === '.zip') {
                console.log(`Extracting **${filename}**...`);
                const zip = new AdmZip(outputPath);
                zip.extractAllTo(MODEL_DIR, true);
                console.log(`Successfully extracted **${filename}** to **${MODEL_DIR}**`);
                fs.unlinkSync(outputPath);
                console.log(`Deleted zip file **${outputPath}**`);
            }

            cache.put(cacheKey);
        } catch (err) {
            console.error(`Model download failed for ${repo}/${filename}:`, err.message);
        }
    }
    console.log('TFLite download process finished.');
}

downloadModels().catch(err => {
    console.error("Download process terminated unexpectedly:", err);
    process.exit(1);
});
