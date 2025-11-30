import rateLimit from "express-rate-limit";

// General API rate limiter (1000 req/minute per IP)
// This is for a single-user self-hosted app, so limits should be very high
// Only exists to prevent infinite loops or bugs from DOS'ing the server
export const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 1000, // Very high limit - this is a personal app, not a public API
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Strict limiter for auth endpoints (5 attempts/15min per IP)
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    skipSuccessfulRequests: true, // Don't count successful requests
    message: "Too many login attempts, please try again later.",
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
