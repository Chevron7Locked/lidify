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
import { PWAInstallPrompt } from "../PWAInstallPrompt";
import { ReactNode } from "react";
import { useIsMobile, useIsTablet } from "@/hooks/useMediaQuery";
import { useIsTV } from "@/lib/tv-utils";

const publicPaths = ["/login", "/register", "/onboarding", "/sync"];

export function AuthenticatedLayout({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();
    const pathname = usePathname();
    const isMobile = useIsMobile();
    const isTablet = useIsTablet();
    const isTV = useIsTV();
    const isMobileOrTablet = isMobile || isTablet;

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
        return (
            <PlayerModeWrapper>
                <div 
                    className="h-screen bg-black overflow-hidden flex flex-col"
                    style={{ paddingTop: '64px' }}
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
                    <PWAInstallPrompt />
                </div>
            </PlayerModeWrapper>
        );
    }

    // If not authenticated on a protected page, auth context will redirect
    return (
        <div className="min-h-screen flex items-center justify-center bg-black">
            <div className="flex flex-col items-center gap-4">
                <GradientSpinner size="lg" />
                <p className="text-white/60 text-sm">Redirecting...</p>
            </div>
        </div>
    );
}
