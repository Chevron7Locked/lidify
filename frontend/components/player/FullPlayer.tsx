"use client";

import { useAudioState } from "@/lib/audio-state-context";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { useAudioControls } from "@/lib/audio-controls-context";
import { api } from "@/lib/api";
import Image from "next/image";
import Link from "next/link";
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
    Maximize2,
    Music as MusicIcon,
    Shuffle,
    Repeat,
    Repeat1,
    RotateCcw,
    RotateCw,
    Loader2,
} from "lucide-react";
import { KeyboardShortcutsTooltip } from "./KeyboardShortcutsTooltip";
import { cn, isLocalUrl } from "@/utils/cn";
import { formatTime } from "@/utils/formatTime";

/**
 * FullPlayer - UI-only component for desktop bottom player
 * Does NOT manage audio element - that's handled by AudioElement component
 */
export function FullPlayer() {
    // Use split contexts to avoid re-rendering on every currentTime update
    const {
        currentTrack,
        currentAudiobook,
        currentPodcast,
        playbackType,
        volume,
        isMuted,
        isShuffle,
        repeatMode,
        playerMode,
    } = useAudioState();

    const {
        isPlaying,
        isBuffering,
        currentTime,
        duration: playbackDuration,
        canSeek,
        downloadProgress,
    } = useAudioPlayback();

    const {
        pause,
        resume,
        next,
        previous,
        setPlayerMode,
        seek,
        skipForward,
        skipBackward,
        setVolume,
        toggleMute,
        toggleShuffle,
        toggleRepeat,
    } = useAudioControls();

    const duration =
        playbackDuration ||
        currentTrack?.duration ||
        currentAudiobook?.duration ||
        currentPodcast?.duration ||
        0;

    const hasMedia = !!(currentTrack || currentAudiobook || currentPodcast);

    // For audiobooks/podcasts, show saved progress even before playback starts
    // This provides immediate visual feedback of where the user left off
    const displayTime = (() => {
        // If we're actively playing or have seeked, use the live currentTime
        if (currentTime > 0) return currentTime;
        
        // Otherwise, show saved progress for audiobooks/podcasts
        if (playbackType === "audiobook" && currentAudiobook?.progress?.currentTime) {
            return currentAudiobook.progress.currentTime;
        }
        if (playbackType === "podcast" && currentPodcast?.progress?.currentTime) {
            return currentPodcast.progress.currentTime;
        }
        
        return currentTime;
    })();

    const progress = duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0;

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        // Don't allow seeking if canSeek is false (uncached podcast)
        if (!canSeek) {
            console.log("[FullPlayer] Seeking disabled - podcast not cached");
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = x / rect.width;
        const time = percentage * duration;
        seek(time);
    };

    // Determine if seeking is allowed
    const seekEnabled = hasMedia && canSeek;

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseInt(e.target.value) / 100;
        setVolume(newVolume);
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
            ? api.getCoverArtUrl(currentTrack.album.coverArt, 100)
            : null;
        albumLink = currentTrack.album?.id ? `/album/${currentTrack.album.id}` : null;
        artistLink = currentTrack.artist?.id ? `/artist/${currentTrack.artist.id}` : null;
        mediaLink = albumLink;
    } else if (playbackType === "audiobook" && currentAudiobook) {
        title = currentAudiobook.title;
        subtitle = currentAudiobook.author;
        coverUrl = currentAudiobook.coverUrl
            ? api.getCoverArtUrl(currentAudiobook.coverUrl, 100)
            : null;
        mediaLink = `/audiobooks/${currentAudiobook.id}`;
    } else if (playbackType === "podcast" && currentPodcast) {
        title = currentPodcast.title;
        subtitle = currentPodcast.podcastTitle;
        coverUrl = currentPodcast.coverUrl
            ? api.getCoverArtUrl(currentPodcast.coverUrl, 100)
            : null;
        const podcastId = currentPodcast.id.split(":")[0];
        mediaLink = `/podcasts/${podcastId}`;
    } else {
        // Idle state - no media playing
        title = "Not Playing";
        subtitle = "Select something to play";
    }

    return (
        <div className="h-24 bg-black border-t border-white/[0.08] flex-shrink-0">
            {/* Subtle top glow */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div className="flex items-center h-full px-6 gap-6">
                {/* Artwork & Info */}
                <div className="flex items-center gap-4 w-80">
                    {mediaLink ? (
                        <Link href={mediaLink} className="relative w-14 h-14 flex-shrink-0 group">
                            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-full blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            <div className="relative w-full h-full bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded-full overflow-hidden shadow-lg flex items-center justify-center">
                                {coverUrl ? (
                                    <Image
                                        key={coverUrl}
                                        src={coverUrl}
                                        alt={title}
                                        fill
                                        sizes="56px"
                                        className="object-cover"
                                        priority
                                        unoptimized={isLocalUrl(coverUrl)}
                                    />
                                ) : (
                                    <MusicIcon className="w-6 h-6 text-gray-500" />
                                )}
                            </div>
                        </Link>
                    ) : (
                        <div className="relative w-14 h-14 flex-shrink-0">
                            <div className="relative w-full h-full bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded-full overflow-hidden shadow-lg flex items-center justify-center">
                                <MusicIcon className="w-6 h-6 text-gray-500" />
                            </div>
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        {mediaLink ? (
                            <Link href={mediaLink} className="block hover:underline">
                                <h4 className="text-white font-semibold truncate text-sm">{title}</h4>
                            </Link>
                        ) : (
                            <h4 className="text-white font-semibold truncate text-sm">{title}</h4>
                        )}
                        {artistLink ? (
                            <Link href={artistLink} className="block hover:underline">
                                <p className="text-xs text-gray-400 truncate">{subtitle}</p>
                            </Link>
                        ) : mediaLink ? (
                            <Link href={mediaLink} className="block hover:underline">
                                <p className="text-xs text-gray-400 truncate">{subtitle}</p>
                            </Link>
                        ) : (
                            <p className="text-xs text-gray-400 truncate">{subtitle}</p>
                        )}
                    </div>
                </div>

                {/* Controls */}
                <div className="flex-1 flex flex-col items-center gap-2">
                    {/* Buttons */}
                    <div className="flex items-center gap-5">
                        {/* Shuffle */}
                        <button
                            onClick={toggleShuffle}
                            className={cn(
                                "transition-all duration-200 hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100",
                                isShuffle
                                    ? "text-green-500 hover:text-green-400"
                                    : "text-gray-400 hover:text-white"
                            )}
                            disabled={!hasMedia || playbackType !== "track"}
                            title="Shuffle"
                        >
                            <Shuffle className="w-4 h-4" />
                        </button>

                        {/* Skip Backward 30s */}
                        <button
                            onClick={() => skipBackward(30)}
                            className={cn(
                                "transition-all duration-200 hover:scale-110 relative disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100",
                                hasMedia ? "text-gray-400 hover:text-white" : "text-gray-600"
                            )}
                            disabled={!hasMedia}
                            title="Rewind 30 seconds"
                        >
                            <RotateCcw className="w-4 h-4" />
                            <span className="absolute text-[8px] font-bold top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                30
                            </span>
                        </button>

                        <button
                            onClick={previous}
                            className="text-gray-400 hover:text-white transition-all duration-200 hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
                            disabled={!hasMedia || playbackType !== "track"}
                        >
                            <SkipBack className="w-5 h-5" />
                        </button>

                        <button
                            onClick={isBuffering ? undefined : isPlaying ? pause : resume}
                            className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 relative group",
                                hasMedia && !isBuffering
                                    ? "bg-white text-black hover:scale-110 shadow-lg shadow-white/20 hover:shadow-white/30"
                                    : isBuffering
                                    ? "bg-white/80 text-black"
                                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                            )}
                            disabled={!hasMedia || isBuffering}
                            title={isBuffering ? "Buffering..." : isPlaying ? "Pause" : "Play"}
                        >
                            {hasMedia && !isBuffering && (
                                <div className="absolute inset-0 rounded-full bg-white blur-md opacity-0 group-hover:opacity-50 transition-opacity duration-200" />
                            )}
                            {isBuffering ? (
                                <Loader2 className="w-5 h-5 animate-spin relative z-10" />
                            ) : isPlaying ? (
                                <Pause className="w-5 h-5 relative z-10" />
                            ) : (
                                <Play className="w-5 h-5 ml-0.5 relative z-10" />
                            )}
                        </button>

                        <button
                            onClick={next}
                            className="text-gray-400 hover:text-white transition-all duration-200 hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
                            disabled={!hasMedia || playbackType !== "track"}
                        >
                            <SkipForward className="w-5 h-5" />
                        </button>

                        {/* Skip Forward 30s */}
                        <button
                            onClick={() => skipForward(30)}
                            className={cn(
                                "transition-all duration-200 hover:scale-110 relative disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100",
                                hasMedia ? "text-gray-400 hover:text-white" : "text-gray-600"
                            )}
                            disabled={!hasMedia}
                            title="Forward 30 seconds"
                        >
                            <RotateCw className="w-4 h-4" />
                            <span className="absolute text-[8px] font-bold top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                30
                            </span>
                        </button>

                        {/* Repeat */}
                        <button
                            onClick={toggleRepeat}
                            className={cn(
                                "transition-all duration-200 hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100",
                                repeatMode !== "off"
                                    ? "text-green-500 hover:text-green-400"
                                    : "text-gray-400 hover:text-white"
                            )}
                            disabled={!hasMedia || playbackType !== "track"}
                            title={
                                repeatMode === "off"
                                    ? "Repeat: Off"
                                    : repeatMode === "all"
                                    ? "Repeat: All (loop queue)"
                                    : "Repeat: One (play current track twice)"
                            }
                        >
                            {repeatMode === "one" ? (
                                <Repeat1 className="w-4 h-4" />
                            ) : (
                                <Repeat className="w-4 h-4" />
                            )}
                        </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full flex items-center gap-3">
                        <span className={cn(
                            "text-xs text-right font-medium tabular-nums",
                            hasMedia ? "text-gray-400" : "text-gray-600",
                            duration >= 3600 ? "w-14" : "w-10" // Wider for h:mm:ss format
                        )}>
                            {formatTime(displayTime)}
                        </span>
                        <div
                            className={cn(
                                "flex-1 h-1 bg-white/[0.15] rounded-full relative",
                                seekEnabled ? "cursor-pointer group" : "cursor-not-allowed"
                            )}
                            onClick={seekEnabled ? handleSeek : undefined}
                            title={
                                !hasMedia 
                                    ? undefined 
                                    : !canSeek 
                                    ? downloadProgress !== null 
                                        ? `Downloading ${downloadProgress}%... Seek will be available when cached`
                                        : "Downloading... Seeking will be available when cached" 
                                    : "Click to seek"
                            }
                        >
                            <div
                                className={cn(
                                    "h-full rounded-full relative transition-all duration-150",
                                    seekEnabled ? "bg-white group-hover:bg-white" : hasMedia ? "bg-white/50" : "bg-gray-600"
                                )}
                                style={{ width: `${progress}%` }}
                            >
                                {seekEnabled && (
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg shadow-white/50" />
                                )}
                            </div>
                        </div>
                        <span className={cn(
                            "text-xs font-medium tabular-nums",
                            hasMedia ? "text-gray-400" : "text-gray-600",
                            duration >= 3600 ? "w-14" : "w-10" // Wider for h:mm:ss format
                        )}>
                            {formatTime(duration)}
                        </span>
                    </div>
                </div>

                {/* Volume & Expand */}
                <div className="flex items-center gap-3 w-52 justify-end">
                    <button
                        onClick={toggleMute}
                        className="text-gray-400 hover:text-white transition-all duration-200 hover:scale-110"
                    >
                        {isMuted || volume === 0 ? (
                            <VolumeX className="w-5 h-5" />
                        ) : (
                            <Volume2 className="w-5 h-5" />
                        )}
                    </button>

                    <div className="relative flex-1">
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={volume * 100}
                            onChange={handleVolumeChange}
                            className="w-full h-1 bg-white/[0.15] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-white/30 [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:hover:scale-110"
                        />
                    </div>

                    {/* Keyboard Shortcuts Info */}
                    <KeyboardShortcutsTooltip />

                    <button
                        onClick={() => setPlayerMode("overlay")}
                        className={cn(
                            "transition-all duration-200 border-l border-white/[0.08] pl-3",
                            hasMedia
                                ? "text-gray-400 hover:text-white hover:scale-110"
                                : "text-gray-600 cursor-not-allowed"
                        )}
                        disabled={!hasMedia}
                        title="Expand to full screen"
                    >
                        <Maximize2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
