"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isCapacitorShell } from "@/lib/platform";

/**
 * Hook to handle native app lifecycle events
 * - Back button handling (Android)
 * - App state changes (background/foreground)
 */
export function useAppLifecycle() {
    const router = useRouter();
    const pathname = usePathname();
    const lastBackPress = useRef<number>(0);

    useEffect(() => {
        // Only attach Capacitor plugin listeners in the Capacitor shell origin.
        // Remote/LAN origins inside the WebView must behave like web (plugins not available).
        if (!isCapacitorShell()) return;

        let backButtonHandle: any = null;
        let appStateHandle: any = null;

        const setupListeners = async () => {
            try {
                const { App } = await import("@capacitor/app");

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







