"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
    useEffect(() => {
        if (typeof window !== "undefined" && "serviceWorker" in navigator) {
            // Register service worker
            navigator.serviceWorker
                .register("/sw.js")
                .then((registration) => {
                    console.log("[SW] Service Worker registered:", registration.scope);
                })
                .catch((error) => {
                    console.error("[SW] Service Worker registration failed:", error);
                });
        }
    }, []);

    return null;
}

