import { api } from '@/lib/api';
import { useAudio } from '@/lib/audio-context';
import { useToast } from '@/lib/toast-context';
import { Track } from '../types';

// Helper to convert library Track to audio context Track format
const formatTrackForAudio = (track: Track) => ({
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
});

export function useLibraryActions() {
  const { playTrack, playTracks, addToQueue } = useAudio();
  const { toast } = useToast();

  const playArtist = async (artistId: string) => {
    try {
      const albumsData = await api.getAlbums({ artistId });
      if (!albumsData.albums || albumsData.albums.length === 0) {
        toast.error('No albums found for this artist');
        return;
      }

      const firstAlbum = await api.getAlbum(albumsData.albums[0].id);
      if (!firstAlbum || !firstAlbum.tracks || firstAlbum.tracks.length === 0) {
        toast.error('No tracks found for this artist');
        return;
      }

      const tracksWithAlbum = firstAlbum.tracks.map((track: any) => ({
        ...track,
        album: {
          id: firstAlbum.id,
          title: firstAlbum.title,
          coverArt: firstAlbum.coverArt || firstAlbum.coverUrl,
        },
        artist: {
          id: firstAlbum.artist?.id,
          name: firstAlbum.artist?.name,
        },
      }));

      playTracks(tracksWithAlbum, 0);
      toast.success(`Playing ${firstAlbum.artist?.name || 'artist'}`);
    } catch (error) {
      console.error('Error playing artist:', error);
      toast.error('Failed to play artist');
    }
  };

  const playAlbum = async (albumId: string) => {
    try {
      const album = await api.getAlbum(albumId);
      if (!album || !album.tracks || album.tracks.length === 0) {
        toast.error('No tracks found in this album');
        return;
      }

      const tracksWithAlbum = album.tracks.map((track: any) => ({
        ...track,
        album: {
          id: album.id,
          title: album.title,
          coverArt: album.coverArt || album.coverUrl,
        },
        artist: {
          id: album.artist?.id,
          name: album.artist?.name,
        },
      }));

      playTracks(tracksWithAlbum, 0);
      toast.success(`Playing ${album.title}`);
    } catch (error) {
      console.error('Error playing album:', error);
      toast.error('Failed to play album');
    }
  };

  const playTrackAction = (track: Track) => {
    try {
      playTrack(formatTrackForAudio(track));
    } catch (error) {
      console.error('Error playing track:', error);
      toast.error('Failed to play track');
    }
  };

  const addTrackToQueue = (track: Track) => {
    try {
      addToQueue(formatTrackForAudio(track));
      toast.success('Added to queue');
    } catch (error) {
      console.error('Error adding track to queue:', error);
      toast.error('Failed to add to queue');
    }
  };

  const addTrackToPlaylist = async (playlistId: string, trackId: string) => {
    try {
      await api.addTrackToPlaylist(playlistId, trackId);
      toast.success('Added to playlist');
    } catch (error) {
      console.error('Error adding track to playlist:', error);
      toast.error('Failed to add to playlist');
    }
  };

  const deleteTrack = async (id: string): Promise<void> => {
    try {
      await api.deleteTrack(id);
    } catch (error) {
      console.error('Error deleting track:', error);
      throw error;
    }
  };

  const deleteAlbum = async (id: string): Promise<void> => {
    try {
      await api.deleteAlbum(id);
    } catch (error) {
      console.error('Error deleting album:', error);
      throw error;
    }
  };

  const deleteArtist = async (id: string): Promise<void> => {
    try {
      await api.deleteArtist(id);
    } catch (error) {
      console.error('Error deleting artist:', error);
      throw error;
    }
  };

  return {
    playArtist,
    playAlbum,
    playTrack: playTrackAction,
    addTrackToQueue,
    addTrackToPlaylist,
    deleteTrack,
    deleteAlbum,
    deleteArtist,
  };
}
