"use client";

import { useAudio } from "@/lib/audio-context";
import { api } from "@/lib/api";
import { useIsMobile, useIsTablet } from "@/hooks/useMediaQuery";
import Image from "next/image";
import Link from "next/link";
import {
    Play,
    Pause,
    Maximize2,
    Music as MusicIcon,
    SkipBack,
    SkipForward,
    Repeat,
    Repeat1,
    Shuffle,
    MonitorUp,
    ChevronDown,
    RotateCcw,
    RotateCw,
    Loader2,
} from "lucide-react";
import { cn, isLocalUrl } from "@/utils/cn";
import { useState } from "react";
import { KeyboardShortcutsTooltip } from "./KeyboardShortcutsTooltip";

export function MiniPlayer() {
    const {
        currentTrack,
        currentAudiobook,
        currentPodcast,
        playbackType,
        isPlaying,
        isBuffering,
        isShuffle,
        repeatMode,
        currentTime,
        duration: playbackDuration,
        canSeek,
        downloadProgress,
        pause,
        resume,
        next,
        previous,
        toggleShuffle,
        toggleRepeat,
        seek,
        skipForward,
        skipBackward,
        setPlayerMode,
    } = useAudio();
    const isMobile = useIsMobile();
    const isTablet = useIsTablet();
    const isMobileOrTablet = isMobile || isTablet;
    const [isCollapsed, setIsCollapsed] = useState(false);

    const hasMedia = !!(currentTrack || currentAudiobook || currentPodcast);

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
        // Extract podcast ID from episode ID (format: "podcastId:episodeId")
        const podcastId = currentPodcast.id.split(":")[0];
        mediaLink = `/podcasts/${podcastId}`;
    } else {
        // Idle state - no media playing
        title = "Not Playing";
        subtitle = "Select something to play";
    }

    // Check if controls should be enabled (only for tracks)
    const canSkip = playbackType === "track";

    // Calculate progress percentage
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
    const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

    // Handle progress bar click
    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // Don't allow seeking if canSeek is false (uncached podcast)
        if (!canSeek) {
            console.log("[MiniPlayer] Seeking disabled - podcast not cached");
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = x / rect.width;
        const newTime = percentage * duration;
        seek(newTime);
    };

    // Determine if seeking is allowed
    const seekEnabled = hasMedia && canSeek;

    return (
        <>
            {/* Collapsed Tab (Mobile/Tablet only) - Shows when player is collapsed and has media */}
            {isMobileOrTablet && isCollapsed && hasMedia && (
                <div 
                    className="fixed left-1/2 -translate-x-1/2 z-50 bg-gradient-to-t from-[#0a0a0a] to-[#0f0f0f] border border-white/[0.08] border-b-0 rounded-t-lg px-6 py-2 flex items-center gap-2 shadow-lg backdrop-blur-xl bottom-0"
                >
                    <button
                        onClick={() => setIsCollapsed(false)}
                        className="flex items-center gap-2 hover:opacity-80 transition"
                        title="Show player"
                    >
                        <ChevronDown className="w-4 h-4 text-gray-400 rotate-180" />
                        <div className="flex items-center gap-2">
                            {coverUrl ? (
                                <div className="relative w-8 h-8 rounded overflow-hidden">
                                    <Image
                                        src={coverUrl}
                                        alt={title}
                                        fill
                                        sizes="32px"
                                        className="object-cover"
                                        unoptimized
                                    />
                                </div>
                            ) : (
                                <MusicIcon className="w-4 h-4 text-gray-400" />
                            )}
                            <span className="text-white text-sm font-medium max-w-[150px] truncate">
                                {title}
                            </span>
                        </div>
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!isBuffering) {
                                isPlaying ? pause() : resume();
                            }
                        }}
                        className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center transition ml-2",
                            isBuffering
                                ? "bg-white/80 text-black"
                                : "bg-white text-black hover:scale-105"
                        )}
                        title={isBuffering ? "Buffering..." : isPlaying ? "Pause" : "Play"}
                    >
                        {isBuffering ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isPlaying ? (
                            <Pause className="w-3.5 h-3.5" />
                        ) : (
                            <Play className="w-3.5 h-3.5 ml-0.5" />
                        )}
                    </button>
                </div>
            )}

            <div
                className={cn(
                    "bg-gradient-to-t from-[#0a0a0a] via-[#0f0f0f] to-[#0a0a0a] border-t border-white/[0.08] relative transition-all duration-300 backdrop-blur-xl",
                    // Mobile/Tablet: fixed at bottom, full width
                    isMobileOrTablet && "fixed bottom-0 left-0 right-0 z-50",
                    // Collapsed state on mobile
                    isMobileOrTablet && isCollapsed && "translate-y-full"
                )}
                style={
                    isMobileOrTablet
                        ? {
                              paddingBottom:
                                  "max(env(safe-area-inset-bottom, 0px), 28px)",
                          }
                        : undefined
                }
            >
                {/* Subtle top glow */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                {/* Progress Bar */}
                <div
                    className={cn(
                        "absolute top-0 left-0 right-0 h-1 bg-white/[0.15] transition-all",
                        seekEnabled ? "cursor-pointer group hover:h-2" : "cursor-not-allowed"
                    )}
                    onClick={seekEnabled ? handleProgressClick : undefined}
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
                            seekEnabled ? "bg-white" : hasMedia ? "bg-white/50" : "bg-gray-600"
                        )}
                        style={{ width: `${progress}%` }}
                    >
                        {seekEnabled && (
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg shadow-white/50" />
                        )}
                    </div>
                </div>

                {/* Player Content */}
                <div
                    className={cn(
                        "pt-3",
                        isMobileOrTablet ? "px-4 pb-3" : "px-3 py-2.5"
                    )}
                >
                    {/* Artwork & Track Info */}
                    <div
                        className={cn(
                            "flex items-center gap-2",
                            isMobileOrTablet ? "mb-2" : "mb-2"
                        )}
                    >
                        {/* Artwork - Clickable */}
                        {mediaLink ? (
                            <Link
                                href={mediaLink}
                                className={cn(
                                    "relative flex-shrink-0 group",
                                    isMobileOrTablet ? "w-12 h-12" : "w-12 h-12"
                                )}
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-full blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                <div className="relative w-full h-full bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded-full overflow-hidden shadow-lg flex items-center justify-center">
                                    {coverUrl ? (
                                        <Image
                                            key={coverUrl}
                                            src={coverUrl}
                                            alt={title}
                                            fill
                                            sizes={isMobileOrTablet ? "64px" : "56px"}
                                            className="object-cover"
                                            priority
                                            unoptimized
                                        />
                                    ) : (
                                        <MusicIcon className={cn("text-gray-500", isMobileOrTablet ? "w-7 h-7" : "w-6 h-6")} />
                                    )}
                                </div>
                            </Link>
                        ) : (
                            <div className={cn("relative flex-shrink-0", isMobileOrTablet ? "w-12 h-12" : "w-12 h-12")}>
                                <div className="relative w-full h-full bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded-full overflow-hidden shadow-lg flex items-center justify-center">
                                    <MusicIcon className={cn("text-gray-500", isMobileOrTablet ? "w-7 h-7" : "w-6 h-6")} />
                                </div>
                            </div>
                        )}

                        {/* Track Info - Clickable */}
                        <div className="flex-1 min-w-0">
                            {mediaLink ? (
                                <Link href={mediaLink} className="block hover:underline">
                                    <p className={cn("text-white font-semibold truncate", isMobileOrTablet ? "text-base" : "text-sm")}>
                                        {title}
                                    </p>
                                </Link>
                            ) : (
                                <p className={cn("text-white font-semibold truncate", isMobileOrTablet ? "text-base" : "text-sm")}>
                                    {title}
                                </p>
                            )}
                            {artistLink ? (
                                <Link href={artistLink} className="block hover:underline">
                                    <p className={cn("text-gray-400 truncate", isMobileOrTablet ? "text-sm" : "text-xs")}>
                                        {subtitle}
                                    </p>
                                </Link>
                            ) : mediaLink ? (
                                <Link href={mediaLink} className="block hover:underline">
                                    <p className={cn("text-gray-400 truncate", isMobileOrTablet ? "text-sm" : "text-xs")}>
                                        {subtitle}
                                    </p>
                                </Link>
                            ) : (
                                <p className={cn("text-gray-400 truncate", isMobileOrTablet ? "text-sm" : "text-xs")}>
                                    {subtitle}
                                </p>
                            )}
                        </div>

                        {/* Mode Switch Buttons */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Collapse Button (Mobile/Tablet only) - only show when has media */}
                            {isMobileOrTablet && hasMedia && (
                                <button
                                    onClick={() => setIsCollapsed(!isCollapsed)}
                                    className="text-gray-400 hover:text-white transition p-1"
                                    title={
                                        isCollapsed
                                            ? "Show player"
                                            : "Hide player"
                                    }
                                >
                                    <ChevronDown
                                        className={cn(
                                            "w-4 h-4 transition-transform",
                                            isCollapsed && "rotate-180"
                                        )}
                                    />
                                </button>
                            )}

                            {/* Transfer to Bottom Player (Desktop only) */}
                            {!isMobileOrTablet && (
                                <button
                                    onClick={() => setPlayerMode("full")}
                                    className="text-gray-400 hover:text-white transition p-1"
                                    title="Show bottom player"
                                >
                                    <MonitorUp className="w-3.5 h-3.5" />
                                </button>
                            )}

                            {/* Expand to Overlay */}
                            <button
                                onClick={() => setPlayerMode("overlay")}
                                className={cn(
                                    "transition p-1",
                                    hasMedia
                                        ? "text-gray-400 hover:text-white"
                                        : "text-gray-600 cursor-not-allowed"
                                )}
                                disabled={!hasMedia}
                                title="Expand to full screen"
                            >
                                <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Playback Controls - Extra horizontal padding on mobile to prevent swipe gestures */}
                    <div
                        className={cn(
                            "flex items-center justify-between",
                            isMobileOrTablet ? "gap-2 px-4" : "gap-1"
                        )}
                    >
                        {/* Shuffle */}
                        <button
                            onClick={toggleShuffle}
                            disabled={!hasMedia || !canSkip}
                            className={cn(
                                "rounded transition-colors",
                                isMobileOrTablet ? "p-2" : "p-1.5",
                                hasMedia && canSkip
                                    ? isShuffle
                                        ? "text-green-500 hover:text-green-400"
                                        : "text-gray-400 hover:text-white"
                                    : "text-gray-600 cursor-not-allowed"
                            )}
                            title={canSkip ? "Shuffle" : "Shuffle (music only)"}
                        >
                            <Shuffle
                                className={
                                    isMobileOrTablet ? "w-4 h-4" : "w-3.5 h-3.5"
                                }
                            />
                        </button>

                        {/* Skip Backward 30s */}
                        <button
                            onClick={() => skipBackward(30)}
                            disabled={!hasMedia}
                            className={cn(
                                "rounded transition-colors relative",
                                isMobileOrTablet ? "p-2" : "p-1.5",
                                hasMedia ? "text-gray-400 hover:text-white" : "text-gray-600 cursor-not-allowed"
                            )}
                            title="Rewind 30 seconds"
                        >
                            <RotateCcw
                                className={
                                    isMobileOrTablet ? "w-4 h-4" : "w-3.5 h-3.5"
                                }
                            />
                            <span className="absolute text-[8px] font-bold top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                30
                            </span>
                        </button>

                        {/* Previous */}
                        <button
                            onClick={previous}
                            disabled={!hasMedia || !canSkip}
                            className={cn(
                                "rounded transition-colors",
                                isMobileOrTablet ? "p-2" : "p-1.5",
                                hasMedia && canSkip
                                    ? "text-gray-400 hover:text-white"
                                    : "text-gray-600 cursor-not-allowed"
                            )}
                            title={
                                canSkip ? "Previous" : "Previous (music only)"
                            }
                        >
                            <SkipBack
                                className={
                                    isMobileOrTablet ? "w-5 h-5" : "w-4 h-4"
                                }
                            />
                        </button>

                        {/* Play/Pause/Buffering */}
                        <button
                            onClick={isBuffering ? undefined : isPlaying ? pause : resume}
                            disabled={!hasMedia || isBuffering}
                            className={cn(
                                "rounded-full flex items-center justify-center transition",
                                isMobileOrTablet ? "w-12 h-12" : "w-8 h-8", // 48px touch target on mobile
                                hasMedia && !isBuffering
                                    ? "bg-white text-black hover:scale-105"
                                    : isBuffering
                                    ? "bg-white/80 text-black"
                                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                            )}
                            title={isBuffering ? "Buffering..." : isPlaying ? "Pause" : "Play"}
                        >
                            {isBuffering ? (
                                <Loader2
                                    className={cn(
                                        "animate-spin",
                                        isMobileOrTablet ? "w-5 h-5" : "w-4 h-4"
                                    )}
                                />
                            ) : isPlaying ? (
                                <Pause
                                    className={
                                        isMobileOrTablet ? "w-5 h-5" : "w-4 h-4"
                                    }
                                />
                            ) : (
                                <Play
                                    className={cn(
                                        isMobileOrTablet
                                            ? "w-5 h-5 ml-0.5"
                                            : "w-4 h-4 ml-0.5"
                                    )}
                                />
                            )}
                        </button>

                        {/* Next */}
                        <button
                            onClick={next}
                            disabled={!hasMedia || !canSkip}
                            className={cn(
                                "rounded transition-colors",
                                isMobileOrTablet ? "p-2" : "p-1.5",
                                hasMedia && canSkip
                                    ? "text-gray-400 hover:text-white"
                                    : "text-gray-600 cursor-not-allowed"
                            )}
                            title={canSkip ? "Next" : "Next (music only)"}
                        >
                            <SkipForward
                                className={
                                    isMobileOrTablet ? "w-5 h-5" : "w-4 h-4"
                                }
                            />
                        </button>

                        {/* Skip Forward 30s */}
                        <button
                            onClick={() => skipForward(30)}
                            disabled={!hasMedia}
                            className={cn(
                                "rounded transition-colors relative",
                                isMobileOrTablet ? "p-2" : "p-1.5",
                                hasMedia ? "text-gray-400 hover:text-white" : "text-gray-600 cursor-not-allowed"
                            )}
                            title="Forward 30 seconds"
                        >
                            <RotateCw
                                className={
                                    isMobileOrTablet ? "w-4 h-4" : "w-3.5 h-3.5"
                                }
                            />
                            <span className="absolute text-[8px] font-bold top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                30
                            </span>
                        </button>

                        {/* Repeat */}
                        <button
                            onClick={toggleRepeat}
                            disabled={!hasMedia || !canSkip}
                            className={cn(
                                "rounded transition-colors",
                                isMobileOrTablet ? "p-2" : "p-1.5",
                                hasMedia && canSkip
                                    ? repeatMode !== "off"
                                        ? "text-green-500 hover:text-green-400"
                                        : "text-gray-400 hover:text-white"
                                    : "text-gray-600 cursor-not-allowed"
                            )}
                            title={
                                canSkip
                                    ? repeatMode === "off"
                                        ? "Repeat: Off"
                                        : repeatMode === "all"
                                        ? "Repeat: All"
                                        : "Repeat: One"
                                    : "Repeat (music only)"
                            }
                        >
                            {repeatMode === "one" ? (
                                <Repeat1
                                    className={
                                        isMobileOrTablet
                                            ? "w-4 h-4"
                                            : "w-3.5 h-3.5"
                                    }
                                />
                            ) : (
                                <Repeat
                                    className={
                                        isMobileOrTablet
                                            ? "w-4 h-4"
                                            : "w-3.5 h-3.5"
                                    }
                                />
                            )}
                        </button>

                        {/* Keyboard Shortcuts Info - Hide on mobile */}
                        {!isMobileOrTablet && <KeyboardShortcutsTooltip />}
                    </div>
                </div>
            </div>
        </>
    );
}
