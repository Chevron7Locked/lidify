"use client";

import { Card } from "@/components/ui/Card";
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
import { ChapterList } from "@/features/audiobook/components/ChapterList";

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
    seekToChapter,
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

      {/* Main Content - fills remaining viewport height */}
      <div className="relative min-h-[50vh] flex-1">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: colors
              ? `linear-gradient(to bottom, ${colors.vibrant}15 0%, ${colors.vibrant}08 15%, ${colors.darkVibrant}05 30%, transparent 50%)`
              : "transparent",
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgba(16,16,16,0.4)_100%)] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-8">
          <PlayControls
            audiobook={audiobook}
            isThisBookPlaying={isThisBookPlaying}
            isPlaying={isPlaying}
            currentTime={currentTime}
            onPlayPause={handlePlayPause}
            formatTime={formatTime}
          />

          {/* Description */}
          {audiobook.description &&
            !audiobook.description.match(/^(Read by|Narrated by):/i) && (
              <section>
                <h2 className="text-2xl md:text-3xl font-bold mb-6">About</h2>
                <Card className="p-6">
                  <div
                    className="text-gray-300 text-sm leading-relaxed prose prose-invert prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: audiobook.description }}
                  />
                </Card>
              </section>
            )}

          {audiobook.chapters && (
            <ChapterList
              chapters={audiobook.chapters}
              onSeekToChapter={seekToChapter}
              formatTime={formatTime}
            />
          )}
        </div>
      </div>
    </div>
  );
}
