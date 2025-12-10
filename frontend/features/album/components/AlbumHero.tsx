"use client";

import { Disc3 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { MetadataEditor } from "@/components/MetadataEditor";
import { Album, AlbumSource } from "../types";
import { api } from "@/lib/api";
import { ReactNode } from "react";
import { isLocalUrl } from "@/utils/cn";

interface AlbumHeroProps {
    album: Album;
    source: AlbumSource;
    coverUrl: string | null;
    colors: any;
    onReload: () => void;
    children?: ReactNode;
}

export function AlbumHero({
    album,
    source,
    coverUrl,
    colors,
    onReload,
    children,
}: AlbumHeroProps) {
    // Format duration as MM:SS
    const formatDuration = (seconds?: number) => {
        if (!seconds) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const totalDuration = formatDuration(album.duration);

    return (
        <div className="relative">
            {/* Background Image with Blur */}
            {coverUrl ? (
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute inset-0 scale-110 blur-md opacity-50">
                        <Image
                            src={coverUrl}
                            alt={album.title}
                            fill
                            sizes="100vw"
                            className="object-cover"
                            priority
                            unoptimized={isLocalUrl(coverUrl)}
                        />
                    </div>
                    {/* Dynamic color gradient overlays */}
                    <div
                        className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/70 to-[#0a0a0a]"
                        style={{
                            background: colors
                                ? `linear-gradient(to bottom, ${colors.vibrant}30 0%, ${colors.darkVibrant}60 40%, ${colors.darkMuted}90 70%, #0a0a0a 100%)`
                                : undefined,
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40" />
                </div>
            ) : (
                <div
                    className="absolute inset-0 bg-gradient-to-b from-purple-900/40 via-[#1a1a1a] to-[#0a0a0a]"
                    style={{
                        background: colors
                            ? `linear-gradient(to bottom, ${colors.vibrant}40 0%, ${colors.darkVibrant}80 50%, #0a0a0a 100%)`
                            : undefined,
                    }}
                />
            )}

            {/* Content - flows naturally */}
            <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">
                <div className="flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6 w-full text-center md:text-left">
                    {/* Album Cover - Square */}
                    <div className="w-[160px] h-[160px] md:w-56 md:h-56 bg-[#1a1a1a] rounded-md shadow-2xl shrink-0 overflow-hidden relative">
                        {coverUrl ? (
                            <Image
                                src={coverUrl}
                                alt={album.title}
                                fill
                                sizes="(max-width: 768px) 160px, 224px"
                                className="object-cover"
                                priority
                                unoptimized={isLocalUrl(coverUrl)}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <Disc3 className="w-16 md:w-24 h-16 md:h-24 text-gray-600" />
                            </div>
                        )}
                    </div>

                    {/* Album Info */}
                    <div className="flex-1 pb-2 space-y-2 md:space-y-4 max-w-full md:max-w-none">
                        <div className="text-sm md:text-base font-bold text-white/90 drop-shadow-lg">
                            Album
                        </div>
                        <div className="flex items-center gap-3 group">
                            <h1 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-black text-white drop-shadow-2xl leading-tight">
                                {album.title}
                            </h1>
                            {source === "library" && (
                                <MetadataEditor
                                    type="album"
                                    id={album.id}
                                    currentData={{
                                        title: album.title,
                                        year: album.year,
                                        genres: album.genre ? [album.genre] : [],
                                        mbid: album.mbid,
                                        coverUrl: album.coverUrl,
                                    }}
                                    onSave={async () => {
                                        // Reload album to get updated data
                                        await onReload();
                                    }}
                                />
                            )}
                        </div>

                        {/* Artist Name */}
                        {album.artist && (
                            <div className="text-lg md:text-xl text-white/90 font-semibold drop-shadow-lg">
                                <Link
                                    href={`/artist/${album.artist.id}`}
                                    className="hover:underline hover:text-white transition-colors"
                                >
                                    {album.artist.name}
                                </Link>
                            </div>
                        )}

                        {/* Stats */}
                        <div className="flex flex-wrap items-center gap-2 text-sm md:text-base text-white/90 font-medium">
                            {album.year && (
                                <>
                                    <span className="drop-shadow-lg">
                                        {album.year}
                                    </span>
                                    <span className="text-white/40">•</span>
                                </>
                            )}
                            {album.trackCount && album.trackCount > 0 && (
                                <>
                                    <span className="drop-shadow-lg">
                                        {album.trackCount} track
                                        {album.trackCount !== 1 ? "s" : ""}
                                    </span>
                                    <span className="text-white/40">•</span>
                                </>
                            )}
                            {album.duration && album.duration > 0 && (
                                <span className="drop-shadow-lg">
                                    {totalDuration}
                                </span>
                            )}
                        </div>

                        {/* Genre Tag */}
                        {album.genre && (
                            <div className="flex flex-wrap gap-2">
                                <span className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-xs md:text-sm text-white drop-shadow-lg border border-white/5">
                                    {album.genre}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Bar - rendered inside hero */}
                {children && (
                    <div className="mt-8 md:mt-10">
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
}
