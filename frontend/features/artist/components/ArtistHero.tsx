"use client";

import { Music } from "lucide-react";
import Image from "next/image";
import { useImageColor, getPlayButtonStyles } from "@/hooks/useImageColor";
import { MetadataEditor } from "@/components/MetadataEditor";
import { Artist, ArtistSource, Album } from "../types";
import { ReactNode } from "react";

interface ArtistHeroProps {
    artist: Artist;
    source: ArtistSource;
    albums: Album[];
    heroImage: string | null;
    colors: any;
    onReload: () => void;
    children?: ReactNode; // Action bar content
}

export function ArtistHero({
    artist,
    source,
    albums,
    heroImage,
    colors,
    onReload,
    children,
}: ArtistHeroProps) {
    const ownedAlbums = albums.filter((a) => a.owned);
    const summary = artist.summary || artist.bio;
    const genres = artist.genres || artist.tags || [];

    return (
        <div className="relative">
            {/* Background Image with Blur - sized to content */}
            {heroImage ? (
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute inset-0 scale-110 blur-md opacity-50">
                        <Image
                            src={heroImage}
                            alt={artist.name}
                            fill
                            sizes="100vw"
                            className="object-cover"
                            priority
                            unoptimized={heroImage.startsWith("http://localhost")}
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

            {/* Content - flows naturally, padding creates space */}
            <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">
                <div className="flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6 w-full text-center md:text-left">
                    {/* Artist Image - Circular */}
                    <div className="w-[172px] h-[172px] md:w-56 md:h-56 bg-[#1a1a1a] rounded-full shadow-2xl shrink-0 overflow-hidden relative">
                        {heroImage ? (
                            <Image
                                src={heroImage}
                                alt={artist.name}
                                fill
                                sizes="(max-width: 768px) 172px, 224px"
                                className="object-cover"
                                priority
                                unoptimized={heroImage.startsWith("http://localhost")}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <Music className="w-16 md:w-24 h-16 md:h-24 text-gray-600" />
                            </div>
                        )}
                    </div>

                    {/* Artist Info */}
                    <div className="flex-1 pb-2 space-y-2 md:space-y-4 max-w-full md:max-w-none">
                        <div className="text-sm md:text-base font-bold text-white/90 drop-shadow-lg">
                            Artist
                        </div>
                        <div className="flex items-center gap-3 group">
                            <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-white drop-shadow-2xl leading-tight">
                                {artist.name}
                            </h1>
                            {source === "library" && (
                                <MetadataEditor
                                    type="artist"
                                    id={artist.id}
                                    currentData={{
                                        name: artist.name,
                                        bio: artist.summary || artist.bio,
                                        genres:
                                            artist.genres ||
                                            artist.tags ||
                                            [],
                                        mbid: artist.mbid,
                                        heroUrl:
                                            artist.heroUrl || artist.image,
                                    }}
                                    onSave={async () => {
                                        // Reload artist to get updated data
                                        await onReload();
                                    }}
                                />
                            )}
                        </div>

                        {/* Summary (truncated in hero) */}
                        {summary && (
                            <p className="text-sm md:text-left text-white/80 line-clamp-2 max-w-4xl drop-shadow-lg leading-relaxed">
                                {summary
                                    .replace(/<[^>]*>/g, "")
                                    .substring(0, 200)}
                                ...
                            </p>
                        )}

                        {/* Stats */}
                        <div className="flex flex-wrap items-center gap-2 text-sm md:text-base text-white/90 font-medium">
                            {artist.listeners && artist.listeners > 0 && (
                                <>
                                    <span className="drop-shadow-lg">
                                        {artist.listeners.toLocaleString()}{" "}
                                        listeners
                                    </span>
                                    <span className="text-white/40">•</span>
                                </>
                            )}
                            {albums.length > 0 && (
                                <>
                                    <span className="drop-shadow-lg">
                                        {albums.length} album
                                        {albums.length !== 1 ? "s" : ""}
                                    </span>
                                    {ownedAlbums.length > 0 && (
                                        <>
                                            <span className="text-white/40">
                                                •
                                            </span>
                                            <span className="drop-shadow-lg text-[#ecb200]">
                                                {ownedAlbums.length} owned
                                            </span>
                                        </>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Genres/Tags */}
                        {genres.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {genres.slice(0, 6).map((genre: string) => (
                                    <span
                                        key={genre}
                                        className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-xs md:text-sm text-white drop-shadow-lg border border-white/5"
                                    >
                                        {genre}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Bar - rendered inside hero for visual continuity */}
                {children && (
                    <div className="mt-8 md:mt-10">
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
}
