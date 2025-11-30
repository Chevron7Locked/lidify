"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/utils/cn";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Image from "next/image";

const navigation = [
    { name: "Library", href: "/library" },
    { name: "Audiobooks", href: "/audiobooks" },
    { name: "Podcasts", href: "/podcasts" },
    { name: "Discovery", href: "/discover" },
];

interface Playlist {
    id: string;
    name: string;
    trackCount: number;
}

interface MobileSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
    const pathname = usePathname();
    const { isAuthenticated } = useAuth();
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
    const hasLoadedPlaylists = useRef(false);

    // Load playlists
    useEffect(() => {
        if (!isAuthenticated || hasLoadedPlaylists.current || !isOpen) return;

        const loadPlaylists = async () => {
            hasLoadedPlaylists.current = true;
            setIsLoadingPlaylists(true);
            try {
                const data = await api.getPlaylists();
                setPlaylists(data);
            } catch (error) {
                console.error("Failed to load playlists:", error);
                hasLoadedPlaylists.current = false;
            } finally {
                setIsLoadingPlaylists(false);
            }
        };

        loadPlaylists();
    }, [isAuthenticated, isOpen]);

    // Close on route change
    useEffect(() => {
        onClose();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
                onClick={onClose}
            />

            {/* Sidebar Drawer */}
            <div
                className="fixed inset-y-0 left-0 w-[280px] bg-black z-50 flex flex-col overflow-hidden transform transition-transform"
                style={{
                    paddingTop: 'env(safe-area-inset-top)',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
                    <Link
                        href="/"
                        className="flex items-center gap-3"
                        onClick={onClose}
                    >
                        <Image
                            src="/assets/images/LIDIFY.webp"
                            alt="Lidify"
                            width={36}
                            height={36}
                            className="flex-shrink-0"
                        />
                        <span className="text-xl font-bold text-white tracking-tight">
                            Lidify
                        </span>
                    </Link>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-white transition-colors"
                        aria-label="Close menu"
                    >
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M15 5L5 15M5 5l10 10" />
                        </svg>
                    </button>
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 overflow-y-auto pt-6">
                    <div className="px-6 space-y-1">
                        {navigation.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={cn(
                                        "block py-3 transition-all",
                                        isActive
                                            ? "text-white"
                                            : "text-gray-500 hover:text-white active:text-gray-300"
                                    )}
                                >
                                    <span className={cn(
                                        "text-[17px] tracking-tight",
                                        isActive ? "font-semibold" : "font-medium"
                                    )}>
                                        {item.name}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>

                    {/* Playlists Section */}
                    <div className="mt-10 px-6">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-widest">
                                Playlists
                            </span>
                            <Link
                                href="/playlists"
                                className="text-[11px] font-medium text-gray-500 hover:text-white transition-colors"
                                title="View all"
                            >
                                View All
                            </Link>
                        </div>

                        {isLoadingPlaylists ? (
                            <div className="py-2 text-sm text-gray-600">
                                Loading...
                            </div>
                        ) : playlists.length === 0 ? (
                            <Link
                                href="/playlists"
                                className="block py-2 text-sm text-gray-600 hover:text-white transition-colors"
                            >
                                Create your first playlist
                            </Link>
                        ) : (
                            <div className="space-y-0.5">
                                {playlists.slice(0, 6).map((playlist) => {
                                    const isActive = pathname === `/playlist/${playlist.id}`;
                                    return (
                                        <Link
                                            key={playlist.id}
                                            href={`/playlist/${playlist.id}`}
                                            className={cn(
                                                "block py-2.5 transition-colors",
                                                isActive
                                                    ? "text-white"
                                                    : "text-gray-500 hover:text-white"
                                            )}
                                        >
                                            <div className={cn(
                                                "text-[15px] truncate",
                                                isActive ? "font-medium" : ""
                                            )}>
                                                {playlist.name}
                                            </div>
                                            <div className="text-[12px] text-gray-600 mt-0.5">
                                                {playlist.trackCount} songs
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Bottom Actions */}
                    <div className="mt-auto border-t border-white/[0.06] px-6 py-5">
                        <div className="flex items-center justify-between">
                            <Link
                                href="/settings"
                                className={cn(
                                    "text-[15px] transition-colors",
                                    pathname === "/settings"
                                        ? "text-white font-medium"
                                        : "text-gray-500 hover:text-white"
                                )}
                            >
                                Settings
                            </Link>
                            <button
                                onClick={async () => {
                                    try {
                                        await api.scanLibrary();
                                        onClose();
                                    } catch (error) {
                                        console.error("Failed to sync library:", error);
                                    }
                                }}
                                className="text-[15px] text-gray-500 hover:text-white transition-colors"
                            >
                                Sync Library
                            </button>
                        </div>
                    </div>
                </nav>
            </div>
        </>
    );
}
