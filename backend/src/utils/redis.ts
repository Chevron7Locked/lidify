import { createClient } from "redis";
import { config } from "../config";

const redisClient = createClient({ url: config.redisUrl });

// Handle Redis errors gracefully
redisClient.on("error", (err) => {
    console.error("  Redis error:", err.message);
    // Don't crash the app - Redis is optional for caching
});

redisClient.on("disconnect", () => {
    console.log("  Redis disconnected - caching disabled");
});

redisClient.on("reconnecting", () => {
    console.log(" Redis reconnecting...");
});

redisClient.on("ready", () => {
    console.log("Redis ready");
});

// Connect immediately on module load
redisClient.connect().catch((error) => {
    console.error("  Redis connection failed:", error.message);
    console.log(" Continuing without Redis caching...");
});

export { redisClient };
