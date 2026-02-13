import { api } from "@/lib/api";
import { useAudioControls } from "@/lib/audio-context";
import { useDownloadContext } from "@/lib/download-context";
import { shuffleArray } from "@/utils/shuffle";
import { useToast } from "@/lib/toast-context";
import { Album, Track } from "../types";

export function useAlbumActions() {
    const { toast } = useToast();
    // Use controls-only hook to avoid re-renders from playback state changes
    const {
        playTracks,
        playTrack: playTrackAudio,
        addToQueue: addToQueueAudio,
    } = useAudioControls();
    const { addPendingDownload, isPendingByMbid } = useDownloadContext();

    const playAlbum = (album: Album | null, startIndex: number = 0) => {
        if (!album) {
            toast.error("Album data not available");
            return;
        }

        const formattedTracks =
            album.tracks &&
            album.tracks.map((track) => ({
                id: track.id,
                title: track.title,
                duration: track.duration,
                artist: {
                    name: track.artist?.name || album.artist?.name || "",
                    id: track.artist?.id || album.artist?.id || "",
                },
                album: {
                    title: album.title,
                    id: album.id,
                    coverArt: album.coverArt || album.coverUrl,
                },
            }));

        if (formattedTracks) {
            playTracks(formattedTracks, startIndex);
        }
    };

    const shufflePlay = (album: Album | null) => {
        if (!album) {
            toast.error("Album data not available");
            return;
        }

        const formattedTracks =
            album.tracks &&
            album.tracks.map((track) => ({
                id: track.id,
                title: track.title,
                duration: track.duration,
                artist: {
                    name: track.artist?.name || album.artist?.name || "",
                    id: track.artist?.id || album.artist?.id || "",
                },
                album: {
                    title: album.title,
                    id: album.id,
                    coverArt: album.coverArt || album.coverUrl,
                },
            }));

        if (formattedTracks) {
            // Shuffle the tracks array
            const shuffled = shuffleArray(formattedTracks);
            playTracks(shuffled, 0);
        }
    };

    const playTrack = (track: Track, album: Album | null) => {
        if (!album) {
            toast.error("Album data not available");
            return;
        }

        const formattedTrack = {
            id: track.id,
            title: track.title,
            duration: track.duration,
            artist: {
                name: track.artist?.name || album.artist?.name || "",
                id: track.artist?.id || album.artist?.id || "",
            },
            album: {
                title: album.title,
                id: album.id,
                coverArt: album.coverArt || album.coverUrl,
            },
        };

        playTrackAudio(formattedTrack);
    };

    const addToQueue = (track: Track, album: Album | null) => {
        if (!album) {
            toast.error("Album data not available");
            return;
        }

        const formattedTrack = {
            id: track.id,
            title: track.title,
            duration: track.duration,
            artist: {
                name: track.artist?.name || album.artist?.name || "",
                id: track.artist?.id || album.artist?.id || "",
            },
            album: {
                title: album.title,
                id: album.id,
                coverArt: album.coverArt || album.coverUrl,
            },
        };

        addToQueueAudio(formattedTrack);
        toast.success(`Added "${track.title}" to queue`);
    };

    const downloadAlbum = async (album: Album | null, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
        }

        if (!album) {
            toast.error("Album data not available");
            return;
        }

        const mbid = album.rgMbid || album.mbid || album.id;
        if (!mbid) {
            toast.error("Album MBID not available");
            return;
        }

        if (isPendingByMbid(mbid)) {
            toast.info("Album is already being downloaded");
            return;
        }

        try {
            addPendingDownload("album", album.title, mbid);

            toast.info(`Preparing download: "${album.title}"...`);

            await api.downloadAlbum(
                album.artist?.name || "Unknown Artist",
                album.title,
                mbid
            );

            toast.success(`Downloading "${album.title}"`);
        } catch {
            toast.error("Failed to start album download");
        }
    };

    return {
        playAlbum,
        shufflePlay,
        playTrack,
        addToQueue,
        downloadAlbum,
    };
}
