import { useCallback } from 'react';
import { api } from '@/lib/api';
import { useAudio } from '@/lib/audio-context';
import { toast } from 'sonner';
import { Artist, Album, Track } from '../types';

export function useArtistActions() {
  const { playTrack: playTrackFromContext, playTracks } = useAudio();

  // Helper to load all tracks from owned albums
  const loadAllOwnedTracks = async (artist: Artist, albums: Album[]) => {
    // Get owned albums sorted by year (newest first)
    const ownedAlbums = albums
      .filter((album) => album.owned)
      .sort((a, b) => (b.year || 0) - (a.year || 0));

    if (ownedAlbums.length === 0) {
      return [];
    }

    // Load tracks from all owned albums in parallel
    const albumDataPromises = ownedAlbums.map((album) => 
      api.getAlbum(album.id).catch(() => null)
    );
    
    const albumsData = await Promise.all(albumDataPromises);
    
    // Combine all tracks, maintaining album order (newest first)
    const allTracks: any[] = [];
    
    albumsData.forEach((albumData, index) => {
      if (!albumData || !albumData.tracks) return;
      
      const album = ownedAlbums[index];
      const formattedTracks = albumData.tracks.map((track: any) => ({
        id: track.id,
        title: track.title,
        trackNumber: track.trackNumber || 0,
        artist: { name: artist.name, id: artist.id },
        album: {
          title: album.title,
          coverArt: album.coverArt,
          id: album.id,
          year: album.year,
        },
        duration: track.duration,
      }));
      
      // Sort tracks within album by track number
      formattedTracks.sort((a: any, b: any) => a.trackNumber - b.trackNumber);
      allTracks.push(...formattedTracks);
    });

    return allTracks;
  };

  const playAll = useCallback(
    async (artist: Artist | null, albums: Album[]) => {
      if (!artist) {
        toast.error('No artist selected');
        return;
      }

      try {
        toast.loading('Loading tracks...', { id: 'play-all' });
        
        const allTracks = await loadAllOwnedTracks(artist, albums);

        if (allTracks.length === 0) {
          toast.error('No owned albums available to play', { id: 'play-all' });
          return;
        }

        // Play tracks in order (newest album first, track 1 to end, then next album)
        playTracks(allTracks);
        toast.success(`Playing ${artist.name} (${allTracks.length} tracks)`, { id: 'play-all' });
      } catch (error) {
        console.error('Failed to play artist:', error);
        toast.error('Failed to play artist', { id: 'play-all' });
      }
    },
    [playTracks]
  );

  const shufflePlay = useCallback(
    async (artist: Artist | null, albums: Album[]) => {
      if (!artist) {
        toast.error('No artist selected');
        return;
      }

      try {
        toast.loading('Loading tracks...', { id: 'shuffle-play' });
        
        const allTracks = await loadAllOwnedTracks(artist, albums);

        if (allTracks.length === 0) {
          toast.error('No owned albums available to play', { id: 'shuffle-play' });
          return;
        }

        // Shuffle all tracks randomly
        const shuffledTracks = [...allTracks].sort(() => Math.random() - 0.5);

        playTracks(shuffledTracks);
        toast.success(`Shuffling ${artist.name} (${shuffledTracks.length} tracks)`, { id: 'shuffle-play' });
      } catch (error) {
        console.error('Failed to shuffle play artist:', error);
        toast.error('Failed to shuffle play artist', { id: 'shuffle-play' });
      }
    },
    [playTracks]
  );

  const playTrack = useCallback(
    (track: Track, artist: Artist) => {
      try {
        // Format track for audio context
        const formattedTrack = {
          id: track.id,
          title: track.title,
          artist: { name: artist.name, id: artist.id },
          album: {
            title: track.album?.title || 'Unknown Album',
            coverArt: track.album?.coverArt,
            id: track.album?.id,
          },
          duration: track.duration,
        };

        playTrackFromContext(formattedTrack);
        toast.success(`Playing ${track.title}`);
      } catch (error) {
        console.error('Failed to play track:', error);
        toast.error('Failed to play track');
      }
    },
    [playTrackFromContext]
  );

  return {
    playAll,
    shufflePlay,
    playTrack,
  };
}
