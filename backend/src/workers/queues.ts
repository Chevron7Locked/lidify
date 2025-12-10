import Bull from "bull";
import { config } from "../config";

// Parse Redis URL for Bull configuration
const redisUrl = new URL(config.redisUrl);
const redisConfig = {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port),
};

// Create queues
export const scanQueue = new Bull("library-scan", {
    redis: redisConfig,
});

export const discoverQueue = new Bull("discover-weekly", {
    redis: redisConfig,
});

export const imageQueue = new Bull("image-optimization", {
    redis: redisConfig,
});

export const validationQueue = new Bull("file-validation", {
    redis: redisConfig,
});

// Export all queues for monitoring
export const queues = [scanQueue, discoverQueue, imageQueue, validationQueue];

// Log queue initialization
console.log("Bull queues initialized");
