'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAudio } from '@/lib/audio-context';
import { useToast } from '@/lib/toast-context';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Tab, DeleteDialogState } from '@/features/library/types';
import { useLibraryData, LibraryFilter } from '@/features/library/hooks/useLibraryData';
import { api } from '@/lib/api';
import { useLibraryActions } from '@/features/library/hooks/useLibraryActions';
import { LibraryHeader } from '@/features/library/components/LibraryHeader';
import { LibraryTabs } from '@/features/library/components/LibraryTabs';
import { ArtistsGrid } from '@/features/library/components/ArtistsGrid';
import { AlbumsGrid } from '@/features/library/components/AlbumsGrid';
import { TracksList } from '@/features/library/components/TracksList';
import { Shuffle } from 'lucide-react';

type SortOption = 'name' | 'name-desc' | 'recent' | 'tracks';

export default function LibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { currentTrack, playTracks } = useAudio();

  // Get active tab from URL params, default to "artists"
  const activeTab = (searchParams.get('tab') as Tab) || 'artists';

  // Filter state (owned = your library, discovery = discovery weekly artists)
  const [filter, setFilter] = useState<LibraryFilter>('owned');

  // Sort and pagination state
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [itemsPerPage, setItemsPerPage] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState(1);

  // Use custom hooks
  const { artists, albums, tracks, isLoading, reloadData } = useLibraryData({ activeTab, filter });
  const {
    playArtist,
    playAlbum,
    addTrackToQueue,
    addTrackToPlaylist,
    deleteArtist,
    deleteAlbum,
    deleteTrack,
  } = useLibraryActions();

  // Reset page and filter when tab changes
  useEffect(() => {
    setCurrentPage(1);
    // Reset filter to 'owned' when switching to tracks tab (which doesn't support filter)
    if (activeTab === 'tracks') {
      setFilter('owned');
    }
  }, [activeTab]);

  // Sort and paginate data
  const sortedArtists = useMemo(() => {
    const sorted = [...artists];
    switch (sortBy) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'tracks':
        sorted.sort((a, b) => (b.trackCount || 0) - (a.trackCount || 0));
        break;
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [artists, sortBy]);

  const sortedAlbums = useMemo(() => {
    const sorted = [...albums];
    switch (sortBy) {
      case 'name':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case 'recent':
        sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
        break;
      default:
        sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    return sorted;
  }, [albums, sortBy]);

  const sortedTracks = useMemo(() => {
    const sorted = [...tracks];
    switch (sortBy) {
      case 'name':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.title.localeCompare(a.title));
        break;
      default:
        sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    return sorted;
  }, [tracks, sortBy]);

  // Paginate
  const paginatedArtists = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedArtists.slice(start, start + itemsPerPage);
  }, [sortedArtists, currentPage, itemsPerPage]);

  const paginatedAlbums = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedAlbums.slice(start, start + itemsPerPage);
  }, [sortedAlbums, currentPage, itemsPerPage]);

  const paginatedTracks = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedTracks.slice(start, start + itemsPerPage);
  }, [sortedTracks, currentPage, itemsPerPage]);

  // Total counts and pages
  const totalItems = activeTab === 'artists' ? artists.length : activeTab === 'albums' ? albums.length : tracks.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

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

  // Shuffle entire library
  const handleShuffleLibrary = async () => {
    try {
      // Get all tracks if not already loaded
      let allTracks = tracks;
      if (activeTab !== 'tracks' || tracks.length === 0) {
        const { tracks: fetchedTracks } = await api.getTracks({ limit: 1000 });
        allTracks = fetchedTracks;
      }

      if (allTracks.length === 0) {
        toast.error('No tracks in library');
        return;
      }

      // Shuffle the tracks
      const shuffled = [...allTracks].sort(() => Math.random() - 0.5);
      const formattedTracks = formatTracksForAudio(shuffled);
      playTracks(formattedTracks, 0);
      toast.success(`Shuffling ${shuffled.length} tracks`);
    } catch (error) {
      toast.error('Failed to shuffle library');
    }
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
    <div className="min-h-screen relative">
      <LibraryHeader />

      <div className="relative max-w-7xl mx-auto px-8 pb-24">
        <LibraryTabs activeTab={activeTab} onTabChange={changeTab} />

        {/* Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            {/* Shuffle Library Button */}
            <button
              onClick={handleShuffleLibrary}
              className="flex items-center gap-2 px-4 py-2 bg-[#ecb200] hover:bg-[#d4a000] text-black font-medium rounded-full transition-all hover:scale-105"
            >
              <Shuffle className="w-4 h-4" />
              <span className="hidden sm:inline">Shuffle Library</span>
            </button>

            {/* Filter Toggle (Owned / Discovery / All) - Only show for artists and albums */}
            {(activeTab === 'artists' || activeTab === 'albums') && (
              <div className="flex items-center bg-[#1a1a1a] border border-white/10 rounded-full p-1">
                <button
                  onClick={() => { setFilter('owned'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all ${
                    filter === 'owned'
                      ? 'bg-[#ecb200] text-black'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Owned
                </button>
                <button
                  onClick={() => { setFilter('discovery'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all ${
                    filter === 'discovery'
                      ? 'bg-purple-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Discovery
                </button>
                <button
                  onClick={() => { setFilter('all'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all ${
                    filter === 'all'
                      ? 'bg-white/20 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  All
                </button>
              </div>
            )}

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as SortOption);
                setCurrentPage(1);
              }}
              className="px-4 py-2 bg-[#1a1a1a] border border-white/10 rounded-full text-white text-sm focus:outline-none focus:border-purple-500 [&>option]:bg-[#1a1a1a] [&>option]:text-white"
            >
              <option value="name">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              {activeTab === 'albums' && <option value="recent">Year (Newest)</option>}
              {activeTab === 'artists' && <option value="tracks">Most Tracks</option>}
            </select>

            {/* Items per page */}
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-4 py-2 bg-[#1a1a1a] border border-white/10 rounded-full text-white text-sm focus:outline-none focus:border-purple-500 [&>option]:bg-[#1a1a1a] [&>option]:text-white"
            >
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
              <option value={250}>250 per page</option>
            </select>
          </div>

          {/* Item Count */}
          <span className="text-sm text-gray-400">
            {totalItems} {activeTab === 'artists' ? 'artists' : activeTab === 'albums' ? 'albums' : 'tracks'}
            {filter !== 'owned' && ` (${filter})`}
          </span>
        </div>

        {activeTab === 'artists' && (
          <ArtistsGrid
            artists={paginatedArtists}
            isLoading={isLoading}
            onPlay={playArtist}
            onDelete={(id, name) =>
              setDeleteConfirm({ isOpen: true, type: 'artist', id, title: name })
            }
          />
        )}

        {activeTab === 'albums' && (
          <AlbumsGrid
            albums={paginatedAlbums}
            isLoading={isLoading}
            onPlay={playAlbum}
            onDelete={(id, title) =>
              setDeleteConfirm({ isOpen: true, type: 'album', id, title })
            }
          />
        )}

        {activeTab === 'tracks' && (
          <TracksList
            tracks={paginatedTracks}
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="px-4 py-2 text-sm text-white">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Last
            </button>
          </div>
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
