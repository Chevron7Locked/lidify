"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { usePlaylistsQuery } from "@/hooks/useQueries";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/useQueries";
import { useAuth } from "@/lib/auth-context";
import { useAudio } from "@/lib/audio-context";
import { ListMusic, Plus, Play, Music, Eye, EyeOff, Archive } from "lucide-react";
import { GradientSpinner } from "@/components/ui/GradientSpinner";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { cn, isLocalUrl } from "@/utils/cn";

// Lidify brand yellow
const LIDIFY_YELLOW = "#ecb200";

interface PlaylistItem {
    id: string;
    track: {
        album?: {
            coverArt?: string;
        };
    };
}

interface Playlist {
    id: string;
    name: string;
    trackCount?: number;
    items?: PlaylistItem[];
    isOwner?: boolean;
    isHidden?: boolean;
    user?: {
        username: string;
    };
}

// Generate mosaic cover from playlist tracks
function PlaylistMosaic({ items, size = 4, greyed = false }: { items?: PlaylistItem[]; size?: number; greyed?: boolean }) {
    const coverUrls = useMemo(() => {
        if (!items || items.length === 0) return [];

        const tracksWithCovers = items.filter(
            (item) => item.track?.album?.coverArt
        );
        if (tracksWithCovers.length === 0) return [];

        // Get unique cover arts (up to 4)
        const uniqueCovers = Array.from(
            new Set(tracksWithCovers.map((item) => item.track.album!.coverArt))
        ).slice(0, size);

        return uniqueCovers.map(cover => api.getCoverArtUrl(cover!, 200));
    }, [items, size]);

    if (coverUrls.length === 0) {
        return (
            <div className={cn(
                "w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1a1a1a] to-[#0f0f0f]",
                greyed && "opacity-50"
            )}>
                <ListMusic className="w-12 h-12 text-gray-600" />
            </div>
        );
    }

    if (coverUrls.length === 1) {
        return (
            <Image
                src={coverUrls[0]}
                alt=""
                fill
                className={cn("object-cover", greyed && "opacity-50 grayscale")}
                sizes="200px"
                unoptimized
            />
        );
    }

    return (
        <div className={cn("grid grid-cols-2 w-full h-full", greyed && "opacity-50 grayscale")}>
            {coverUrls.slice(0, 4).map((url, index) => (
                <div key={index} className="relative">
                    <Image
                        src={url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="100px"
                        unoptimized
                    />
                </div>
            ))}
            {Array.from({ length: Math.max(0, 4 - coverUrls.length) }).map((_, index) => (
                <div
                    key={`empty-${index}`}
                    className="relative bg-[#181818] flex items-center justify-center"
                >
                    <Music className="w-6 h-6 text-gray-600" />
                </div>
            ))}
        </div>
    );
}

function PlaylistCard({
    playlist,
    index,
    onPlay,
    onToggleHide,
    isHiddenView = false,
}: {
    playlist: Playlist;
    index: number;
    onPlay: (playlistId: string) => void;
    onToggleHide: (playlistId: string, hide: boolean) => void;
    isHiddenView?: boolean;
}) {
    const isShared = playlist.isOwner === false;
    const [isHiding, setIsHiding] = useState(false);
    
    // Debug: log shared playlist info
    if (isShared) {
        console.log(`[Shared Playlist] "${playlist.name}" - isOwner: ${playlist.isOwner}, user:`, playlist.user);
    }

    const handleToggleHide = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsHiding(true);
        try {
            await onToggleHide(playlist.id, !playlist.isHidden);
        } finally {
            setIsHiding(false);
        }
    };

    return (
        <Link href={`/playlist/${playlist.id}`}>
            <Card
                className={cn(
                    "group cursor-pointer relative",
                    isHiddenView && "opacity-60 hover:opacity-100 transition-opacity"
                )}
                data-tv-card
                data-tv-card-index={index}
                tabIndex={0}
            >
                {/* Cover Image */}
                <div className="relative aspect-square mb-3 rounded-lg overflow-hidden bg-[#1a1a1a]">
                    <PlaylistMosaic items={playlist.items} greyed={isHiddenView} />

                    {/* Shared badge with owner name */}
                    {isShared && (
                        <div className="absolute top-2 left-2 px-2 py-1 bg-purple-500/80 backdrop-blur-sm rounded-full text-xs font-medium text-white flex items-center gap-1">
                            {playlist.user?.username || "Shared"}
                        </div>
                    )}

                    {/* Hide/Unhide button for shared playlists */}
                    {isShared && (
                        <button
                            onClick={handleToggleHide}
                            disabled={isHiding}
                            className={cn(
                                "absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center",
                                "backdrop-blur-sm transition-all duration-200",
                                "opacity-0 group-hover:opacity-100",
                                playlist.isHidden
                                    ? "bg-green-500/80 hover:bg-green-500"
                                    : "bg-black/50 hover:bg-black/70",
                                isHiding && "opacity-50 cursor-not-allowed"
                            )}
                            title={playlist.isHidden ? "Show playlist" : "Hide playlist"}
                        >
                            {playlist.isHidden ? (
                                <Eye className="w-4 h-4 text-white" />
                            ) : (
                                <EyeOff className="w-4 h-4 text-white" />
                            )}
                        </button>
                    )}

                    {/* Play button overlay */}
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onPlay(playlist.id);
                        }}
                        style={{ backgroundColor: LIDIFY_YELLOW }}
                        className={cn(
                            "absolute bottom-2 right-2 w-12 h-12 rounded-full flex items-center justify-center",
                            "shadow-lg shadow-black/40 transition-all duration-300 hover:brightness-90",
                            "hover:scale-105 focus-visible:outline-none focus-visible:ring-2",
                            "opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0"
                        )}
                        title="Play playlist"
                    >
                        <Play className="w-5 h-5 fill-current ml-0.5 text-black" />
                    </button>
                </div>

                {/* Title and info */}
                <h3 className={cn(
                    "text-sm font-medium truncate mb-1",
                    isHiddenView ? "text-gray-400" : "text-white"
                )}>
                    {playlist.name}
                </h3>
                <p className="text-xs text-gray-500 truncate">
                    {isShared && playlist.user?.username ? (
                        <>by {playlist.user.username} · </>
                    ) : null}
                    {playlist.trackCount || 0}{" "}
                    {playlist.trackCount === 1 ? "track" : "tracks"}
                </p>
            </Card>
        </Link>
    );
}

export default function PlaylistsPage() {
    const router = useRouter();
    const { isAuthenticated } = useAuth();
    const { playTracks } = useAudio();
    const queryClient = useQueryClient();
    const [showHiddenTab, setShowHiddenTab] = useState(false);

    // Use React Query hook for playlists
    const { data: playlists = [], isLoading } = usePlaylistsQuery();

    // Separate visible and hidden playlists
    const { visiblePlaylists, hiddenPlaylists } = useMemo(() => {
        const visible: Playlist[] = [];
        const hidden: Playlist[] = [];

        playlists.forEach((p: Playlist) => {
            if (p.isHidden) {
                hidden.push(p);
            } else {
                visible.push(p);
            }
        });

        return { visiblePlaylists: visible, hiddenPlaylists: hidden };
    }, [playlists]);

    // Count shared playlists (for display purposes)
    const sharedCount = useMemo(() => {
        return playlists.filter((p: Playlist) => p.isOwner === false).length;
    }, [playlists]);

    // Listen for playlist events and invalidate cache
    useEffect(() => {
        const handlePlaylistEvent = () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.playlists() });
        };

        window.addEventListener("playlist-created", handlePlaylistEvent);
        window.addEventListener("playlist-updated", handlePlaylistEvent);
        window.addEventListener("playlist-deleted", handlePlaylistEvent);

        return () => {
            window.removeEventListener("playlist-created", handlePlaylistEvent);
            window.removeEventListener("playlist-updated", handlePlaylistEvent);
            window.removeEventListener("playlist-deleted", handlePlaylistEvent);
        };
    }, [queryClient]);

    const handlePlayPlaylist = async (playlistId: string) => {
        try {
            const playlist = await api.getPlaylist(playlistId);
            if (playlist?.items && playlist.items.length > 0) {
                const tracks = playlist.items.map((item: any) => ({
                    id: item.track.id,
                    title: item.track.title,
                    artist: {
                        name: item.track.album?.artist?.name || "Unknown",
                        id: item.track.album?.artist?.id,
                    },
                    album: {
                        title: item.track.album?.title || "Unknown",
                        coverArt: item.track.album?.coverArt,
                        id: item.track.album?.id,
                    },
                    duration: item.track.duration,
                }));
                playTracks(tracks, 0);
            }
        } catch (error) {
            console.error("Failed to play playlist:", error);
        }
    };

    const handleToggleHide = async (playlistId: string, hide: boolean) => {
        try {
            if (hide) {
                await api.hidePlaylist(playlistId);
            } else {
                await api.unhidePlaylist(playlistId);
            }
            // Invalidate and refetch playlists
            queryClient.invalidateQueries({ queryKey: queryKeys.playlists() });
        } catch (error) {
            console.error("Failed to toggle playlist visibility:", error);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <GradientSpinner size="md" />
            </div>
        );
    }

    const displayedPlaylists = showHiddenTab ? hiddenPlaylists : visiblePlaylists;

    return (
        <div className="min-h-screen relative">
            {/* Subtle gradient overlay - transparent to show galaxy stars */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute inset-0"
                    style={{
                        background: `linear-gradient(to bottom, ${LIDIFY_YELLOW}10 0%, transparent 30%)`,
                    }}
                />
            </div>

            {/* Header - matches library page */}
            <div className="relative">
                <div className="max-w-7xl mx-auto px-6 md:px-8 py-6 md:py-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-black text-white">
                                Playlists
                            </h1>
                            <p className="text-gray-400 mt-1">
                                {visiblePlaylists.length} {visiblePlaylists.length === 1 ? "playlist" : "playlists"}
                                {sharedCount > 0 && (
                                    <span className="text-purple-400"> · {sharedCount} shared</span>
                                )}
                            </p>
                        </div>

                        {/* Hidden Playlists Tab Toggle */}
                        {hiddenPlaylists.length > 0 && (
                            <button
                                onClick={() => setShowHiddenTab(!showHiddenTab)}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                                    showHiddenTab
                                        ? "bg-gray-500/20 text-gray-300 border border-gray-500/30"
                                        : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                                )}
                            >
                                <Archive className="w-4 h-4" />
                                <span className="hidden sm:inline">
                                    {showHiddenTab ? "Show All" : `Hidden (${hiddenPlaylists.length})`}
                                </span>
                                <span className="sm:hidden">{hiddenPlaylists.length}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="relative max-w-7xl mx-auto px-6 md:px-8 pb-24">
                {/* Hidden playlists section header */}
                {showHiddenTab && (
                    <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
                        <div className="flex items-center gap-2 text-gray-400">
                            <EyeOff className="w-4 h-4" />
                            <span className="text-sm">
                                These playlists are hidden from your main view. Hover over a playlist and click the eye icon to show it again.
                            </span>
                        </div>
                    </div>
                )}

                {displayedPlaylists.length > 0 ? (
                    <div
                        data-tv-section="playlists"
                        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4"
                    >
                        {displayedPlaylists.map((playlist: Playlist, index: number) => (
                            <PlaylistCard
                                key={playlist.id}
                                playlist={playlist}
                                index={index}
                                onPlay={handlePlayPlaylist}
                                onToggleHide={handleToggleHide}
                                isHiddenView={showHiddenTab}
                            />
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        icon={showHiddenTab ? <Archive className="w-16 h-16" /> : <ListMusic className="w-16 h-16" />}
                        title={showHiddenTab ? "No hidden playlists" : "No playlists yet"}
                        description={showHiddenTab
                            ? "You haven't hidden any shared playlists"
                            : "Create your first playlist by adding tracks from your library, albums, or artists"
                        }
                    >
                        {!showHiddenTab && (
                            <div className="mt-4 px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                                <p className="text-sm text-gray-400">
                                    Tip: Look for the{" "}
                                    <Plus className="w-4 h-4 inline mx-1 text-gray-300" />
                                    icon to add tracks to playlists
                                </p>
                            </div>
                        )}
                    </EmptyState>
                )}
            </div>
        </div>
    );
}
