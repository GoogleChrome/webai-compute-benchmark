import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

// --- Configuration ---
const MODEL_DIR = './models';
const HUGGINGFACE_RESOLVE_URL = 'https://huggingface.co';

const MODELS_TO_DOWNLOAD = [
    {
        // https://huggingface.co/qualcomm/MediaPipe-Selfie-Segmentation/blob/main/MediaPipe-Selfie-Segmentation_float.tflite 
        repo: 'qualcomm/MediaPipe-Selfie-Segmentation', 
        filename: 'MediaPipe-Selfie-Segmentation_float.tflite',
        branch: 'main'
    },
    { 
        // https://huggingface.co/qualcomm/MobileNet-v3-Small/blob/main/MobileNet-v3-Small_float.tflite
        repo: 'qualcomm/MobileNet-v3-Small', 
        filename: 'MobileNet-v3-Small_float.tflite',
        branch: 'main'
    },
    {
        // This is a standard file for ImageNet class labels, hosted by Google.
        repo: 'google-storage',
        filename: 'imagenet_class_index.json',
        url: 'https://storage.googleapis.com/download.tensorflow.org/data/imagenet_class_index.json'
    },
    { 
        // https://huggingface.co/qualcomm/MediaPipe-Hand-Detection/blob/main/MediaPipe-Hand-Detection_HandLandmarkDetector_float.tflite
        repo: 'qualcomm/MediaPipe-Hand-Detection', 
        filename: 'MediaPipe-Hand-Detection_HandLandmarkDetector_float.tflite',
        branch: 'main'
    }
];

function getDownloadUrl(repo, filename, branch) {
    return `${HUGGINGFACE_RESOLVE_URL}/${repo}/resolve/${branch}/${filename}`;
}

async function downloadModels() {
    if (!fs.existsSync(MODEL_DIR)) {
        console.log(`Creating directory: **${MODEL_DIR}**`);
        fs.mkdirSync(MODEL_DIR, { recursive: true }); 
    }

    console.log(`Starting TFLite model downloads to: **${MODEL_DIR}**`);

    for (const modelInfo of MODELS_TO_DOWNLOAD) {
        const { repo, filename, branch, url } = modelInfo;
        const modelUrl = url || getDownloadUrl(repo, filename, branch);
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
