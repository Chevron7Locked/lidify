import rateLimit from "express-rate-limit";

// General API rate limiter (5000 req/minute per IP)
// This is for a single-user self-hosted app, so limits should be VERY high
// Only exists to prevent infinite loops or bugs from DOS'ing the server
export const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5000, // Very high limit - personal app, not a public API
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skip: (req) => {
        // Never rate limit streaming or status polling endpoints
        return req.path.includes("/stream") || 
               req.path.includes("/status") ||
               req.path.includes("/health");
    },
});

// Auth limiter for login endpoints (20 attempts/15min per IP)
// More lenient for self-hosted apps where users may have password manager issues
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Increased from 5 for self-hosted environments
    skipSuccessfulRequests: true, // Don't count successful requests
    message: "Too many login attempts, please try again in 15 minutes.",
    standardHeaders: true,
    legacyHeaders: false,
});

// Media streaming limiter (higher limit: 200 streams/minute)
export const streamLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 200, // Allow 200 stream requests per minute
    message: "Too many streaming requests, please slow down.",
    standardHeaders: true,
    legacyHeaders: false,
});

// Image/Cover art limiter (very high limit: 500 req/minute)
// This is for image proxying - not a security risk, just bandwidth
export const imageLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 500, // Allow 500 image requests per minute (high volume pages need this)
    message: "Too many image requests, please slow down.",
    standardHeaders: true,
    legacyHeaders: false,
});

// Download limiter (100 req/minute)
// Users might download entire discographies, so this needs to be reasonable
export const downloadLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100,
    message: "Too many download requests, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
});
