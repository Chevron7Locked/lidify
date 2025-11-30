import { Play, Shuffle, Download, ListPlus, ExternalLink } from "lucide-react";
import { cn } from "@/utils/cn";
import type { Album } from "../types";
import type { AlbumSource } from "../types";

// Lidify brand yellow for all on-page play buttons
const LIDIFY_YELLOW = "#ecb200";

interface AlbumActionBarProps {
    album: Album;
    source: AlbumSource;
    colors: any;
    onPlayAll: () => void;
    onShuffle: () => void;
    onDownloadAlbum: () => void;
    onAddToPlaylist: () => void;
    isPendingDownload: boolean;
}

export function AlbumActionBar({
    album,
    source,
    colors,
    onPlayAll,
    onShuffle,
    onDownloadAlbum,
    onAddToPlaylist,
    isPendingDownload,
}: AlbumActionBarProps) {
    // Determine ownership: check owned flag first, then fall back to source
    const isOwned =
        album.owned !== undefined ? album.owned : source === "library";

    // Show download button only for unowned albums that have an MBID or rgMbid
    const showDownload = !isOwned && (album.mbid || album.rgMbid);

    const musicbrainzUrl = album.mbid
        ? `https://musicbrainz.org/release/${album.mbid}`
        : null;

    return (
        <div data-tv-section="action-bar" className="flex items-center justify-between gap-4">
            {/* Left side - Play and Shuffle buttons - only for owned albums */}
            {isOwned && (
                <div className="flex items-center gap-3">
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
                    <button
                        data-tv-card
                        data-tv-card-index={1}
                        tabIndex={0}
                        onClick={onShuffle}
                        className={cn(
                            "flex items-center justify-center rounded-full transition-all duration-200",
                            "w-10 h-10 md:w-12 md:h-12",
                            "bg-white/10 hover:bg-white/20",
                            "hover:scale-105 active:scale-95"
                        )}
                        aria-label="Shuffle play"
                    >
                        <Shuffle className="w-5 h-5 md:w-6 md:h-6" />
                    </button>
                </div>
            )}

            {/* Right side - Actions */}
            <div
                className={cn(
                    "flex items-center gap-3",
                    !isOwned && "ml-0" // Remove left margin if no play buttons
                )}
            >
                {/* Add to Playlist button - only for owned albums */}
                {isOwned && (
                    <button
                        data-tv-card
                        data-tv-card-index={2}
                        tabIndex={0}
                        onClick={onAddToPlaylist}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 md:px-6 md:py-3",
                            "bg-white/10 hover:bg-white/20 rounded-full",
                            "transition-all duration-200",
                            "hover:scale-105 active:scale-95"
                        )}
                        aria-label="Add to playlist"
                    >
                        <ListPlus className="w-5 h-5" />
                        <span className="hidden md:inline font-medium">
                            Add to Playlist
                        </span>
                    </button>
                )}

                {/* Download Album button - only for unowned albums */}
                {showDownload && (
                    <button
                        data-tv-card
                        data-tv-card-index={isOwned ? 3 : 0}
                        tabIndex={0}
                        onClick={onDownloadAlbum}
                        disabled={isPendingDownload}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 md:px-6 md:py-3",
                            "bg-white/10 hover:bg-white/20 rounded-full",
                            "transition-all duration-200",
                            "hover:scale-105 active:scale-95",
                            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                        )}
                        aria-label="Download album"
                    >
                        <Download className="w-5 h-5" />
                        <span className="hidden md:inline font-medium">
                            {isPendingDownload
                                ? "Downloading..."
                                : "Download Album"}
                        </span>
                    </button>
                )}

                {/* MusicBrainz link */}
                {musicbrainzUrl && (
                    <a
                        data-tv-card
                        data-tv-card-index={isOwned ? 4 : showDownload ? 1 : 0}
                        tabIndex={0}
                        href={musicbrainzUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 md:px-6 md:py-3",
                            "bg-white/10 hover:bg-white/20 rounded-full",
                            "transition-all duration-200",
                            "hover:scale-105 active:scale-95"
                        )}
                        aria-label="View on MusicBrainz"
                    >
                        <ExternalLink className="w-5 h-5" />
                        <span className="hidden md:inline font-medium">
                            MusicBrainz
                        </span>
                    </a>
                )}
            </div>
        </div>
    );
}
