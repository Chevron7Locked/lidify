"use client";

import { useState, memo, useCallback } from "react";
import Image from "next/image";
import { Track } from "../types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PlaylistSelector } from "@/components/ui/PlaylistSelector";
import { GradientSpinner } from "@/components/ui/GradientSpinner";
import { AudioLines, ListPlus, Plus, Trash2 } from "lucide-react";
import { cn, isLocalUrl } from "@/utils/cn";
import { api } from "@/lib/api";

interface TracksListProps {
  tracks: Track[];
  onPlay: (tracks: Track[], startIndex?: number) => void;
  onAddToQueue: (track: Track) => void;
  onAddToPlaylist: (playlistId: string, trackId: string) => void;
  onDelete: (trackId: string, trackTitle: string) => void;
  currentTrackId?: string;
  isLoading?: boolean;
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

interface TrackRowProps {
  track: Track;
  index: number;
  isCurrentlyPlaying: boolean;
  onPlayTrack: () => void;
  onAddToQueue: (track: Track) => void;
  onShowAddToPlaylist: (trackId: string) => void;
  onDelete: (trackId: string, trackTitle: string) => void;
}

const TrackRow = memo(function TrackRow({
  track,
  index,
  isCurrentlyPlaying,
  onPlayTrack,
  onAddToQueue,
  onShowAddToPlaylist,
  onDelete,
}: TrackRowProps) {
  return (
    <div
      key={track.id}
      onClick={onPlayTrack}
      data-tv-card
      data-tv-card-index={index}
      tabIndex={0}
      className={cn(
        "flex items-center gap-3 md:gap-4 px-3 md:px-4 py-3 hover:bg-[#141414] transition-colors group cursor-pointer",
        isCurrentlyPlaying &&
          "bg-[#1a1a1a] border-l-2 border-purple-500"
      )}
    >
      <span
        className={cn(
          "text-sm w-6 md:w-8 text-center",
          isCurrentlyPlaying
            ? "text-purple-400 font-medium"
            : "text-gray-500"
        )}
      >
        {index + 1}
      </span>
      <div className="relative w-10 h-10 md:w-12 md:h-12 bg-[#1a1a1a] rounded-sm flex items-center justify-center overflow-hidden flex-shrink-0">
        {track.album?.coverArt ? (
          <Image
            src={api.getCoverArtUrl(track.album.coverArt, 100)}
            alt={track.title}
            fill
            sizes="(max-width: 768px) 40px, 48px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <AudioLines className="w-5 h-5 md:w-6 md:h-6 text-gray-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-white truncate">
          {track.title}
        </h3>
        <p className="text-xs text-gray-500 truncate">
          {track.album?.artist?.name}
          {track.album?.title && ` • ${track.album.title}`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="icon"
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onAddToQueue(track);
          }}
          title="Add to Queue"
        >
          <ListPlus className="w-4 h-4" />
        </Button>
        <Button
          variant="icon"
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onShowAddToPlaylist(track.id);
          }}
          title="Add to Playlist"
        >
          <Plus className="w-4 h-4" />
        </Button>
        <Button
          variant="icon"
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-red-500 hover:text-red-600"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(track.id, track.title);
          }}
          title="Delete Track"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
        <span className="text-xs md:text-sm text-gray-500 flex-shrink-0 w-12 text-right">
          {formatDuration(track.duration)}
        </span>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if track ID or playing state changes
  return (
    prevProps.track.id === nextProps.track.id &&
    prevProps.isCurrentlyPlaying === nextProps.isCurrentlyPlaying &&
    prevProps.index === nextProps.index
  );
});

export function TracksList({
  tracks,
  onPlay,
  onAddToQueue,
  onAddToPlaylist,
  onDelete,
  currentTrackId,
  isLoading = false,
}: TracksListProps) {
  const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  const handleShowAddToPlaylist = useCallback((trackId: string) => {
    setSelectedTrackId(trackId);
    setShowPlaylistSelector(true);
  }, []);

  const handleAddToPlaylist = useCallback(async (playlistId: string) => {
    if (!selectedTrackId) return;
    onAddToPlaylist(playlistId, selectedTrackId);
    setShowPlaylistSelector(false);
    setSelectedTrackId(null);
  }, [selectedTrackId, onAddToPlaylist]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <GradientSpinner size="md" />
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <EmptyState
        icon={<AudioLines className="w-16 h-16" />}
        title="No tracks yet"
        description="Your library is empty. Sync your music to get started."
      />
    );
  }

  return (
    <>
      <Card>
        <div data-tv-section="library-tracks" className="divide-y divide-[#1c1c1c]">
          {tracks.map((track, index) => {
            const isCurrentlyPlaying = currentTrackId === track.id;
            return (
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                isCurrentlyPlaying={isCurrentlyPlaying}
                onPlayTrack={() => onPlay(tracks, index)}
                onAddToQueue={onAddToQueue}
                onShowAddToPlaylist={handleShowAddToPlaylist}
                onDelete={onDelete}
              />
            );
          })}
        </div>
      </Card>

      <PlaylistSelector
        isOpen={showPlaylistSelector}
        onClose={() => {
          setShowPlaylistSelector(false);
          setSelectedTrackId(null);
        }}
        onSelectPlaylist={handleAddToPlaylist}
      />
    </>
  );
}
