"use client";

import { useAuth } from "@/lib/auth-context";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { TVLayout } from "./TVLayout";
import { UniversalPlayer } from "../player/UniversalPlayer";
import { MediaControlsHandler } from "../player/MediaControlsHandler";
import { PlayerModeWrapper } from "../player/PlayerModeWrapper";
import { DownloadNotifications } from "../DownloadNotifications";
import { GalaxyBackground } from "../ui/GalaxyBackground";
import { GradientSpinner } from "../ui/GradientSpinner";
import { ReactNode } from "react";
import { useIsMobile, useIsTablet } from "@/hooks/useMediaQuery";
import { useIsTV } from "@/lib/tv-utils";
import { isAndroidWebView, isNativePlatform } from "@/lib/platform";
import { useAppLifecycle } from "@/hooks/useAppLifecycle";

const publicPaths = ["/login", "/register", "/onboarding", "/sync"];

export function AuthenticatedLayout({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();
    const pathname = usePathname();
    const isMobile = useIsMobile();
    const isTablet = useIsTablet();
    const isTV = useIsTV();
    const isMobileOrTablet = isMobile || isTablet;

    // Handle native app lifecycle (back button, app state changes)
    useAppLifecycle();

    const isPublicPage = publicPaths.includes(pathname);

    // Show loading state only on protected pages
    if (!isPublicPage && isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="flex flex-col items-center gap-4">
                    <GradientSpinner size="lg" />
                    <p className="text-white/60 text-sm">Loading...</p>
                </div>
            </div>
        );
    }

    // On public pages (login/register), don't show sidebar/player/topbar
    if (isPublicPage) {
        return <>{children}</>;
    }

    // On protected pages, show appropriate layout based on device
    if (isAuthenticated) {
        // Android TV Layout - Optimized for 10-foot UI
        if (isTV) {
            return (
                <PlayerModeWrapper>
                    <MediaControlsHandler />
                    <TVLayout>{children}</TVLayout>
                </PlayerModeWrapper>
            );
        }

        // Desktop/Mobile/Tablet Layout
        const isNative = isNativePlatform();
        const isInAndroidWebView = isAndroidWebView();
        return (
            <PlayerModeWrapper>
                <div 
                    className="h-screen bg-black overflow-hidden flex flex-col"
                    style={{ 
                        paddingTop: (isNative || isInAndroidWebView)
                            ? 'calc(max(env(safe-area-inset-top, 0px), 52px) + 64px)' 
                            : '64px' // Web: just the header height
                    }}
                >
                    <MediaControlsHandler />
                    <TopBar />
                    <div className="flex-1 flex gap-2 p-2 pt-0 overflow-hidden">
                        <Sidebar />
                        <main className="flex-1 bg-gradient-to-b from-[#1a1a1a] via-black to-black rounded-lg overflow-y-auto relative">
                            <GalaxyBackground />
                            {/* Add padding at bottom for fixed mini player on mobile/tablet */}
                            <div className={isMobileOrTablet ? "pb-28" : ""}>
                                {children}
                            </div>
                        </main>
                    </div>
                    <UniversalPlayer />
                    <DownloadNotifications />
                </div>
            </PlayerModeWrapper>
        );
    }

    // If not authenticated on a protected page, auth context will redirect
    // Show loading while redirect happens
    return (
        <div className="min-h-screen flex items-center justify-center bg-black">
            <div className="flex flex-col items-center gap-4">
                <GradientSpinner size="lg" />
                <p className="text-white/60 text-sm">Redirecting...</p>
            </div>
        </div>
    );
}
