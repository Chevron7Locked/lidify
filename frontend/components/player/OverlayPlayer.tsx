"use client";

import { useAudio } from "@/lib/audio-context";
import { api } from "@/lib/api";
import Image from "next/image";
import Link from "next/link";
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    X,
    Music as MusicIcon,
} from "lucide-react";
import { formatTime } from "@/utils/formatTime";
import { isLocalUrl } from "@/utils/cn";

export function OverlayPlayer() {
    const {
        currentTrack,
        currentAudiobook,
        currentPodcast,
        playbackType,
        isPlaying,
        currentTime,
        canSeek,
        downloadProgress,
        pause,
        resume,
        next,
        previous,
        returnToPreviousMode,
        seek,
        duration: playbackDuration,
    } = useAudio();
    const duration = (() => {
        // Prefer canonical durations for long-form media to avoid stale/misreported playbackDuration.
        if (playbackType === "podcast" && currentPodcast?.duration) {
            return currentPodcast.duration;
        }
        if (playbackType === "audiobook" && currentAudiobook?.duration) {
            return currentAudiobook.duration;
        }
        return (
            playbackDuration ||
            currentTrack?.duration ||
            currentAudiobook?.duration ||
            currentPodcast?.duration ||
            0
        );
    })();

    if (!currentTrack && !currentAudiobook && !currentPodcast) return null;

    // For audiobooks/podcasts, show saved progress even before playback starts
    const displayTime = (() => {
        if (currentTime > 0) return currentTime;
        
        if (playbackType === "audiobook" && currentAudiobook?.progress?.currentTime) {
            return currentAudiobook.progress.currentTime;
        }
        if (playbackType === "podcast" && currentPodcast?.progress?.currentTime) {
            return currentPodcast.progress.currentTime;
        }
        
        return currentTime;
    })();

    const progress = duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0;

    // Determine if seeking is allowed
    const seekEnabled = canSeek;

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        // Don't allow seeking if canSeek is false (uncached podcast)
        if (!canSeek) {
            console.log("[OverlayPlayer] Seeking disabled - podcast not cached");
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = x / rect.width;
        const time = percentage * duration;

        // Use the context's seek function which will update the shared audio element
        seek(time);
    };

    // Get current media info
    let title = "";
    let subtitle = "";
    let coverUrl: string | null = null;
    let albumLink: string | null = null;
    let artistLink: string | null = null;
    let mediaLink: string | null = null;

    if (playbackType === "track" && currentTrack) {
        title = currentTrack.title;
        subtitle = currentTrack.artist?.name || "Unknown Artist";
        coverUrl = currentTrack.album?.coverArt
            ? api.getCoverArtUrl(currentTrack.album.coverArt, 500)
            : null;
        albumLink = currentTrack.album?.id ? `/album/${currentTrack.album.id}` : null;
        artistLink = currentTrack.artist?.id ? `/artist/${currentTrack.artist.id}` : null;
        mediaLink = albumLink;
    } else if (playbackType === "audiobook" && currentAudiobook) {
        title = currentAudiobook.title;
        subtitle = currentAudiobook.author;
        coverUrl = currentAudiobook.coverUrl
            ? api.getCoverArtUrl(currentAudiobook.coverUrl, 500)
            : null;
        mediaLink = `/audiobooks/${currentAudiobook.id}`;
    } else if (playbackType === "podcast" && currentPodcast) {
        title = currentPodcast.title;
        subtitle = currentPodcast.podcastTitle;
        coverUrl = currentPodcast.coverUrl
            ? api.getCoverArtUrl(currentPodcast.coverUrl, 500)
            : null;
        const podcastId = currentPodcast.id.split(":")[0];
        mediaLink = `/podcasts/${podcastId}`;
    }

    return (
        <div className="fixed inset-0 bg-gradient-to-b from-[#1a1a2e] via-[#121212] to-[#000000] z-[9999] flex flex-col overflow-hidden touch-auto">
            {/* Close Button */}
            <button
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    returnToPreviousMode();
                }}
                className="absolute right-4 md:right-8 text-gray-400 hover:text-white transition-colors p-3 md:p-2 rounded-full hover:bg-white/10 z-[10000] bg-black/30 backdrop-blur-sm"
                style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
                title="Close full screen"
            >
                <X className="w-6 h-6 md:w-7 md:h-7" />
            </button>

            {/* Main Content - Centered */}
            <div className="flex-1 flex items-center justify-center p-4 md:p-8 lg:p-12">
                <div className="w-full max-w-7xl flex flex-col md:grid md:grid-cols-2 md:gap-8 lg:gap-12 items-center justify-center">
                    {/* Large Artwork - Circular */}
                    <div className="w-full max-w-sm md:max-w-none aspect-square mb-6 md:mb-0 relative group flex-shrink-0">
                        {/* Glow effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent rounded-full blur-3xl opacity-30 group-hover:opacity-50 transition-opacity duration-500" />

                        {/* Main circular artwork */}
                        <div className="relative w-4/5 h-4/5 mx-auto bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded-full overflow-hidden shadow-2xl border border-white/5">
                            {coverUrl ? (
                                <Image
                                    key={coverUrl}
                                    src={coverUrl}
                                    alt={title}
                                    fill
                                    sizes="(max-width: 768px) 320px, (max-width: 1024px) 400px, 500px"
                                    className="object-cover"
                                    priority
                                    unoptimized={isLocalUrl(coverUrl)}
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <MusicIcon className="w-32 h-32 md:w-48 md:h-48 text-gray-600" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Info & Controls */}
                    <div className="w-full flex flex-col justify-center">
                        {/* Track Info */}
                        <div className="mb-6 md:mb-8 lg:mb-12">
                            {mediaLink ? (
                                <Link href={mediaLink} onClick={returnToPreviousMode} className="block hover:underline">
                                    <h1 className="text-2xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-2 md:mb-4 leading-tight">
                                        {title}
                                    </h1>
                                </Link>
                            ) : (
                                <h1 className="text-2xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-2 md:mb-4 leading-tight">
                                    {title}
                                </h1>
                            )}
                            {artistLink ? (
                                <Link href={artistLink} onClick={returnToPreviousMode} className="block hover:underline">
                                    <p className="text-base md:text-xl lg:text-2xl text-gray-300 font-medium">
                                        {subtitle}
                                    </p>
                                </Link>
                            ) : mediaLink ? (
                                <Link href={mediaLink} onClick={returnToPreviousMode} className="block hover:underline">
                                    <p className="text-base md:text-xl lg:text-2xl text-gray-300 font-medium">
                                        {subtitle}
                                    </p>
                                </Link>
                            ) : (
                                <p className="text-base md:text-xl lg:text-2xl text-gray-300 font-medium">
                                    {subtitle}
                                </p>
                            )}
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-8 lg:mb-10">
                            <div
                                className={`w-full h-2 bg-white/[0.15] rounded-full ${seekEnabled ? "cursor-pointer" : "cursor-not-allowed"} group mb-4`}
                                onClick={seekEnabled ? handleSeek : undefined}
                                title={!canSeek 
                                    ? downloadProgress !== null 
                                        ? `Downloading ${downloadProgress}%... Seek will be available when cached`
                                        : "Downloading... Seeking will be available when cached" 
                                    : "Click to seek"}
                            >
                                <div
                                    className={`h-full rounded-full relative transition-all duration-150 ${seekEnabled ? "bg-white" : "bg-white/50"}`}
                                    style={{ width: `${progress}%` }}
                                >
                                    {seekEnabled && (
                                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg shadow-white/50 group-hover:scale-110" />
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-between text-sm md:text-base text-gray-400 font-medium tabular-nums">
                                <span>{formatTime(displayTime)}</span>
                                <span>{formatTime(duration)}</span>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-center gap-6 md:gap-10">
                            <button
                                onClick={previous}
                                className="text-gray-300 hover:text-white transition-all duration-200 hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
                                disabled={playbackType !== "track"}
                                title={
                                    playbackType !== "track"
                                        ? "Skip only available for music"
                                        : "Previous"
                                }
                            >
                                <SkipBack className="w-8 h-8 md:w-10 md:h-10" />
                            </button>

                            <button
                                onClick={isPlaying ? pause : resume}
                                className="w-16 h-16 md:w-24 md:h-24 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-all duration-300 shadow-2xl shadow-white/30 hover:shadow-white/50 relative group"
                                title={isPlaying ? "Pause" : "Play"}
                            >
                                <div className="absolute inset-0 rounded-full bg-white blur-xl opacity-0 group-hover:opacity-60 transition-opacity duration-300" />
                                {isPlaying ? (
                                    <Pause className="w-8 h-8 md:w-12 md:h-12 relative z-10" />
                                ) : (
                                    <Play className="w-8 h-8 md:w-12 md:h-12 ml-1 relative z-10" />
                                )}
                            </button>

                            <button
                                onClick={next}
                                className="text-gray-300 hover:text-white transition-all duration-200 hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
                                disabled={playbackType !== "track"}
                                title={
                                    playbackType !== "track"
                                        ? "Skip only available for music"
                                        : "Next"
                                }
                            >
                                <SkipForward className="w-8 h-8 md:w-10 md:h-10" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
