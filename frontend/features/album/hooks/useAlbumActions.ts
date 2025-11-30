import { api } from "@/lib/api";
import { useAudio } from "@/lib/audio-context";
import { useDownloadContext } from "@/lib/download-context";
import { toast } from "sonner";
import { Album, Track } from "../types";

export function useAlbumActions() {
    const {
        playTracks,
        playTrack: playTrackAudio,
        addToQueue: addToQueueAudio,
    } = useAudio();
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
            const shuffled = [...formattedTracks].sort(
                () => Math.random() - 0.5
            );
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

            // Show immediate feedback to user
            toast.loading(`Preparing download: "${album.title}"...`, {
                id: `download-${mbid}`,
            });

            await api.downloadAlbum(
                album.artist?.name || "Unknown Artist",
                album.title,
                mbid
            );

            // Update the loading toast to success
            toast.success(`Downloading "${album.title}"`, {
                id: `download-${mbid}`,
            });
        } catch (error) {
            console.error("Failed to download album:", error);
            toast.error("Failed to start album download", {
                id: `download-${mbid}`,
            });
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
