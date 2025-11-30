"use client";

import { Button } from "@/components/ui/Button";
import { Play, Pause, Book } from "lucide-react";

interface PlayControlsProps {
  audiobook: any;
  isThisBookPlaying: boolean;
  isPlaying: boolean;
  currentTime: number;
  onPlayPause: () => void;
  formatTime: (seconds: number) => string;
}

export function PlayControls({
  audiobook,
  isThisBookPlaying,
  isPlaying,
  currentTime,
  onPlayPause,
  formatTime,
}: PlayControlsProps) {
  const hasProgress = audiobook.progress && audiobook.progress.progress > 0;
  const isFinished = audiobook.progress?.isFinished;

  return (
    <section>
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
        <Button
          variant="primary"
          className="h-16 px-8 rounded-full shadow-lg hover:scale-105 transition-transform"
          onClick={onPlayPause}
        >
          {isThisBookPlaying && isPlaying ? (
            <>
              <Pause className="w-6 h-6 mr-2" />
              <span className="font-semibold">Pause</span>
            </>
          ) : (
            <>
              <Play className="w-6 h-6 mr-2 fill-current" />
              <span className="font-semibold">
                {hasProgress && !isFinished ? "Resume" : "Play"}
              </span>
            </>
          )}
        </Button>

        {hasProgress && !isFinished && (
          <div className="text-center sm:text-left">
            <div className="text-sm text-gray-400">Continue listening</div>
            <div className="text-white font-medium">
              {formatTime(
                isThisBookPlaying ? currentTime : audiobook.progress.currentTime
              )}{" "}
              / {formatTime(audiobook.duration)}
            </div>
            <div className="w-48 h-1 bg-[#181818] rounded-full mt-2">
              <div
                className="h-full bg-purple-500 rounded-full transition-all duration-300"
                style={{
                  width: `${
                    isThisBookPlaying
                      ? (currentTime / audiobook.duration) * 100
                      : audiobook.progress.progress
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {isFinished && (
          <div className="flex items-center gap-2 text-green-500">
            <Book className="w-5 h-5" />
            <span className="font-medium">Finished</span>
          </div>
        )}
      </div>

      <p className="text-center text-sm text-gray-400 mt-4">
        Use the player controls in the sidebar or bottom bar for playback speed,
        seeking, and volume.
      </p>
    </section>
  );
}
