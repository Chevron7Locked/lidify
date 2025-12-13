/**
 * Platform detection utilities for Capacitor
 * Includes fallback detection for when Capacitor bridge isn't ready
 */
import { Capacitor } from "@capacitor/core";

/**
 * True when the UI is running inside an Android WebView (including Capacitor and other in-app WebViews).
 * NOTE: This is safe for UI/layout tweaks (safe-area padding, viewport quirks), but NOT for plugin usage.
 */
export const isAndroidWebView = (): boolean => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent?.toLowerCase() || "";
    return ua.includes("android") && ua.includes("wv");
};

export const isLocalCapacitorHost = (): boolean => {
    if (typeof window === "undefined") return false;
    const host = window.location?.hostname || "";
    return host === "localhost" || host === "127.0.0.1" || host === "10.0.2.2";
};

export const isCapacitorProtocol = (): boolean => {
    if (typeof window === "undefined") return false;
    const protocol = window.location?.protocol || "";
    return protocol === "capacitor:" || protocol === "ionic:" || protocol === "file:";
};

/**
 * True only when we're in the Capacitor shell context (the packaged app's WebView):
 * - capacitor:// / ionic:// / file://, OR
 * - the local host used by Capacitor (https://localhost) AND a Capacitor bridge / Android WebView UA exists.
 *
 * IMPORTANT: A regular desktop browser at http://localhost:3030 is NOT the Capacitor shell.
 */
export const isCapacitorShell = (): boolean => {
    if (typeof window === "undefined") return false;

    // If Capacitor bridge is present and reports native platform, trust it
    try {
        const nativeFlag =
            (window as any).Capacitor?.isNativePlatform?.() ??
            Capacitor?.isNativePlatform?.();
        if (nativeFlag === true) return true;
    } catch {
        // ignore
    }

    if (isCapacitorProtocol()) return true;

    // Only treat Android WebView UA as "shell" when it's the Capacitor-hosted origin.
    // Many apps use WebViews; remote origins inside a WebView must behave like web.
    const looksLikeAndroidWebView = isAndroidWebView();
    if (isLocalCapacitorHost() && looksLikeAndroidWebView) return true;

    // For local host, also check Capacitor native bridge
    if (isLocalCapacitorHost()) {
        try {
            if (Capacitor?.isNativePlatform?.()) return true;
        } catch {
            // ignore
        }
    }

    return false;
};

/**
 * Check if running in a Capacitor WebView environment using protocol/user-agent fallbacks
 * This helps detect native platform even before Capacitor bridge is fully initialized
 */
const isCapacitorWebView = (): boolean => {
    if (typeof window === "undefined") return false;

    // Check for capacitor:// protocol (Android)
    if (window.location?.protocol === "capacitor:") return true;

    // Check for ionic:// protocol (iOS)
    if (window.location?.protocol === "ionic:") return true;

    // Check for file:// protocol with capacitor in path (older Capacitor versions)
    if (
        window.location?.protocol === "file:" &&
        window.location?.pathname?.includes("capacitor")
    )
        return true;

    // Check user agent for Android WebView indicators.
    // NOTE: Many non-Capacitor WebViews (e.g., in-app browsers) include "wv" too.
    // Only treat this as Capacitor if we're on the local Capacitor-hosted origin.
    const ua = navigator?.userAgent?.toLowerCase() || "";
    if (isLocalCapacitorHost() && ua.includes("wv") && ua.includes("android")) {
        return true;
    }

    return false;
};

const hasCapacitorBridge = (): boolean => {
    return typeof window !== "undefined" && !!(window as any).Capacitor;
};

export const isNativePlatform = (): boolean => {
    // First try the Capacitor bridge if available
    if (hasCapacitorBridge()) {
        try {
            const result = Capacitor?.isNativePlatform?.();
            if (result !== undefined) return !!result;
        } catch {
            // Fall through to fallback detection
        }
    }

    // Fallback: only treat as native when it looks like a Capacitor shell.
    // (This prevents mis-detecting random WebViews as native when the bridge isn't present.)
    if (typeof window !== "undefined" && !isCapacitorShell()) return false;

    // Fallback: detect Capacitor WebView environment
    return isCapacitorWebView();
};

export const isCapacitor = (): boolean => {
    return isNativePlatform();
};

export const isWeb = (): boolean => {
    return !isNativePlatform();
};

export const isAndroid = (): boolean => {
    if (!isNativePlatform()) return false;

    // Try Capacitor API first
    if (hasCapacitorBridge()) {
        try {
            return Capacitor.getPlatform() === "android";
        } catch {
            // Fall through
        }
    }

    // Fallback: check user agent
    const ua = navigator?.userAgent?.toLowerCase() || "";
    return ua.includes("android");
};

export const isIOS = (): boolean => {
    if (!isNativePlatform()) return false;

    // Try Capacitor API first
    if (hasCapacitorBridge()) {
        try {
            return Capacitor.getPlatform() === "ios";
        } catch {
            // Fall through
        }
    }

    // Fallback: check user agent
    const ua = navigator?.userAgent?.toLowerCase() || "";
    return ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod");
};
