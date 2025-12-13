import React from 'react';
import { Card } from '@/components/ui/Card';
import { Play, Pause, Volume2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { Track, Artist } from '../types';

interface PopularTracksProps {
  tracks: Track[];
  artist: Artist;
  currentTrackId: string | undefined;
  colors: any;
  onPlayTrack: (track: Track) => void;
  previewTrack: string | null;
  previewPlaying: boolean;
  onPreview: (track: Track, e: React.MouseEvent) => void;
}

export const PopularTracks: React.FC<PopularTracksProps> = ({
  tracks,
  artist,
  currentTrackId,
  colors,
  onPlayTrack,
  previewTrack,
  previewPlaying,
  onPreview,
}) => {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  return (
    <section>
      <h2 className="text-2xl md:text-3xl font-bold mb-6">Popular Tracks</h2>
      <Card>
        <div data-tv-section="tracks" className="divide-y divide-[#1c1c1c]">
          {tracks.slice(0, 10).map((track, index) => {
            const isPlaying = currentTrackId === track.id;
            const isPreviewPlaying = previewTrack === track.id && previewPlaying;

            return (
              <div
                key={track.id}
                data-track-row
                data-tv-card
                data-tv-card-index={index}
                tabIndex={0}
                className={cn(
                  'group relative flex items-center gap-3 md:gap-4 px-3 md:px-4 py-3 hover:bg-[#141414] transition-colors cursor-pointer',
                  isPlaying && 'bg-[#1a1a1a] border-l-2',
                  // Subtle visual indicator for preview-only tracks
                  (!track.album?.id || !track.album?.title || track.album.title === 'Unknown Album') && 'opacity-70 hover:opacity-90'
                )}
                style={
                  isPlaying
                    ? { borderLeftColor: colors?.vibrant || '#a855f7' }
                    : undefined
                }
                onClick={(e) => {
                  // For unowned tracks (no valid album), play preview instead
                  const isUnowned = !track.album?.id || !track.album?.title || track.album.title === 'Unknown Album';
                  if (isUnowned) {
                    onPreview(track, e);
                  } else {
                    onPlayTrack(track);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    // Same logic for keyboard navigation
                    const isUnowned = !track.album?.id || !track.album?.title || track.album.title === 'Unknown Album';
                    if (isUnowned) {
                      onPreview(track, e as unknown as React.MouseEvent);
                    } else {
                      onPlayTrack(track);
                    }
                  }
                }}
              >
                {/* Track Number / Play Icon */}
                <div className="w-6 md:w-8 flex-shrink-0 text-center">
                  <span
                    className={cn(
                      'group-hover:hidden text-sm',
                      isPlaying ? 'text-purple-400 font-bold' : 'text-gray-500'
                    )}
                  >
                    {index + 1}
                  </span>
                  <Play
                    className="hidden group-hover:inline-block w-4 h-4 text-white"
                    fill="currentColor"
                  />
                </div>

                {/* Track Info */}
                <div className="flex-1 min-w-0">
                  <div className={cn('font-medium truncate text-sm md:text-base flex items-center gap-2', isPlaying ? 'text-purple-400' : 'text-white')}>
                    <span className="truncate">{track.title}</span>
                    {(!track.album?.id || !track.album?.title || track.album.title === 'Unknown Album') && (
                      <span className="shrink-0 text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30 font-medium">
                        PREVIEW
                      </span>
                    )}
                  </div>
                  {track.album?.title && track.album.title !== 'Unknown Album' && (
                    <div className="text-xs md:text-sm text-gray-400 truncate">
                      {track.album.title}
                    </div>
                  )}
                </div>

                {/* Play Count */}
                {track.playCount !== undefined && track.playCount > 0 && (
                  <div className="hidden lg:flex items-center gap-1.5 text-xs text-gray-400 bg-[#1a1a1a] px-2 py-1 rounded-full">
                    <Play className="w-3 h-3" />
                    <span>{formatNumber(track.playCount)}</span>
                  </div>
                )}

                {/* Listeners Count */}
                {track.listeners !== undefined && track.listeners > 0 && (
                  <div className="hidden xl:flex items-center gap-1.5 text-xs text-gray-400 bg-[#1a1a1a] px-2 py-1 rounded-full">
                    <span>{formatNumber(track.listeners)} listeners</span>
                  </div>
                )}

                {/* Preview Button - show for tracks without album info or unknown albums */}
                {(!track.album?.id || !track.album?.title || track.album.title === 'Unknown Album') && (
                  <button
                    onClick={(e) => onPreview(track, e)}
                    className="p-2 rounded-full bg-[#1a1a1a] hover:bg-[#2a2a2a] transition-colors text-white"
                    aria-label={isPreviewPlaying ? 'Pause preview' : 'Play preview'}
                  >
                    {isPreviewPlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                )}

                {/* Duration */}
                {track.duration && (
                  <div className="text-xs md:text-sm text-gray-400 w-10 md:w-12 text-right tabular-nums">
                    {formatDuration(track.duration)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </section>
  );
};
