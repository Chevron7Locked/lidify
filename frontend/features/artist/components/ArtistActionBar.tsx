import { Play, Shuffle, Download, ExternalLink } from "lucide-react";
import { cn } from "@/utils/cn";
import type { Artist } from "../types";
import type { Album } from "../types";
import type { ArtistSource } from "../types";

// Lidify brand yellow for all on-page play buttons
const LIDIFY_YELLOW = "#ecb200";

interface ArtistActionBarProps {
    artist: Artist;
    albums: Album[];
    source: ArtistSource;
    colors: any;
    onPlayAll: () => void;
    onShuffle: () => void;
    onDownloadAll: () => void;
    isPendingDownload: boolean;
}

export function ArtistActionBar({
    artist,
    albums,
    source,
    colors,
    onPlayAll,
    onShuffle,
    onDownloadAll,
    isPendingDownload,
}: ArtistActionBarProps) {
    const availableAlbums = albums.filter(
        (album) => album.availability !== "unavailable"
    );
    const showDownloadAll =
        source === "discovery" || availableAlbums.length > 0;

    return (
        <div data-tv-section="action-bar" className="flex items-center justify-between gap-4">
            {/* Left side - Play controls */}
            <div className="flex items-center gap-3">
                {/* Play button */}
                <button
                    data-tv-card
                    data-tv-card-index={0}
                    tabIndex={0}
                    onClick={onPlayAll}
                    className={cn(
                        "flex items-center justify-center rounded-full transition-all duration-200",
                        "w-12 h-12 md:w-14 md:h-14",
                        "hover:scale-105 active:scale-95",
                        "shadow-lg hover:shadow-xl"
                    )}
                    style={{ backgroundColor: LIDIFY_YELLOW }}
                    aria-label="Play all"
                >
                    <Play className="w-6 h-6 md:w-7 md:h-7 fill-current text-black" />
                </button>

                {/* Shuffle button */}
                <button
                    data-tv-card
                    data-tv-card-index={1}
                    tabIndex={0}
                    onClick={onShuffle}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 md:px-6 md:py-3",
                        "bg-white/10 hover:bg-white/20 rounded-full",
                        "transition-all duration-200",
                        "hover:scale-105 active:scale-95"
                    )}
                    aria-label="Shuffle all"
                >
                    <Shuffle className="w-5 h-5" />
                    <span className="hidden md:inline font-medium">
                        Shuffle
                    </span>
                </button>
            </div>

            {/* Right side - Actions */}
            <div className="flex items-center gap-3">
                {/* Download All button */}
                {showDownloadAll && (
                    <button
                        data-tv-card
                        data-tv-card-index={2}
                        tabIndex={0}
                        onClick={onDownloadAll}
                        disabled={isPendingDownload}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 md:px-6 md:py-3",
                            "bg-white/10 hover:bg-white/20 rounded-full",
                            "transition-all duration-200",
                            "hover:scale-105 active:scale-95",
                            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                        )}
                        aria-label="Download all"
                    >
                        <Download className="w-5 h-5" />
                        <span className="hidden md:inline font-medium">
                            {isPendingDownload
                                ? "Downloading..."
                                : "Download All"}
                        </span>
                    </button>
                )}

                {/* Last.fm link */}
                {artist.url && (
                    <a
                        data-tv-card
                        data-tv-card-index={3}
                        tabIndex={0}
                        href={artist.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 md:px-6 md:py-3",
                            "bg-white/10 hover:bg-white/20 rounded-full",
                            "transition-all duration-200",
                            "hover:scale-105 active:scale-95"
                        )}
                        aria-label="View on Last.fm"
                    >
                        <ExternalLink className="w-5 h-5" />
                        <span className="hidden md:inline font-medium">
                            Last.fm
                        </span>
                    </a>
                )}
            </div>
        </div>
    );
}
