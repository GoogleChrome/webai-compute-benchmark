export const ONE_MB = 1024 * 1024;
export const TEN_MB = 10 * ONE_MB;

function assertNotGitLfsPointer(bytes) {
  if (bytes !== null && bytes !== undefined && bytes > 0 && bytes < ONE_MB) {
    throw new Error(
      `Model file appears to be a Git LFS pointer (${bytes} bytes). Run 'git lfs pull'.`,
    );
  }
}

export function createDownloadProgressLogger() {
  let lastLogged = -1;
  return function logDownloadProgress({ loaded, total }) {
    assertNotGitLfsPointer(total);
    if (total) {
      const percent = Math.floor((loaded / total) * 100);
      if (percent !== lastLogged) {
        console.log(`Downloading model: ${percent}%`);
        lastLogged = percent;
      }
    } else {
      const currentMb = Math.floor(loaded / TEN_MB);
      if (currentMb !== lastLogged) {
        console.log(`Downloading model: ${Math.floor(loaded / ONE_MB)} MB`);
        lastLogged = currentMb;
      }
    }
  };
}

export async function fetchModelWithProgress(url) {
  console.log(`Fetching model from ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch model from ${url}: ${response.status} ${response.statusText}`,
    );
  }
  if (!response.body) {
    throw new Error(`Response body is empty for ${url}`);
  }

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : null;
  assertNotGitLfsPointer(total);

  let loaded = 0;
  const logProgress = createDownloadProgressLogger();

  const progressStream = new TransformStream({
    transform(chunk, controller) {
      loaded += chunk.byteLength;
      logProgress({ loaded, total });
      controller.enqueue(chunk);
    },
    flush(controller) {
      try {
        assertNotGitLfsPointer(loaded);
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return response.body.pipeThrough(progressStream);
}

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
