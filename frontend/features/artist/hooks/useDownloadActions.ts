import { useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useDownloadContext } from '@/lib/download-context';
import { Artist, Album } from '../types';

export function useDownloadActions() {
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

        // Show immediate feedback
        toast.loading(`Preparing download: "${artist.name}"...`, {
          id: `download-${artist.mbid}`,
        });

        // Trigger download
        await api.downloadArtist(artist.name, artist.mbid);

        // Update the loading toast to success
        toast.success(`Downloading ${artist.name}`, {
          id: `download-${artist.mbid}`,
        });
      } catch (error: any) {
        console.error('Failed to download artist:', error);
        toast.error(error.message || 'Failed to download artist', {
          id: `download-${artist.mbid}`,
        });
      }
    },
    [addPendingDownload, isPendingByMbid]
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

        // Show immediate feedback
        toast.loading(`Preparing download: "${album.title}"...`, {
          id: `download-${mbid}`,
        });

        // Trigger download
        await api.downloadAlbum(artistName, album.title, mbid);

        // Update the loading toast to success
        toast.success(`Downloading ${album.title}`, {
          id: `download-${mbid}`,
        });
      } catch (error: any) {
        console.error('Failed to download album:', error);
        toast.error(error.message || 'Failed to download album', {
          id: `download-${mbid}`,
        });
      }
    },
    [addPendingDownload, isPendingByMbid]
  );

  return {
    downloadArtist,
    downloadAlbum,
  };
}
