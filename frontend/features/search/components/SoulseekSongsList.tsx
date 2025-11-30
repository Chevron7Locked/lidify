import { Music, Download, CheckCircle } from "lucide-react";
import { cn } from "@/utils/cn";
import { SoulseekResult } from "../types";

interface SoulseekSongsListProps {
    soulseekResults: SoulseekResult[];
    downloadingFiles: Set<string>;
    onDownload: (result: SoulseekResult) => void;
}

// Helper function to format file size
export const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Helper function to get quality badge
export const getQualityBadge = (result: SoulseekResult) => {
    if (result.format === "flac") {
        return (
            <span className="px-2 py-1 text-xs font-semibold bg-purple-600/20 text-purple-400 rounded">
                FLAC
            </span>
        );
    }
    if (result.bitrate >= 320) {
        return (
            <span className="px-2 py-1 text-xs font-semibold bg-green-600/20 text-green-400 rounded">
                320 kbps
            </span>
        );
    }
    if (result.bitrate >= 256) {
        return (
            <span className="px-2 py-1 text-xs font-semibold bg-blue-600/20 text-blue-400 rounded">
                256 kbps
            </span>
        );
    }
    return (
        <span className="px-2 py-1 text-xs font-semibold bg-gray-600/20 text-gray-400 rounded">
            {result.bitrate} kbps
        </span>
    );
};

// Helper function to parse filename
export const parseFilename = (
    filename: string
): { artist: string; title: string } => {
    const match = filename.match(/([^/\\]+)\.(?:mp3|flac|m4a|wav)$/i);
    if (match) {
        const nameWithoutExt = match[1];
        const parts = nameWithoutExt.split(" - ");
        if (parts.length >= 2) {
            return {
                artist: parts[0].trim(),
                title: parts.slice(1).join(" - ").trim(),
            };
        }
        return { artist: "Unknown", title: nameWithoutExt };
    }
    return { artist: "Unknown", title: filename };
};

export function SoulseekSongsList({
    soulseekResults,
    downloadingFiles,
    onDownload,
}: SoulseekSongsListProps) {
    if (soulseekResults.length === 0) {
        return null;
    }

    return (
        <section>
            <h2 className="text-2xl font-bold text-white mb-6">Songs</h2>
            <div className="space-y-2" data-tv-section="search-results-songs">
                {soulseekResults.slice(0, 5).map((result, index) => {
                    const parsed = result.parsedArtist
                        ? {
                              artist: result.parsedArtist,
                              title:
                                  result.filename
                                      .split("\\")
                                      .pop()
                                      ?.split(" - ")
                                      .slice(1)
                                      .join(" - ") || result.filename,
                          }
                        : parseFilename(result.filename);

                    const isDownloading = downloadingFiles.has(result.filename);

                    return (
                        <div
                            key={`${result.username}-${result.filename}-${index}`}
                            className="flex items-center gap-4 p-3 rounded hover:bg-[#1a1a1a] group"
                        >
                            <div className="w-10 h-10 bg-[#181818] rounded flex items-center justify-center flex-shrink-0">
                                <Music className="w-5 h-5 text-gray-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-base font-bold text-white truncate">
                                    {parsed.title}
                                </h4>
                                <p className="text-sm text-[#b3b3b3] truncate">
                                    {parsed.artist}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {getQualityBadge(result)}
                                <button
                                    data-tv-card
                                    data-tv-card-index={index}
                                    tabIndex={0}
                                    onClick={() => onDownload(result)}
                                    disabled={isDownloading}
                                    className={cn(
                                        "px-4 py-2 rounded-full font-bold transition-all flex items-center gap-2 text-sm",
                                        isDownloading
                                            ? "bg-green-600/20 text-green-400 cursor-not-allowed"
                                            : "bg-[#ecb200] text-black hover:bg-[#d4a000] hover:scale-105"
                                    )}
                                >
                                    {isDownloading ? (
                                        <>
                                            <CheckCircle className="w-4 h-4" />
                                            Downloading
                                        </>
                                    ) : (
                                        <>
                                            <Download className="w-4 h-4" />
                                            Download
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
