"use client";

import { Card } from "@/components/ui/Card";

interface ChapterListProps {
  chapters: any[];
  onSeekToChapter: (startTime: number) => void;
  formatTime: (seconds: number) => string;
}

export function ChapterList({
  chapters,
  onSeekToChapter,
  formatTime,
}: ChapterListProps) {
  // Hide if >50 chapters (likely multi-file audiobook)
  if (!chapters || chapters.length === 0 || chapters.length > 50) {
    return null;
  }

  return (
    <section>
      <h2 className="text-2xl md:text-3xl font-bold mb-6">Chapters</h2>
      <Card className="p-6">
        <div className="space-y-2">
          {chapters.map((chapter: any, index: number) => (
            <button
              key={chapter.id}
              onClick={() => onSeekToChapter(chapter.start)}
              className="w-full text-left p-3 rounded-md hover:bg-[#1a1a1a] transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-gray-500 mr-2">
                    {index + 1}.
                  </span>
                  <span className="text-sm text-white group-hover:text-purple-400">
                    {chapter.title}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {formatTime(chapter.start)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </Card>
    </section>
  );
}
