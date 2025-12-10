"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isNativePlatform } from "@/lib/platform";
import { serverConfig, updateServerUrlCache } from "@/lib/server-config";
import { api } from "@/lib/api";

interface DeepLinkParams {
    code?: string;
    server?: string;
}

/**
 * Parse deep link URL into parameters
 * Handles: lidify://link?code=ABC123&server=https://example.com
 */
function parseDeepLink(url: string): DeepLinkParams | null {
    try {
        // Handle lidify:// scheme
        if (url.startsWith("lidify://")) {
            const cleanUrl = url.replace("lidify://", "https://lidify.app/");
            const parsed = new URL(cleanUrl);
            
            return {
                code: parsed.searchParams.get("code") || undefined,
                server: parsed.searchParams.get("server") || undefined,
            };
        }
        return null;
    } catch (e) {
        console.error("[DeepLink] Failed to parse URL:", e);
        return null;
    }
}

/**
 * Hook to handle deep links for device linking
 */
export function useDeepLink() {
    const router = useRouter();

    const handleDeepLink = useCallback(async (url: string) => {
        console.log("[DeepLink] Received:", url);
        
        const params = parseDeepLink(url);
        if (!params) return;

        // Handle device link
        if (params.code && params.server) {
            try {
                // Save server URL first
                const serverUrl = decodeURIComponent(params.server);
                await serverConfig.setServerUrl(serverUrl);
                updateServerUrlCache(serverUrl);
                
                // Refresh API base URL
                api.refreshBaseUrl();

                // Attempt to verify the device link code
                const response = await api.request<{ success: boolean; apiKey: string; userId: string; username: string }>(
                    `/device-link/verify`,
                    { 
                        method: "POST",
                        body: JSON.stringify({ code: params.code, deviceName: "Mobile App" })
                    }
                );

                if (response.apiKey) {
                    // Store API key as auth token
                    localStorage.setItem("auth_token", response.apiKey);
                    
                    // Refresh auth state and redirect
                    window.location.href = "/";
                }
            } catch (error: any) {
                console.error("[DeepLink] Failed to claim code:", error);
                // Redirect to login with error
                router.push(`/login?error=${encodeURIComponent(error.message || "Link failed")}`);
            }
        }
    }, [router]);

    useEffect(() => {
        if (!isNativePlatform()) return;

        let urlOpenHandle: any = null;

        // Check for Capacitor App plugin
        const setupDeepLinkListener = async () => {
            try {
                const { App } = await import("@capacitor/app");
                
                // Handle app opened via deep link
                urlOpenHandle = await App.addListener("appUrlOpen", ({ url }) => {
                    handleDeepLink(url);
                });

                // Check if app was launched with a URL
                const launchUrl = await App.getLaunchUrl();
                if (launchUrl?.url) {
                    handleDeepLink(launchUrl.url);
                }
            } catch (e) {
                console.error("[DeepLink] Failed to setup listener:", e);
            }
        };

        setupDeepLinkListener();

        // Cleanup listener on unmount
        return () => {
            if (urlOpenHandle) {
                urlOpenHandle.remove();
            }
        };
    }, [handleDeepLink]);

    return { handleDeepLink };
}

