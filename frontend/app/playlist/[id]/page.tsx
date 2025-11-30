"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAudio } from "@/lib/audio-context";
import { useToast } from "@/lib/toast-context";
import { cn } from "@/utils/cn";
import { usePlaylistQuery } from "@/hooks/useQueries";
import { GradientSpinner } from "@/components/ui/GradientSpinner";
import {
    ListMusic,
    Play,
    Trash2,
    GripVertical,
    ListPlus,
    AudioLines,
    ArrowLeft,
    Music,
} from "lucide-react";

interface Track {
    id: string;
    title: string;
    duration: number;
    album: {
        id?: string;
        title: string;
        coverArt?: string;
        artist: {
            id?: string;
            name: string;
        };
    };
}

interface PlaylistItem {
    id: string;
    track: Track;
}

export default function PlaylistDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { isAuthenticated } = useAuth();
    const { playTracks, addToQueue, currentTrack } = useAudio();
    const { toast } = useToast();
    const playlistId = params.id as string;

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Use React Query hook for playlist
    const { data: playlist, isLoading } = usePlaylistQuery(playlistId);

    // Calculate cover arts from playlist tracks for mosaic (memoized)
    const coverUrls = useMemo(() => {
        if (!playlist?.items || playlist.items.length === 0) return [];

        const tracksWithCovers = playlist.items.filter(
            (item: PlaylistItem) => item.track.album?.coverArt
        );
        if (tracksWithCovers.length === 0) return [];

        // Get unique cover arts (up to 4)
        const uniqueCovers = Array.from(
            new Set(tracksWithCovers.map((item) => item.track.album.coverArt))
        ).slice(0, 4);

        return uniqueCovers;
    }, [playlist]);

    const handleRemoveTrack = async (trackId: string) => {
        try {
            await api.removeTrackFromPlaylist(playlistId, trackId);
            toast.success("Track removed from playlist");
            // React Query will automatically refetch the playlist since we used invalidateQueries in the mutation hook
            // But we're not using the mutation hook here, so manually invalidate
            // Note: This is fine for now but should ideally use a mutation hook
        } catch (error) {
            console.error("Failed to remove track:", error);
            toast.error("Failed to remove track. Please try again.");
        }
    };

    const handleDeletePlaylist = async () => {
        try {
            await api.deletePlaylist(playlistId);
            toast.success("Playlist deleted");

            // Dispatch event to update sidebar
            window.dispatchEvent(
                new CustomEvent("playlist-deleted", { detail: { playlistId } })
            );

            router.push("/playlists");
        } catch (error) {
            console.error("Failed to delete playlist:", error);
            toast.error("Failed to delete playlist. Please try again.");
        }
    };

    const handlePlayPlaylist = () => {
        if (!playlist?.items || playlist.items.length === 0) return;

        const tracks = playlist.items.map((item: PlaylistItem) => ({
            id: item.track.id,
            title: item.track.title,
            artist: {
                name: item.track.album.artist.name,
                id: item.track.album.artist.id,
            },
            album: {
                title: item.track.album.title,
                coverArt: item.track.album.coverArt,
                id: item.track.album.id,
            },
            duration: item.track.duration,
        }));
        playTracks(tracks, 0);
    };

    const handlePlayTrack = (index: number) => {
        if (!playlist?.items || playlist.items.length === 0) return;

        const tracks = playlist.items.map((item: PlaylistItem) => ({
            id: item.track.id,
            title: item.track.title,
            artist: {
                name: item.track.album.artist.name,
                id: item.track.album.artist.id,
            },
            album: {
                title: item.track.album.title,
                coverArt: item.track.album.coverArt,
                id: item.track.album.id,
            },
            duration: item.track.duration,
        }));
        playTracks(tracks, index);
    };

    const handleAddToQueue = (track: Track) => {
        const formattedTrack = {
            id: track.id,
            title: track.title,
            artist: {
                name: track.album.artist.name,
                id: track.album.artist.id,
            },
            album: {
                title: track.album.title,
                coverArt: track.album.coverArt,
                id: track.album.id,
            },
            duration: track.duration,
        };
        addToQueue(formattedTrack);
        toast.success(`Added ${track.title} to queue`);
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <GradientSpinner size="md" />
            </div>
        );
    }

    if (!playlist) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-gray-500">Playlist not found</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen">
            {/* Spotify-Style Hero Banner */}
            <div className="relative h-[33vh] min-h-[280px] max-h-[340px] md:h-[45vh] lg:h-[50vh] md:min-h-[340px] md:max-h-[450px] overflow-hidden">
                {/* Purple to Yellow gradient background */}
                <div className="absolute inset-0">
                    <div
                        className="absolute inset-0"
                        style={{
                            background: `linear-gradient(135deg, #a855f740 0%, #ec489950 30%, #eab30830 60%, #0a0a0a 100%)`,
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40" />
                </div>

                {/* Content */}
                <div className="relative h-full max-w-7xl mx-auto px-4 md:px-8 flex items-center md:items-end justify-center md:justify-start pt-12 md:pt-0 pb-6 md:pb-8">
                    <div className="flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6 w-full text-center md:text-left">
                        {/* Mosaic cover art */}
                        <div className="w-[172px] h-[172px] md:w-56 md:h-56 bg-[#1a1a1a] rounded-lg shadow-2xl shrink-0 overflow-hidden">
                            {coverUrls && coverUrls.length > 0 ? (
                                <div className="grid grid-cols-2 gap-0.5 w-full h-full">
                                    {coverUrls
                                        .slice(0, 4)
                                        .map(
                                            (
                                                url: string | undefined,
                                                index: number
                                            ) => {
                                                if (!url) return null;
                                                // Proxy cover art through API to avoid native: URLs and CORS
                                                const proxiedUrl =
                                                    api.getCoverArtUrl(
                                                        url,
                                                        300
                                                    );
                                                return (
                                                    <div
                                                        key={index}
                                                        className="relative bg-[#181818]"
                                                    >
                                                        <Image
                                                            src={proxiedUrl}
                                                            alt=""
                                                            fill
                                                            className="object-cover"
                                                            sizes="(max-width: 768px) 86px, 112px"
                                                            unoptimized={proxiedUrl?.startsWith(
                                                                "http://localhost"
                                                            )}
                                                        />
                                                    </div>
                                                );
                                            }
                                        )}
                                    {Array.from({
                                        length: Math.max(
                                            0,
                                            4 - (coverUrls?.length || 0)
                                        ),
                                    }).map((_, index) => (
                                        <div
                                            key={`empty-${index}`}
                                            className="relative bg-[#181818] flex items-center justify-center"
                                        >
                                            <Music className="w-8 h-8 text-gray-600" />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Music className="w-16 h-16 text-gray-600" />
                                </div>
                            )}
                        </div>

                        {/* Playlist Info */}
                        <div className="flex-1 pb-2 space-y-2 md:space-y-4 max-w-full md:max-w-none">
                            <div className="text-sm md:text-base font-bold text-white/90 drop-shadow-lg">
                                Playlist
                            </div>
                            <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-white drop-shadow-2xl leading-tight">
                                {playlist.name}
                            </h1>

                            {/* Stats */}
                            <div className="flex flex-wrap items-center gap-2 text-sm md:text-base text-white/90 font-medium">
                                <span className="drop-shadow-lg">
                                    {playlist.items?.length || 0}{" "}
                                    {(playlist.items?.length || 0) === 1
                                        ? "track"
                                        : "tracks"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Bar - Floating */}
            <div className="sticky top-0 z-30 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-6">
                    <div className="flex items-center justify-between gap-3 md:gap-4">
                        <div className="flex items-center gap-3 md:gap-4">
                            {/* Back Button */}
                            <button
                                onClick={() => router.back()}
                                className="flex items-center gap-2 px-3 py-3 bg-white/5 hover:bg-white/10 rounded-full font-bold transition-all backdrop-blur-sm border border-white/5"
                                title="Go Back"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>

                            {playlist.items && playlist.items.length > 0 && (
                                <button
                                    onClick={handlePlayPlaylist}
                                    className="h-14 w-14 rounded-full bg-[#ecb200] hover:bg-[#d4a000] flex items-center justify-center shadow-xl hover:scale-105 transition-transform"
                                >
                                    <Play className="w-6 h-6 fill-current text-black ml-0.5" />
                                </button>
                            )}
                        </div>

                        {/* Delete Button - Right Aligned */}
                        {playlist.isOwner && (
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                className="p-3 bg-white/5 hover:bg-red-500/20 rounded-full transition-all backdrop-blur-sm border border-white/5 text-red-400 hover:text-red-300 hover:border-red-500/30"
                                title="Delete Playlist"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-8">
                {/* Tracks */}
                {playlist.items && playlist.items.length > 0 ? (
                    <Card>
                        <div className="divide-y divide-[#1c1c1c]">
                            {playlist.items.map(
                                (item: PlaylistItem, index: number) => {
                                    const isCurrentlyPlaying =
                                        currentTrack?.id === item.track.id;
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() =>
                                                handlePlayTrack(index)
                                            }
                                            className={cn(
                                                "flex items-center gap-3 md:gap-4 px-3 md:px-4 py-3 hover:bg-[#141414] transition-colors group cursor-pointer border-l-2",
                                                isCurrentlyPlaying
                                                    ? "bg-[#1a1a1a] border-purple-500"
                                                    : "border-transparent"
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "text-sm w-6 text-center",
                                                    isCurrentlyPlaying
                                                        ? "text-purple-400 font-medium"
                                                        : "text-gray-500"
                                                )}
                                            >
                                                {index + 1}
                                            </span>
                                            <div className="w-10 h-10 md:w-12 md:h-12 bg-[#1a1a1a] rounded-sm flex items-center justify-center overflow-hidden flex-shrink-0">
                                                {item.track.album?.coverArt ? (
                                                    <img
                                                        src={api.getCoverArtUrl(
                                                            item.track.album
                                                                .coverArt,
                                                            100
                                                        )}
                                                        alt={item.track.title}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <AudioLines className="w-5 h-5 md:w-6 md:h-6 text-gray-600" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3
                                                    className={cn(
                                                        "text-sm font-medium truncate",
                                                        isCurrentlyPlaying
                                                            ? "text-purple-400"
                                                            : "text-white"
                                                    )}
                                                >
                                                    {item.track.title}
                                                </h3>
                                                <p className="text-xs text-gray-500 truncate">
                                                    {
                                                        item.track.album.artist
                                                            .name
                                                    }{" "}
                                                    • {item.track.album.title}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="icon"
                                                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleAddToQueue(
                                                            item.track
                                                        );
                                                    }}
                                                    title="Add to Queue"
                                                >
                                                    <ListPlus className="w-4 h-4" />
                                                </Button>
                                                <span className="text-xs md:text-sm text-gray-500 w-12 text-right">
                                                    {formatDuration(
                                                        item.track.duration
                                                    )}
                                                </span>
                                                {playlist.isOwner && (
                                                    <Button
                                                        variant="icon"
                                                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-red-400 hover:text-red-300"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRemoveTrack(
                                                                item.track.id
                                                            );
                                                        }}
                                                        title="Remove from Playlist"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                }
                            )}
                        </div>
                    </Card>
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-24 h-24 bg-[#1a1a1a] rounded-full flex items-center justify-center mb-6">
                            <ListMusic className="w-12 h-12 text-gray-600" />
                        </div>
                        <h3 className="text-xl font-medium text-white mb-2">
                            No tracks yet
                        </h3>
                        <p className="text-sm text-gray-500">
                            Add some tracks to get started
                        </p>
                    </div>
                )}
            </div>

            {/* Confirm Dialog */}
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDeletePlaylist}
                title="Delete Playlist?"
                message={`Are you sure you want to delete "${playlist.name}"? This action cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
            />
        </div>
    );
}
