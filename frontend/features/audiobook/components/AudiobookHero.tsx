"use client";

import { Book } from "lucide-react";
import { ReactNode } from "react";

interface AudiobookHeroProps {
  audiobook: any;
  heroImage: string | null;
  colors: any;
  metadata: {
    narrator: string | null;
    genre: string | null;
    publishedYear: string | null;
    description: string | null;
  } | null;
  formatTime: (seconds: number) => string;
  children?: ReactNode;
}

export function AudiobookHero({
  audiobook,
  heroImage,
  colors,
  metadata,
  formatTime,
  children,
}: AudiobookHeroProps) {
  return (
    <div className="relative">
      {/* Background Image with Blur */}
      {heroImage ? (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 scale-110 blur-md opacity-50">
            <img
              src={heroImage}
              alt={audiobook.title}
              className="w-full h-full object-cover"
            />
          </div>
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
          {/* Cover Art */}
          <div className="w-36 h-36 md:w-56 md:h-56 bg-[#1a1a1a] rounded-full shadow-2xl flex-shrink-0 overflow-hidden">
            {heroImage ? (
              <img
                src={heroImage}
                alt={audiobook.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Book className="w-24 h-24 text-gray-600" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 pb-2 space-y-1 md:space-y-4">
            <div className="text-xs md:text-base font-bold text-white/90 drop-shadow-lg">
              Audiobook
            </div>
            <h1 className="text-2xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-white drop-shadow-2xl leading-tight">
              {audiobook.title}
            </h1>

            {metadata?.description &&
              !metadata.description.match(/^(Read by|Narrated by):/i) && (
                <p className="text-sm md:text-base text-white/80 line-clamp-2 max-w-4xl drop-shadow-lg leading-relaxed">
                  {metadata.description
                    .replace(/<[^>]*>/g, " ")
                    .replace(/\s+/g, " ")
                    .trim()
                    .substring(0, 200)}
                  ...
                </p>
              )}

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-xs md:text-base text-white/90 font-medium">
              <span className="drop-shadow-lg font-semibold">
                {audiobook.author}
              </span>
              {metadata?.narrator && (
                <>
                  <span className="text-white/40">•</span>
                  <span className="drop-shadow-lg text-gray-300">
                    {metadata.narrator}
                  </span>
                </>
              )}
              <span className="text-white/40">•</span>
              <span className="drop-shadow-lg">
                {formatTime(audiobook.duration)}
              </span>
              {audiobook.progress && (
                <>
                  <span className="text-white/40">•</span>
                  <span className="drop-shadow-lg text-purple-400">
                    {audiobook.progress.isFinished
                      ? "Finished"
                      : `${Math.round(audiobook.progress.progress)}% complete`}
                  </span>
                </>
              )}
            </div>

            <div className="hidden md:flex flex-wrap gap-2">
              {audiobook.series && (
                <span className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-xs md:text-sm text-white drop-shadow-lg border border-white/5">
                  {audiobook.series.name} #{audiobook.series.sequence}
                </span>
              )}
              {audiobook.genres?.slice(0, 5).map((genre: string) => (
                <span
                  key={genre}
                  className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-xs md:text-sm text-white drop-shadow-lg border border-white/5"
                >
                  {genre}
                </span>
              ))}
              {audiobook.language && (
                <span className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-xs md:text-sm text-white drop-shadow-lg border border-white/5">
                  {audiobook.language.toUpperCase()}
                </span>
              )}
            </div>
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
