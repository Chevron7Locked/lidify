"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { api } from "@/lib/api";
import { useAudio } from "@/lib/audio-context";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Card } from "@/components/ui/Card";
import { Play, Music, ArrowLeft, Shuffle, Save } from "lucide-react";
import { cn, isLocalUrl } from "@/utils/cn";
import { toast } from "sonner";
import { useMixQuery } from "@/hooks/useQueries";

export default function MixPage() {
    const params = useParams();
    const router = useRouter();
    const mixId = params.id as string;
    const { playTracks, currentTrack } = useAudio();

    // Use React Query hook for mix
    const { data: mix, isLoading } = useMixQuery(mixId);

    const [isSaving, setIsSaving] = useState(false);

    // Use standard purple/yellow gradient for mix feature
    const mixColors = {
        primary: "#a855f7", // Purple
        secondary: "#eab308", // Yellow
        gradient:
            "linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #eab308 100%)",
    };

    const handlePlayMix = () => {
        if (!mix || !mix.tracks) return;

        const tracks = mix.tracks.map((track: any) => ({
            id: track.id,
            title: track.title,
            artist: {
                name: track.album.artist.name,
                id: track.album.artist.id,
            },
            album: {
                title: track.album.title,
                coverArt: track.album.coverUrl,
                id: track.albumId,
            },
            duration: track.duration,
        }));

        playTracks(tracks, 0);
    };

    const handleShuffle = () => {
        if (!mix || !mix.tracks) return;

        const tracks = mix.tracks.map((track: any) => ({
            id: track.id,
            title: track.title,
            artist: {
                name: track.album.artist.name,
                id: track.album.artist.id,
            },
            album: {
                title: track.album.title,
                coverArt: track.album.coverUrl,
                id: track.albumId,
            },
            duration: track.duration,
        }));

        // Shuffle array
        const shuffled = [...tracks].sort(() => Math.random() - 0.5);
        playTracks(shuffled, 0);
    };

    const handleSaveAsPlaylist = async () => {
        if (!mix) return;

        setIsSaving(true);
        try {
            const result = await api.saveMixAsPlaylist(mixId);
            toast.success(`Saved as "${result.name}" playlist!`);

            // Notify sidebar to refresh playlists
            window.dispatchEvent(new Event("playlist-created"));

            // Optionally redirect to the new playlist
            setTimeout(() => {
                router.push(`/playlist/${result.id}`);
            }, 1000);
        } catch (error: any) {
            console.error("Failed to save mix as playlist:", error);
            const status = error?.status;
            const data = error?.data;
            if (status === 409) {
                toast.info("You've already saved this mix as a playlist.");
                if (data?.playlistId) {
                    setTimeout(() => {
                        router.push(`/playlist/${data.playlistId}`);
                    }, 1000);
                }
            } else if (error instanceof Error) {
                toast.error(error.message);
            } else {
                toast.error("Failed to save mix as playlist");
            }
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <LoadingScreen message="Loading mix..." />;
    }

    if (!mix) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-white mb-4">
                        Mix not found
                    </h1>
                    <button
                        onClick={() => router.push("/")}
                        className="text-purple-400 hover:text-purple-300 hover:underline"
                    >
                        Go back home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen">
            {/* Spotify-Style Hero Banner */}
            <div className="relative h-[450px] md:h-[45vh] lg:h-[50vh] md:min-h-[340px] md:max-h-[450px] overflow-hidden">
                {/* Purple to Yellow gradient background */}
                <div className="absolute inset-0">
                    <div
                        className="absolute inset-0"
                        style={{
                            background: `linear-gradient(135deg, ${mixColors.primary}40 0%, #ec489950 30%, ${mixColors.secondary}30 60%, #0a0a0a 100%)`,
                        }}
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-[#0a0a0a] via-transparent to-transparent" />
                    <div className="absolute inset-0 bg-linear-to-r from-black/40 via-transparent to-black/40" />
                </div>

                {/* Content */}
                <div className="relative h-full max-w-7xl mx-auto px-4 md:px-8 flex items-center md:items-end justify-center md:justify-start pb-6 md:pb-8">
                    <div className="flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6 w-full text-center md:text-left">
                        {/* Mosaic cover art */}
                        <div className="w-[172px] h-[172px] md:w-56 md:h-56 bg-[#1a1a1a] rounded-lg shadow-2xl shrink-0 overflow-hidden">
                            {mix.coverUrls && mix.coverUrls.length > 0 ? (
                                <div className="grid grid-cols-2 gap-0.5 w-full h-full">
                                    {mix.coverUrls
                                        .slice(0, 4)
                                        .map((url: string, index: number) => {
                                            // Proxy cover art through API to avoid native: URLs and CORS
                                            const proxiedUrl =
                                                api.getCoverArtUrl(url, 300);
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
                                                        unoptimized={proxiedUrl ? isLocalUrl(proxiedUrl) : false}
                                                    />
                                                </div>
                                            );
                                        })}
                                    {Array.from({
                                        length: Math.max(
                                            0,
                                            4 - (mix.coverUrls?.length || 0)
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

                        {/* Mix Info */}
                        <div className="flex-1 pb-2 space-y-2 md:space-y-4 max-w-full md:max-w-none">
                            <div className="text-sm md:text-base font-bold text-white/90 drop-shadow-lg">
                                Playlist
                            </div>
                            <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-white drop-shadow-2xl leading-tight">
                                {mix.name}
                            </h1>

                            <p className="text-sm md:text-base text-white/80 drop-shadow-lg leading-relaxed">
                                {mix.description}
                            </p>

                            {/* Stats */}
                            <div className="flex flex-wrap items-center gap-2 text-sm md:text-base text-white/90 font-medium">
                                <span className="drop-shadow-lg">
                                    {mix.trackCount}{" "}
                                    {mix.trackCount === 1 ? "track" : "tracks"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Bar - Floating */}
            <div className="sticky top-0 z-30 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-6">
                    <div className="flex items-center gap-3 md:gap-4">
                        <button
                            onClick={handlePlayMix}
                            className="h-14 w-14 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center shadow-xl hover:scale-105 transition-all border border-white/10 backdrop-blur-sm"
                        >
                            <Play className="w-6 h-6 fill-current text-white ml-0.5" />
                        </button>
                        <button
                            onClick={handleShuffle}
                            className="flex items-center gap-2 px-4 md:px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full font-bold transition-all backdrop-blur-sm border border-white/5"
                        >
                            <Shuffle className="w-5 h-5" />
                            <span className="hidden sm:inline">Shuffle</span>
                        </button>
                        <button
                            onClick={handleSaveAsPlaylist}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-4 md:px-6 py-3 bg-purple-600/20 hover:bg-purple-600/30 rounded-full font-bold transition-all backdrop-blur-sm border border-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save className="w-5 h-5" />
                            <span className="hidden sm:inline">
                                {isSaving ? "Saving..." : "Save as Playlist"}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="relative">
                {/* Purple/Yellow gradient from hero */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: `linear-gradient(to bottom, ${mixColors.primary}15 0%, #ec489910 15%, ${mixColors.secondary}08 30%, transparent 50%)`,
                    }}
                />
                {/* Subtle texture overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgba(16,16,16,0.4)_100%)] pointer-events-none" />

                <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-8">
                    <Card>
                        <div className="divide-y divide-[#1c1c1c]">
                            {mix.tracks &&
                                mix.tracks.map((track: any, index: number) => {
                                    const isPlaying =
                                        currentTrack?.id === track.id;
                                    return (
                                        <div
                                            key={track.id}
                                            onClick={() => {
                                                const tracks = mix.tracks.map(
                                                    (t: any) => ({
                                                        id: t.id,
                                                        title: t.title,
                                                        artist: {
                                                            name: t.album.artist
                                                                .name,
                                                            id: t.album.artist
                                                                .id,
                                                        },
                                                        album: {
                                                            title: t.album
                                                                .title,
                                                            coverArt:
                                                                t.album
                                                                    .coverUrl,
                                                            id: t.albumId,
                                                        },
                                                        duration: t.duration,
                                                    })
                                                );
                                                playTracks(tracks, index);
                                            }}
                                            className={cn(
                                                "flex items-center gap-4 px-4 py-3 transition-colors group border-l-2 cursor-pointer hover:bg-[#1a1a1a]",
                                                isPlaying
                                                    ? "bg-[#1a1a1a] border-purple-500"
                                                    : "border-transparent"
                                            )}
                                        >
                                            <div className="w-10 flex items-center justify-center">
                                                <span className="text-sm text-gray-400 group-hover:hidden">
                                                    {index + 1}
                                                </span>
                                                <Play className="w-4 h-4 hidden group-hover:block text-white fill-current" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3
                                                    className={cn(
                                                        "font-medium truncate",
                                                        isPlaying
                                                            ? "text-purple-400"
                                                            : "text-white"
                                                    )}
                                                >
                                                    {track.title}
                                                </h3>
                                                <p className="text-sm text-gray-400 truncate">
                                                    {track.album.artist.name}
                                                </p>
                                            </div>
                                            <div className="hidden md:block flex-1 min-w-0">
                                                <p className="text-sm text-gray-400 truncate">
                                                    {track.album.title}
                                                </p>
                                            </div>
                                            <span className="text-sm text-gray-400 w-12 text-right">
                                                {Math.floor(
                                                    track.duration / 60
                                                )}
                                                :
                                                {String(
                                                    track.duration % 60
                                                ).padStart(2, "0")}
                                            </span>
                                        </div>
                                    );
                                })}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
