"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, RotateCcw, CheckCircle } from "lucide-react";

interface AudiobookActionBarProps {
  audiobook: any;
  onResetProgress: () => void;
  onMarkAsCompleted: () => void;
}

export function AudiobookActionBar({
  audiobook,
  onResetProgress,
  onMarkAsCompleted,
}: AudiobookActionBarProps) {
  const router = useRouter();

  const hasProgress = audiobook.progress && audiobook.progress.progress > 0;
  const isFinished = audiobook.progress?.isFinished;

  return (
    <div className="flex items-center gap-3 md:gap-4 flex-wrap justify-between">
      <Button
        variant="ghost"
        onClick={() => router.back()}
        className="flex items-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Button>

      {hasProgress && (
        <div className="flex items-center gap-2">
          {!isFinished && (
            <>
              <button
                onClick={onResetProgress}
                className="px-4 py-2 rounded-full text-sm font-semibold transition-all bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10 flex items-center gap-2"
                title="Clear progress and start from beginning"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Reset Progress</span>
              </button>

              <button
                onClick={onMarkAsCompleted}
                className="px-4 py-2 rounded-full text-sm font-semibold transition-all bg-green-500/10 text-green-400 hover:bg-green-500/20 hover:text-green-300 border border-green-500/30 flex items-center gap-2"
                title="Mark this audiobook as completed"
              >
                <CheckCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Mark as Completed</span>
              </button>
            </>
          )}

          {isFinished && (
            <button
              onClick={onResetProgress}
              className="px-4 py-2 rounded-full text-sm font-semibold transition-all bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10 flex items-center gap-2"
              title="Listen again from the beginning"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Listen Again</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
