import fs from 'fs';
import path from 'path';

export default class DownloadCache {
    cached = {};

    constructor(filename, version, force) {
        this.filename = filename;
        if (force) {
            return;
        }
        if (fs.existsSync(filename)) {
            try {
                const cacheData = JSON.parse(fs.readFileSync(filename, 'utf8'));
                if (cacheData.version !== version) {
                    console.log(`Cache version mismatch (found: ${cacheData.version}, expected: ${version}). Wiping models directory...`);
                    fs.rmSync(path.dirname(filename), { recursive: true, force: true });
                } else {
                    this.cached = cacheData;
                }
            } catch (err) {
                console.warn(`Warning: Could not read cache file ${filename}:`, err.message);
            }
        }
        this.cached.version = version;
    }
    has(key) {
        return !!this.cached[key];
    }
    put(key) {
        this.cached[key] = true;
        fs.writeFileSync(this.filename, JSON.stringify(this.cached, null, 2));
    }
}
