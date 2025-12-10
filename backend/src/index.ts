import express from "express";
import session from "express-session";
import RedisStore from "connect-redis";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config";
import { redisClient } from "./utils/redis";
import { prisma } from "./utils/db";

import authRoutes from "./routes/auth";
import onboardingRoutes from "./routes/onboarding";
import libraryRoutes from "./routes/library";
import playsRoutes from "./routes/plays";
import settingsRoutes from "./routes/settings";
import systemSettingsRoutes from "./routes/systemSettings";
import listeningStateRoutes from "./routes/listeningState";
import playbackStateRoutes from "./routes/playbackState";
import offlineRoutes from "./routes/offline";
import playlistsRoutes from "./routes/playlists";
import searchRoutes from "./routes/search";
import recommendationsRoutes from "./routes/recommendations";
import downloadsRoutes from "./routes/downloads";
import webhooksRoutes from "./routes/webhooks";
import audiobooksRoutes from "./routes/audiobooks";
import podcastsRoutes from "./routes/podcasts";
import artistsRoutes from "./routes/artists";
import slskdRoutes from "./routes/slskd";
import discoverRoutes from "./routes/discover";
import apiKeysRoutes from "./routes/apiKeys";
import mixesRoutes from "./routes/mixes";
import enrichmentRoutes from "./routes/enrichment";
import homepageRoutes from "./routes/homepage";
import deviceLinkRoutes from "./routes/deviceLink";
import { dataCacheService } from "./services/dataCache";
import { errorHandler } from "./middleware/errorHandler";
import {
    authLimiter,
    apiLimiter,
    streamLimiter,
    imageLimiter,
} from "./middleware/rateLimiter";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";

const app = express();

// Middleware
app.use(
    helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
    })
);
app.use(
    cors({
        origin: (origin, callback) => {
            // For self-hosted apps: allow all origins by default
            // Users deploy on their own domains/IPs - we can't predict them
            // Security is handled by authentication, not CORS
            if (!origin) {
                // Allow requests with no origin (same-origin, curl, etc.)
                callback(null, true);
            } else if (
                config.allowedOrigins === true ||
                config.nodeEnv === "development"
            ) {
                // Explicitly allow all origins
                callback(null, true);
            } else if (
                Array.isArray(config.allowedOrigins) &&
                config.allowedOrigins.length > 0
            ) {
                // Check against specific allowed origins if configured
                if (config.allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    // For self-hosted: allow anyway but log it
                    // Users shouldn't have to configure CORS for their own app
                    console.log(
                        `[CORS] Origin ${origin} not in allowlist, allowing anyway (self-hosted)`
                    );
                    callback(null, true);
                }
            } else {
                // No restrictions - allow all (self-hosted default)
                callback(null, true);
            }
        },
        credentials: true,
    })
);
app.use(express.json({ limit: '1mb' })); // Increased from 100KB default to support large queue payloads

// Session
// Trust proxy for reverse proxy setups (nginx, traefik, etc.)
app.set("trust proxy", 1);

app.use(
    session({
        store: new RedisStore({ client: redisClient }),
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        proxy: true, // Trust the reverse proxy
        cookie: {
            httpOnly: true,
            // For self-hosted apps: allow HTTP access (common for LAN deployments)
            // If behind HTTPS reverse proxy, the proxy should handle security
            secure: false,
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        },
    })
);

// Routes - All API routes prefixed with /api for clear separation from frontend
// Apply rate limiting to auth routes
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/onboarding", onboardingRoutes); // Public onboarding routes

// Apply general API rate limiting to all API routes
app.use("/api/api-keys", apiLimiter, apiKeysRoutes);
app.use("/api/device-link", apiLimiter, deviceLinkRoutes);
// NOTE: /api/library has its own rate limiting (imageLimiter for cover-art, apiLimiter for others)
app.use("/api/library", libraryRoutes);
app.use("/api/plays", apiLimiter, playsRoutes);
app.use("/api/settings", apiLimiter, settingsRoutes);
app.use("/api/system-settings", apiLimiter, systemSettingsRoutes);
app.use("/api/listening-state", apiLimiter, listeningStateRoutes);
app.use("/api/playback-state", playbackStateRoutes); // No rate limit - syncs frequently
app.use("/api/offline", apiLimiter, offlineRoutes);
app.use("/api/playlists", apiLimiter, playlistsRoutes);
app.use("/api/search", apiLimiter, searchRoutes);
app.use("/api/recommendations", apiLimiter, recommendationsRoutes);
app.use("/api/downloads", apiLimiter, downloadsRoutes);
app.use("/api/webhooks", webhooksRoutes); // Webhooks should not be rate limited
// NOTE: /api/audiobooks has its own rate limiting (imageLimiter for covers, apiLimiter for others)
app.use("/api/audiobooks", audiobooksRoutes);
app.use("/api/podcasts", apiLimiter, podcastsRoutes);
app.use("/api/artists", apiLimiter, artistsRoutes);
app.use("/api/slskd", apiLimiter, slskdRoutes);
app.use("/api/discover", apiLimiter, discoverRoutes);
app.use("/api/mixes", apiLimiter, mixesRoutes);
app.use("/api/enrichment", apiLimiter, enrichmentRoutes);
app.use("/api/homepage", apiLimiter, homepageRoutes);

// Health check (keep at root for simple container health checks)
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});
app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
});

// Swagger API Documentation
app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
        customCss: ".swagger-ui .topbar { display: none }",
        customSiteTitle: "Lidify API Documentation",
    })
);

// Serve raw OpenAPI spec
app.get("/api/docs.json", (req, res) => {
    res.json(swaggerSpec);
});

// Error handler
app.use(errorHandler);

app.listen(config.port, "0.0.0.0", async () => {
    console.log(
        `Lidify API running on port ${config.port} (accessible on all network interfaces)`
    );

    // Enable slow query monitoring in development
    if (config.nodeEnv === "development") {
        const { enableSlowQueryMonitoring } = await import(
            "./utils/queryMonitor"
        );
        enableSlowQueryMonitoring();
    }

    // Initialize music configuration (reads from SystemSettings)
    const { initializeMusicConfig } = await import("./config");
    await initializeMusicConfig();

    // Initialize Bull queue workers
    await import("./workers");

    // Set up Bull Board dashboard
    const { createBullBoard } = await import("@bull-board/api");
    const { BullAdapter } = await import("@bull-board/api/bullAdapter");
    const { ExpressAdapter } = await import("@bull-board/express");
    const { scanQueue, discoverQueue, imageQueue } = await import(
        "./workers/queues"
    );

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath("/api/admin/queues");

    createBullBoard({
        queues: [
            new BullAdapter(scanQueue),
            new BullAdapter(discoverQueue),
            new BullAdapter(imageQueue),
        ],
        serverAdapter,
    });

    app.use("/api/admin/queues", serverAdapter.getRouter());
    console.log("Bull Board dashboard available at /api/admin/queues");

    // Note: Native library scanning is now triggered manually via POST /library/scan
    // No automatic sync on startup - user must manually scan their music folder

    // Enrichment worker enabled for OWNED content only
    // - Background enrichment: Genres, MBIDs, similar artists for owned albums/artists
    // - On-demand fetching: Artist images, bios when browsing (cached in Redis 7 days)
    console.log(
        "Background enrichment enabled for owned content (genres, MBIDs, etc.)"
    );

    // Warm up Redis cache from database on startup
    // This populates Redis with existing artist images and album covers
    // so first page loads are instant instead of waiting for cache population
    dataCacheService.warmupCache().catch((err) => {
        console.error("Cache warmup failed:", err);
    });

    // Podcast cache cleanup - runs daily to remove cached episodes older than 30 days
    const { cleanupExpiredCache } = await import("./services/podcastDownload");

    // Run cleanup on startup (async, don't block)
    cleanupExpiredCache().catch((err) => {
        console.error("Podcast cache cleanup failed:", err);
    });

    // Schedule daily cleanup (every 24 hours)
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    setInterval(() => {
        cleanupExpiredCache().catch((err) => {
            console.error("Scheduled podcast cache cleanup failed:", err);
        });
    }, TWENTY_FOUR_HOURS);
    console.log("Podcast cache cleanup scheduled (daily, 30-day expiry)");
});

// Graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
    if (isShuttingDown) {
        console.log("Shutdown already in progress...");
        return;
    }

    isShuttingDown = true;
    console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

    try {
        // Shutdown workers (intervals, crons, queues)
        const { shutdownWorkers } = await import("./workers");
        await shutdownWorkers();

        // Close Redis connection
        console.log("Closing Redis connection...");
        await redisClient.quit();

        // Close Prisma connection
        console.log("Closing database connection...");
        await prisma.$disconnect();

        console.log("Graceful shutdown complete");
        process.exit(0);
    } catch (error) {
        console.error("Error during shutdown:", error);
        process.exit(1);
    }
}

// Handle termination signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
