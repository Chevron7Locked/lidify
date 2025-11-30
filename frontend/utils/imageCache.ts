/**
 * Client-side image cache using object URLs with request queuing
 * Prevents overwhelming the server with simultaneous image requests
 */

interface CachedImage {
    objectUrl: string;
    originalUrl: string;
    timestamp: number;
}

interface QueuedRequest {
    url: string;
    resolve: (url: string) => void;
    reject: (error: Error) => void;
    retries: number;
}

const imageCache = new Map<string, CachedImage>();
const MAX_CACHE_AGE = 1000 * 60 * 60; // 1 hour
const pendingFetches = new Map<string, Promise<string>>();

// Request queue to prevent overwhelming the server
const requestQueue: QueuedRequest[] = [];
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 3; // Only 3 simultaneous image fetches
const MAX_RETRIES = 3;

/**
 * Process the next item in the request queue
 */
async function processQueue() {
    if (
        activeRequests >= MAX_CONCURRENT_REQUESTS ||
        requestQueue.length === 0
    ) {
        return;
    }

    const request = requestQueue.shift();
    if (!request) return;

    activeRequests++;

    try {
        const url = await fetchImageWithRetry(request.url, request.retries);
        request.resolve(url);
    } catch (error) {
        request.reject(error as Error);
    } finally {
        activeRequests--;
        // Process next item in queue
        setTimeout(processQueue, 50); // Small delay between requests
    }
}

/**
 * Fetch image with exponential backoff retry for 429 errors
 */
async function fetchImageWithRetry(
    url: string,
    retriesLeft: number
): Promise<string> {
    try {
        const response = await fetch(url, {
            credentials: "include",
            cache: "force-cache",
        });

        // Handle rate limiting with exponential backoff
        if (response.status === 429) {
            if (retriesLeft > 0) {
                const retryAfter = response.headers.get("Retry-After");
                const delayMs = retryAfter
                    ? parseInt(retryAfter) * 1000
                    : Math.pow(2, MAX_RETRIES - retriesLeft) * 1000; // Exponential: 1s, 2s, 4s

                await new Promise((resolve) => setTimeout(resolve, delayMs));
                return fetchImageWithRetry(url, retriesLeft - 1);
            }
            throw new Error(`Rate limited: ${response.status}`);
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        imageCache.set(url, {
            objectUrl,
            originalUrl: url,
            timestamp: Date.now(),
        });

        pendingFetches.delete(url);
        return objectUrl;
    } catch (error) {
        console.error("Failed to cache image:", url, error);
        pendingFetches.delete(url);
        throw error;
    }
}

/**
 * Get cached image URL or fetch and cache it (with queuing)
 */
export async function getCachedImageUrl(url: string): Promise<string> {
    if (!url) return url;

    // Check if already cached
    const cached = imageCache.get(url);
    if (cached) {
        // Check if cache is still fresh
        if (Date.now() - cached.timestamp < MAX_CACHE_AGE) {
            return cached.objectUrl;
        } else {
            // Revoke old object URL to free memory
            URL.revokeObjectURL(cached.objectUrl);
            imageCache.delete(url);
        }
    }

    // Check if already fetching
    if (pendingFetches.has(url)) {
        return pendingFetches.get(url)!;
    }

    // Add to queue instead of fetching immediately
    const fetchPromise = new Promise<string>((resolve, reject) => {
        requestQueue.push({
            url,
            resolve,
            reject,
            retries: MAX_RETRIES,
        });

        // Start processing queue
        processQueue();
    });

    pendingFetches.set(url, fetchPromise);

    return fetchPromise.catch(() => {
        // Fallback to original URL on error
        return url;
    });
}

/**
 * Preload an image into cache
 */
export async function preloadImage(url: string): Promise<void> {
    if (!url) return;
    await getCachedImageUrl(url);
}

/**
 * Preload multiple images
 */
export async function preloadImages(urls: string[]): Promise<void> {
    const promises = urls
        .filter(Boolean)
        .map((url) => preloadImage(url).catch(() => {}));
    await Promise.all(promises);
}

/**
 * Check if image is already cached
 */
export function isImageCached(url: string): boolean {
    const cached = imageCache.get(url);
    if (!cached) return false;
    return Date.now() - cached.timestamp < MAX_CACHE_AGE;
}

/**
 * Clear all cached images
 */
export function clearImageCache(): void {
    imageCache.forEach((cached) => {
        URL.revokeObjectURL(cached.objectUrl);
    });
    imageCache.clear();
}

/**
 * Get cache stats
 */
export function getCacheStats() {
    return {
        size: imageCache.size,
        urls: Array.from(imageCache.keys()),
    };
}
