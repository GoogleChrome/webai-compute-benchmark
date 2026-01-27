import fs from 'fs';

export default class DownloadCache {
    cached = {};

    constructor(filename, force) {
        this.filename = filename;
        if (force) {
            return;
        }
        if (fs.existsSync(filename)) {
            try {
                this.cached = JSON.parse(fs.readFileSync(filename, 'utf8'));
            } catch (err) {
                console.warn(`Warning: Could not read cache file ${filename}:`, err.message);
            }
        }
    }
    has(key) {
        return !!this.cached[key];
    }
    put(key) {
        this.cached[key] = true;
        fs.writeFileSync(this.filename, JSON.stringify(this.cached, null, 2));
    }
}
