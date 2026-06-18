import fs from 'fs';
import path from 'path';

export default class DownloadCache {
    cached = {};

    constructor(filename, version, force, excludes = []) {
        this.filename = filename;
        if (force) {
            return;
        }
        if (fs.existsSync(filename)) {
            try {
                const cacheData = JSON.parse(fs.readFileSync(filename, 'utf8'));
                if (cacheData.version !== version) {
                    console.log(`Cache version mismatch (found: ${cacheData.version}, expected: ${version}). Wiping models directory (excluding: ${excludes.join(', ')})...`);
                    const dir = path.dirname(filename);
                    if (excludes.length === 0) {
                        fs.rmSync(dir, { recursive: true, force: true });
                        fs.mkdirSync(dir, { recursive: true });
                    } else {
                        const files = fs.readdirSync(dir);
                        for (const file of files) {
                            if (excludes.includes(file) || file === path.basename(filename)) {
                                continue;
                            }
                            fs.rmSync(path.join(dir, file), { recursive: true, force: true });
                        }
                    }
                    this.cached = { version };
                    // Write the fresh cache file to disk
                    fs.writeFileSync(filename, JSON.stringify(this.cached, null, 2));
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
