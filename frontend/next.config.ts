import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // For Capacitor: Uses dev server for dynamic routes
    // Static export doesn't work with dynamic routes like /album/[id]
    typescript: {
        ignoreBuildErrors: true, // Temporarily ignore TS errors for Capacitor setup
    },
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "cdn-images.dzcdn.net",
                pathname: "/**",
            },
            {
                protocol: "https",
                hostname: "e-cdns-images.dzcdn.net",
                pathname: "/**",
            },
            {
                protocol: "https",
                hostname: "lastfm.freetls.fastly.net",
                pathname: "/**",
            },
            {
                protocol: "https",
                hostname: "lastfm-img2.akamaized.net",
                pathname: "/**",
            },
            {
                protocol: "http",
                hostname: "localhost",
                port: "3006",
                pathname: "/**",
            },
            {
                protocol: "http",
                hostname: "127.0.0.1",
                port: "3006",
                pathname: "/**",
            },
            {
                protocol: "http",
                hostname: "localhost",
                port: "3006",
                pathname: "/**",
            },
            {
                protocol: "https",
                hostname: "assets.pippa.io",
                pathname: "/**",
            },
            {
                protocol: "https",
                hostname: "assets.fanart.tv",
                pathname: "/**",
            },
            {
                protocol: "https",
                hostname: "is1-ssl.mzstatic.com",
                pathname: "/**",
            },
        ],
        formats: ["image/avif", "image/webp"],
        deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
        minimumCacheTTL: 60 * 60 * 24 * 7, // Cache for 7 days
        // Allow private IPs in development for local backend
        dangerouslyAllowSVG: true,
        unoptimized: true, // Must be true for static export (Capacitor requirement)
    },
    reactStrictMode: false, // Disable strict mode to suppress hydration warnings
    // Suppress hydration errors in production
    ...(process.env.NODE_ENV === "production" && {
        onDemandEntries: {
            maxInactiveAge: 25 * 1000,
            pagesBufferLength: 2,
        },
    }),
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=()",
                    },
                ],
            },
        ];
    },
    // Proxy API requests to backend (for Docker all-in-one container)
    async rewrites() {
        const backendUrl = process.env.BACKEND_URL || "http://localhost:3006";
        
        // All backend routes that need to be proxied
        const backendRoutes = [
            "auth",
            "onboarding", 
            "api-keys",
            "library",
            "plays",
            "settings",
            "system-settings",
            "listening-state",
            "playback-state",
            "offline",
            "playlists",
            "search",
            "recommendations",
            "downloads",
            "webhooks",
            "audiobooks",
            "podcasts",
            "artists",
            "slskd",
            "discover",
            "mixes",
            "enrichment",
            "homepage",
            "stream",
            "admin",
            "health",
        ];
        
        return backendRoutes.map(route => ({
            source: `/${route}/:path*`,
            destination: `${backendUrl}/${route}/:path*`,
        })).concat([
            // Also handle routes without trailing paths
            ...backendRoutes.map(route => ({
                source: `/${route}`,
                destination: `${backendUrl}/${route}`,
            })),
        ]);
    },
};

export default nextConfig;
