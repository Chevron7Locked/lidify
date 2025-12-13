"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isCapacitorShell } from "@/lib/platform";

/**
 * Request notification permission for Android 13+ (API 33+)
 * Required for showing media playback notification
 */
async function requestNotificationPermission() {
    console.log("[AppLifecycle] Requesting notification permission...");
    try {
        // Use the standard web Notification API - works in Capacitor WebView
        if ("Notification" in window) {
            const permission = await Notification.requestPermission();
            console.log("[AppLifecycle] Notification permission result:", permission);
            return permission === "granted";
        } else {
            console.log("[AppLifecycle] Notification API not available");
        }
    } catch (e) {
        console.warn("[AppLifecycle] Could not request notification permission:", e);
    }
    return false;
}

/**
 * Hook to handle native app lifecycle events
 * - Back button handling (Android)
 * - App state changes (background/foreground)
 * - Permission requests (notifications for Android 13+)
 */
export function useAppLifecycle() {
    const router = useRouter();
    const pathname = usePathname();
    const lastBackPress = useRef<number>(0);
    const permissionsRequested = useRef(false);

    useEffect(() => {
        // Only attach Capacitor plugin listeners in the Capacitor shell origin.
        // Remote/LAN origins inside the WebView must behave like web (plugins not available).
        if (!isCapacitorShell()) return;

        let backButtonHandle: any = null;
        let appStateHandle: any = null;

        const setupListeners = async () => {
            try {
                const { App } = await import("@capacitor/app");
                
                // Request notification permission on first launch (Android 13+)
                if (!permissionsRequested.current) {
                    permissionsRequested.current = true;
                    requestNotificationPermission();
                }

                // Handle Android back button
                backButtonHandle = await App.addListener("backButton", ({ canGoBack }) => {
                    // If on login or home page, handle double-tap to exit
                    const isRootPage = pathname === "/" || pathname === "/login";
                    
                    if (!canGoBack || isRootPage) {
                        const now = Date.now();
                        const timeSinceLastPress = now - lastBackPress.current;
                        
                        if (timeSinceLastPress < 2000) {
                            // Double tap - exit app
                            App.exitApp();
                        } else {
                            // Single tap - show toast (handled by the component)
                            lastBackPress.current = now;
                            // Could trigger a toast here: "Press back again to exit"
                        }
                    } else {
                        // Navigate back normally
                        router.back();
                    }
                });

                // Handle app state changes
                appStateHandle = await App.addListener("appStateChange", ({ isActive }) => {
                    if (isActive) {
                        // App came to foreground
                        console.log("[AppLifecycle] App resumed");
                        // Could refresh auth state or reconnect sockets here
                    } else {
                        // App went to background
                        console.log("[AppLifecycle] App backgrounded");
                        // Could save state or pause resources here
                    }
                });
            } catch (e) {
                console.error("[AppLifecycle] Failed to setup listeners:", e);
            }
        };

        setupListeners();

        return () => {
            if (backButtonHandle) backButtonHandle.remove();
            if (appStateHandle) appStateHandle.remove();
        };
    }, [router, pathname]);
}







