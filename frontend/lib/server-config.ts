"use client";

import { isCapacitorShell } from "./platform";
import { Preferences } from "@capacitor/preferences";

const SERVER_URL_KEY = "lidify_server_url";

/**
 * Server Configuration Service
 * Manages the server URL for self-hosted Lidify installations
 * Uses Preferences on native (persistent) with localStorage fallback
 */
export const serverConfig = {
    /**
     * Get the stored server URL
     * Checks Preferences first, falls back to localStorage
     */
    async getServerUrl(): Promise<string | null> {
        if (typeof window === "undefined") {
            return null;
        }
        
        // Try Capacitor Preferences first (persistent in the Capacitor shell)
        if (isCapacitorShell()) {
            try {
                const { value } = await Preferences.get({ key: SERVER_URL_KEY });
                if (value) {
                    return value;
                }
            } catch (error) {
                console.warn("[ServerConfig] Preferences.get error:", error);
            }
        }
        
        // Fall back to localStorage
        return localStorage.getItem(SERVER_URL_KEY);
    },

    /**
     * Save the server URL - writes to BOTH storage locations
     */
    async setServerUrl(url: string): Promise<void> {
        // Normalize URL - remove trailing slash
        const normalizedUrl = url.replace(/\/+$/, "");

        if (typeof window !== "undefined") {
            localStorage.setItem(SERVER_URL_KEY, normalizedUrl);
            
            if (isCapacitorShell()) {
                try {
                    await Preferences.set({ key: SERVER_URL_KEY, value: normalizedUrl });
                } catch (error) {
                    console.warn("[ServerConfig] Preferences.set error:", error);
                }
            }
        }
    },

    /**
     * Clear the server URL - removes from BOTH storage locations
     */
    async clearServerUrl(): Promise<void> {
        if (typeof window !== "undefined") {
            localStorage.removeItem(SERVER_URL_KEY);
            
            if (isCapacitorShell()) {
                try {
                    await Preferences.remove({ key: SERVER_URL_KEY });
                } catch (error) {
                    console.warn("[ServerConfig] Preferences.remove error:", error);
                }
            }
        }
    },

    /**
     * Validate a server URL by testing connectivity
     */
    async validateServerUrl(url: string): Promise<{ valid: boolean; error?: string }> {
        try {
            const normalizedUrl = url.replace(/\/+$/, "");
            
            // Try the health endpoint (no /api prefix)
            const response = await fetch(`${normalizedUrl}/health`, {
                method: "GET",
                headers: { "Content-Type": "application/json" },
                signal: AbortSignal.timeout(10000),
            });

            if (response.ok) {
                return { valid: true };
            }

            // Try auth status endpoint as fallback
            const altResponse = await fetch(`${normalizedUrl}/api/auth/status`, {
                method: "GET",
                credentials: "include",
                signal: AbortSignal.timeout(10000),
            });

            if (altResponse.ok || altResponse.status === 401) {
                // 401 means server is reachable, just not authenticated
                return { valid: true };
            }

            return { valid: false, error: `Server returned status ${response.status}` };
        } catch (err: any) {
            console.error("[ServerConfig] Validation error:", err);
            if (err.name === "TimeoutError") {
                return { valid: false, error: "Connection timed out" };
            }
            if (err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) {
                return { valid: false, error: "Cannot reach server. Check the URL and ensure the server is running." };
            }
            return { valid: false, error: err.message || "Unknown error" };
        }
    },
};

// In-memory cache for the server URL (to avoid async calls on every API request)
let cachedServerUrl: string | null = null;
let cacheInitialized = false;

/**
 * Initialize the server URL cache
 * Call this early in the app lifecycle
 */
export async function initServerUrlCache(): Promise<string | null> {
    cachedServerUrl = await serverConfig.getServerUrl();
    cacheInitialized = true;
    return cachedServerUrl;
}

/**
 * Get the cached server URL (sync)
 * Returns null if cache not initialized or URL not set
 */
export function getCachedServerUrl(): string | null {
    return cachedServerUrl;
}

/**
 * Update the cache when URL changes
 */
export function updateServerUrlCache(url: string | null): void {
    cachedServerUrl = url;
    cacheInitialized = true;
}

/**
 * Check if server URL is configured
 */
export function isServerConfigured(): boolean {
    return cacheInitialized && cachedServerUrl !== null;
}

