"use client";

import { GradientSpinner } from "@/components/ui/GradientSpinner";
import { useImageColor } from "@/hooks/useImageColor";
import { formatTime } from "@/utils/formatTime";

// Hooks
import { useAudiobookData } from "@/features/audiobook/hooks/useAudiobookData";
import { useAudiobookActions } from "@/features/audiobook/hooks/useAudiobookActions";

// Components
import { AudiobookHero } from "@/features/audiobook/components/AudiobookHero";
import { AudiobookActionBar } from "@/features/audiobook/components/AudiobookActionBar";
import { PlayControls } from "@/features/audiobook/components/PlayControls";

export default function AudiobookDetailPage() {
  // Data hook
  const { audiobookId, audiobook, isLoading, refetch, heroImage, metadata } =
    useAudiobookData();

  // Extract colors from the hero image
  const { colors } = useImageColor(heroImage);

  // Action hooks
  const {
    isThisBookPlaying,
    isPlaying,
    currentTime,
    handlePlayPause,
    handleMarkAsCompleted,
    handleResetProgress,
  } = useAudiobookActions(audiobookId, audiobook, refetch);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <GradientSpinner size="md" />
      </div>
    );
  }

  if (!audiobook) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Audiobook not found</p>
      </div>
    );
  }

  // Clean up description - strip HTML and clean whitespace
  const cleanDescription = audiobook.description
    ? audiobook.description
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : null;

  const showDescription =
    cleanDescription &&
    !cleanDescription.match(/^(Read by|Narrated by):/i) &&
    cleanDescription.length > 20;

  return (
    <div className="min-h-screen flex flex-col">
      <AudiobookHero
        audiobook={audiobook}
        heroImage={heroImage}
        colors={colors}
        metadata={metadata}
        formatTime={formatTime}
      >
        <AudiobookActionBar
          audiobook={audiobook}
          onResetProgress={handleResetProgress}
          onMarkAsCompleted={handleMarkAsCompleted}
        />
      </AudiobookHero>

      {/* Main Content */}
      <div className="relative flex-1">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: colors
              ? `linear-gradient(to bottom, ${colors.vibrant}15 0%, ${colors.vibrant}08 15%, ${colors.darkVibrant}05 30%, transparent 50%)`
              : "transparent",
          }}
        />

        <div className="relative max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
          {/* Play Controls - centered and prominent */}
          <PlayControls
            audiobook={audiobook}
            isThisBookPlaying={isThisBookPlaying}
            isPlaying={isPlaying}
            currentTime={currentTime}
            onPlayPause={handlePlayPause}
            formatTime={formatTime}
          />

          {/* Description - cleaner styling */}
          {showDescription && (
            <section className="mt-12">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-4">
                About
              </h2>
              <div className="bg-white/[0.03] rounded-xl p-6 border border-white/5">
                <p className="text-gray-300 text-sm md:text-base leading-relaxed">
                  {cleanDescription}
                </p>
              </div>
            </section>
          )}

          {/* Series info if part of series */}
          {audiobook.series && (
            <section className="mt-8">
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <span className="text-purple-400 font-medium">
                  {audiobook.series.name}
                </span>
                <span className="text-gray-600">•</span>
                <span>Book {audiobook.series.sequence}</span>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
