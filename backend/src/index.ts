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
            // Only log CORS in production or when there's an error
            // (too noisy in development with frequent polling)
            if (config.nodeEnv !== "development") {
                console.log(
                    `[CORS] Request from origin: ${origin}, nodeEnv: ${config.nodeEnv}`
                );
            }

            // In development, allow all origins
            if (config.nodeEnv === "development") {
                callback(null, true);
            } else if (config.allowedOrigins.length > 0) {
                // In production, check against allowed origins
                if (!origin || config.allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    console.error(
                        `[CORS] BLOCKED - Origin not allowed: ${origin}`
                    );
                    callback(new Error("Not allowed by CORS"));
                }
            } else {
                // No origins configured and not in dev - deny
                console.error(`[CORS] BLOCKED - CORS not configured`);
                callback(new Error("CORS not configured"));
            }
        },
        credentials: true,
    })
);
app.use(express.json());

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

// Routes
// Apply rate limiting to auth routes
app.use("/auth/login", authLimiter);
app.use("/auth/register", authLimiter);
app.use("/auth", authRoutes);
app.use("/onboarding", onboardingRoutes); // Public onboarding routes

// Apply general API rate limiting to all API routes
app.use("/api-keys", apiLimiter, apiKeysRoutes);
// NOTE: /library has its own rate limiting (imageLimiter for cover-art, apiLimiter for others)
app.use("/library", libraryRoutes);
app.use("/plays", apiLimiter, playsRoutes);
app.use("/settings", apiLimiter, settingsRoutes);
app.use("/system-settings", apiLimiter, systemSettingsRoutes);
app.use("/listening-state", apiLimiter, listeningStateRoutes);
app.use("/playback-state", apiLimiter, playbackStateRoutes);
app.use("/offline", apiLimiter, offlineRoutes);
app.use("/playlists", apiLimiter, playlistsRoutes);
app.use("/search", apiLimiter, searchRoutes);
app.use("/recommendations", apiLimiter, recommendationsRoutes);
app.use("/downloads", apiLimiter, downloadsRoutes);
app.use("/webhooks", webhooksRoutes); // Webhooks should not be rate limited
// NOTE: /audiobooks has its own rate limiting (imageLimiter for covers, apiLimiter for others)
app.use("/audiobooks", audiobooksRoutes);
app.use("/podcasts", apiLimiter, podcastsRoutes);
app.use("/artists", apiLimiter, artistsRoutes);
app.use("/slskd", apiLimiter, slskdRoutes);
app.use("/discover", apiLimiter, discoverRoutes);
app.use("/mixes", apiLimiter, mixesRoutes);
app.use("/enrichment", apiLimiter, enrichmentRoutes);
app.use("/homepage", apiLimiter, homepageRoutes);

// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

// Swagger API Documentation
app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
        customCss: ".swagger-ui .topbar { display: none }",
        customSiteTitle: "Lidify API Documentation",
    })
);

// Serve raw OpenAPI spec
app.get("/api-docs.json", (req, res) => {
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
    serverAdapter.setBasePath("/admin/queues");

    createBullBoard({
        queues: [
            new BullAdapter(scanQueue),
            new BullAdapter(discoverQueue),
            new BullAdapter(imageQueue),
        ],
        serverAdapter,
    });

    app.use("/admin/queues", serverAdapter.getRouter());
    console.log("Bull Board dashboard available at /admin/queues");

    // Note: Native library scanning is now triggered manually via POST /library/scan
    // No automatic sync on startup - user must manually scan their music folder

    // Enrichment worker enabled for OWNED content only
    // - Background enrichment: Genres, MBIDs, similar artists for owned albums/artists
    // - On-demand fetching: Artist images, bios when browsing (cached in Redis 7 days)
    console.log(
        "Background enrichment enabled for owned content (genres, MBIDs, etc.)"
    );
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
