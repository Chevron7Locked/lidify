"use client";

import { Mic2 } from "lucide-react";
import { ReactNode } from "react";

interface PodcastHeroProps {
    title: string;
    author: string;
    description?: string;
    genres?: string[];
    heroImage: string | null;
    colors: any;
    episodeCount: number;
    inProgressCount: number;
    children?: ReactNode;
}

export function PodcastHero({
    title,
    author,
    description,
    genres,
    heroImage,
    colors,
    episodeCount,
    inProgressCount,
    children,
}: PodcastHeroProps) {
    return (
        <div className="relative">
            {/* Background Image with Blur */}
            {heroImage ? (
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute inset-0 scale-110 blur-md opacity-50">
                        <img
                            src={heroImage}
                            alt={title}
                            className="w-full h-full object-cover"
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
                    {/* Cover Art - Circular */}
                    <div className="w-[172px] h-[172px] md:w-56 md:h-56 bg-[#1a1a1a] rounded-full shadow-2xl flex-shrink-0 overflow-hidden">
                        {heroImage ? (
                            <img
                                src={heroImage}
                                alt={title}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <Mic2 className="w-24 h-24 text-gray-600" />
                            </div>
                        )}
                    </div>

                    {/* Podcast Info */}
                    <div className="flex-1 pb-2 space-y-2 md:space-y-4">
                        <div className="text-sm md:text-base font-bold text-white/90 drop-shadow-lg">
                            Podcast
                        </div>
                        <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-white drop-shadow-2xl leading-tight">
                            {title}
                        </h1>

                        {/* About/Description (truncated in hero) */}
                        {description && (
                            <p className="text-sm md:text-base text-white/80 line-clamp-2 max-w-4xl drop-shadow-lg leading-relaxed">
                                {description
                                    .replace(/<[^>]*>/g, "")
                                    .substring(0, 200)}
                                ...
                            </p>
                        )}

                        {/* Stats */}
                        <div className="flex flex-wrap items-center gap-2 text-sm md:text-base text-white/90 font-medium">
                            <span className="drop-shadow-lg font-semibold">
                                {author}
                            </span>
                            <span className="text-white/40">•</span>
                            <span className="drop-shadow-lg">
                                {episodeCount}{" "}
                                {episodeCount === 1 ? "episode" : "episodes"}
                            </span>
                            {inProgressCount > 0 && (
                                <>
                                    <span className="text-white/40">•</span>
                                    <span className="drop-shadow-lg text-purple-400">
                                        {inProgressCount} in progress
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Genres/Tags */}
                        {genres && genres.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {genres.slice(0, 6).map((genre: string) => (
                                    <span
                                        key={genre}
                                        className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-xs md:text-sm text-white drop-shadow-lg border border-white/5"
                                        style={
                                            colors?.vibrant
                                                ? {
                                                      backgroundColor: `${colors.vibrant}20`,
                                                      borderColor: `${colors.vibrant}30`,
                                                  }
                                                : undefined
                                        }
                                    >
                                        {genre}
                                    </span>
                                ))}
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

