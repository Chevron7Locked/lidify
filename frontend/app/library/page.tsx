'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useAudio } from '@/lib/audio-context';
import { useToast } from '@/lib/toast-context';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Tab, DeleteDialogState } from '@/features/library/types';
import { useLibraryData } from '@/features/library/hooks/useLibraryData';
import { useLibraryActions } from '@/features/library/hooks/useLibraryActions';
import { LibraryHeader } from '@/features/library/components/LibraryHeader';
import { LibraryTabs } from '@/features/library/components/LibraryTabs';
import { ArtistsGrid } from '@/features/library/components/ArtistsGrid';
import { AlbumsGrid } from '@/features/library/components/AlbumsGrid';
import { TracksList } from '@/features/library/components/TracksList';

export default function LibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { currentTrack, playTracks } = useAudio();

  // Get active tab from URL params, default to "artists"
  const activeTab = (searchParams.get('tab') as Tab) || 'artists';

  // Use custom hooks
  const { artists, albums, tracks, isLoading, reloadData } = useLibraryData({ activeTab });
  const {
    playArtist,
    playAlbum,
    addTrackToQueue,
    addTrackToPlaylist,
    deleteArtist,
    deleteAlbum,
    deleteTrack,
  } = useLibraryActions();

  // Delete confirmation dialog state
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteDialogState>({
    isOpen: false,
    type: 'track',
    id: '',
    title: '',
  });

  // Change tab function
  const changeTab = (tab: Tab) => {
    router.push(`/library?tab=${tab}`, { scroll: false });
  };

  // Helper to convert library Track to audio context Track format
  const formatTracksForAudio = (libraryTracks: typeof tracks) => {
    return libraryTracks.map(track => ({
      id: track.id,
      title: track.title,
      duration: track.duration,
      artist: {
        id: track.album?.artist?.id,
        name: track.album?.artist?.name || 'Unknown Artist',
      },
      album: {
        id: track.album?.id,
        title: track.album?.title || 'Unknown Album',
        coverArt: track.album?.coverArt,
      },
    }));
  };

  // Wrapper for playTracks that converts track format
  const handlePlayTracks = (libraryTracks: typeof tracks, startIndex?: number) => {
    const formattedTracks = formatTracksForAudio(libraryTracks);
    playTracks(formattedTracks, startIndex);
  };

  // Handle delete confirmation
  const handleDelete = async () => {
    try {
      switch (deleteConfirm.type) {
        case 'artist':
          await deleteArtist(deleteConfirm.id);
          toast.success('Artist deleted successfully');
          break;
        case 'album':
          await deleteAlbum(deleteConfirm.id);
          toast.success('Album deleted successfully');
          break;
        case 'track':
          await deleteTrack(deleteConfirm.id);
          toast.success('Track deleted successfully');
          break;
      }

      // Reload data and close dialog
      await reloadData();
      setDeleteConfirm({ isOpen: false, type: 'track', id: '', title: '' });
    } catch (error) {
      toast.error(`Failed to delete ${deleteConfirm.type}`);
    }
  };

  return (
    <div className="min-h-screen bg-black relative">
      <LibraryHeader />

      <div className="relative max-w-7xl mx-auto px-8 pb-24">
        <LibraryTabs activeTab={activeTab} onTabChange={changeTab} />

        {activeTab === 'artists' && (
          <ArtistsGrid
            artists={artists}
            isLoading={isLoading}
            onPlay={playArtist}
            onDelete={(id, name) =>
              setDeleteConfirm({ isOpen: true, type: 'artist', id, title: name })
            }
          />
        )}

        {activeTab === 'albums' && (
          <AlbumsGrid
            albums={albums}
            isLoading={isLoading}
            onPlay={playAlbum}
            onDelete={(id, title) =>
              setDeleteConfirm({ isOpen: true, type: 'album', id, title })
            }
          />
        )}

        {activeTab === 'tracks' && (
          <TracksList
            tracks={tracks}
            isLoading={isLoading}
            currentTrackId={currentTrack?.id}
            onPlay={handlePlayTracks}
            onAddToQueue={addTrackToQueue}
            onAddToPlaylist={addTrackToPlaylist}
            onDelete={(id: string, title: string) =>
              setDeleteConfirm({ isOpen: true, type: 'track', id, title })
            }
          />
        )}

        <ConfirmDialog
          isOpen={deleteConfirm.isOpen}
          onClose={() =>
            setDeleteConfirm({ isOpen: false, type: 'track', id: '', title: '' })
          }
          onConfirm={handleDelete}
          title={`Delete ${
            deleteConfirm.type === 'artist'
              ? 'Artist'
              : deleteConfirm.type === 'album'
              ? 'Album'
              : 'Track'
          }?`}
          message={
            deleteConfirm.type === 'track'
              ? `Are you sure you want to delete "${deleteConfirm.title}"? This will permanently delete the file from your system.`
              : deleteConfirm.type === 'album'
              ? `Are you sure you want to delete "${deleteConfirm.title}"? This will permanently delete all tracks and files from your system.`
              : `Are you sure you want to delete "${deleteConfirm.title}"? This will permanently delete all albums, tracks, and files from your system.`
          }
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
        />
      </div>
    </div>
  );
}
