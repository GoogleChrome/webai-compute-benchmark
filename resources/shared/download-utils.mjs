export async function retry(fn, retries = 3, delay = 2000) {
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
