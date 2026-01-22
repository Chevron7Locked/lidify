"use client";

import Link from "next/link";
import { Book, CheckCircle } from "lucide-react";
import { CachedImage } from "./CachedImage";

interface AudiobookCardProps {
    id: string;
    title: string;
    author: string;
    coverUrl: string | null;
    progress?: {
        progress: number;
        isFinished: boolean;
    } | null;
    seriesBadge?: string; // e.g., "5 books" for series cards
    index?: number;
    getCoverUrl: (url: string) => string | null;
}

export function AudiobookCard({
    id,
    title,
    author,
    coverUrl,
    progress,
    seriesBadge,
    index = 0,
    getCoverUrl,
}: AudiobookCardProps) {
    const resolvedCoverUrl = coverUrl ? getCoverUrl(coverUrl) : null;

    return (
        <Link
            href={seriesBadge ? `/audiobooks/series/${encodeURIComponent(title)}` : `/audiobooks/${id}`}
            data-tv-card
            data-tv-card-index={index}
            tabIndex={0}
        >
            <div className="cursor-pointer group relative h-full flex flex-col">
                {/* Book Cover Container - Fixed Aspect Ratio */}
                <div className="relative flex-shrink-0">
                    <div className="aspect-[2/3] rounded-sm overflow-hidden bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] shadow-2xl relative">
                        {resolvedCoverUrl ? (
                            <CachedImage
                                src={resolvedCoverUrl}
                                alt={title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                }}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <Book className="w-16 h-16 text-gray-700" />
                            </div>
                        )}
                        
                        {/* Book Spine Shadow */}
                        <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-r from-black/40 to-transparent pointer-events-none" />
                        
                        {/* Book Gloss */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/20 pointer-events-none" />

                        {/* Progress Bar */}
                        {progress && !progress.isFinished && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60">
                                <div
                                    className="h-full bg-purple-500"
                                    style={{ width: `${progress.progress}%` }}
                                />
                            </div>
                        )}

                        {/* Completion Badge */}
                        {progress?.isFinished && (
                            <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1.5 shadow-lg">
                                <CheckCircle className="w-3 h-3 text-white" />
                            </div>
                        )}

                        {/* Series Badge (for series cards only) */}
                        {seriesBadge && (
                            <div className="absolute top-2 right-2 bg-purple-500 rounded px-2 py-1 text-xs font-bold shadow-lg">
                                {seriesBadge}
                            </div>
                        )}
                    </div>
                    
                    {/* Shelf Shadow */}
                    <div className="absolute -bottom-1 left-0 right-0 h-2 bg-gradient-to-b from-[#1a1a1a]/50 to-transparent rounded-b-sm" />
                </div>

                {/* Text Container - Fixed Height for Uniformity */}
                <div className="mt-3 px-1 h-14 flex flex-col justify-start">
                    <h3 className="text-sm font-bold text-white line-clamp-2 leading-tight">
                        {title}
                    </h3>
                    <p className="text-xs text-gray-400 line-clamp-1 mt-1">
                        {author}
                    </p>
                </div>
            </div>
        </Link>
    );
}















