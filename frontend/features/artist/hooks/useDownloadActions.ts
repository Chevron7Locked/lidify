import { useCallback } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useDownloadContext } from '@/lib/download-context';
import { Artist, Album } from '../types';

export function useDownloadActions() {
  const { toast } = useToast();
  const { addPendingDownload, isPendingByMbid } = useDownloadContext();

  const downloadArtist = useCallback(
    async (artist: Artist | null) => {
      if (!artist) {
        toast.error('No artist selected');
        return;
      }

      if (!artist.mbid) {
        toast.error('Artist MBID not available');
        return;
      }

      // Check if already downloading
      if (isPendingByMbid(artist.mbid)) {
        toast.info(`${artist.name} is already being downloaded`);
        return;
      }

      try {
        // Add to pending downloads
        addPendingDownload('artist', artist.name, artist.mbid);

        toast.info(`Preparing download: "${artist.name}"...`);

        // Trigger download
        await api.downloadArtist(artist.name, artist.mbid);

        toast.success(`Downloading ${artist.name}`);
      } catch (error: unknown) {
        console.error('Failed to download artist:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to download artist');
      }
    },
    [toast, addPendingDownload, isPendingByMbid]
  );

  const downloadAlbum = useCallback(
    async (album: Album, artistName: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Get MBID (prefer rgMbid, fallback to mbid)
      const mbid = album.rgMbid || album.mbid;

      if (!mbid) {
        toast.error('Album MBID not available');
        return;
      }

      // Check if already downloading
      if (isPendingByMbid(mbid)) {
        toast.info(`${album.title} is already being downloaded`);
        return;
      }

      try {
        // Add to pending downloads
        addPendingDownload('album', `${artistName} - ${album.title}`, mbid);

        toast.info(`Preparing download: "${album.title}"...`);

        // Trigger download
        await api.downloadAlbum(artistName, album.title, mbid);

        toast.success(`Downloading ${album.title}`);
      } catch (error: unknown) {
        console.error('Failed to download album:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to download album');
      }
    },
    [toast, addPendingDownload, isPendingByMbid]
  );

  return {
    downloadArtist,
    downloadAlbum,
  };
}
