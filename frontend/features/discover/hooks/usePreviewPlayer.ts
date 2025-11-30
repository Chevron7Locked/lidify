import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";

export function usePreviewPlayer() {
    const [currentPreview, setCurrentPreview] = useState<string | null>(null);
    const [previewAudios, setPreviewAudios] = useState<
        Map<string, HTMLAudioElement>
    >(new Map());

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            previewAudios.forEach((audio) => {
                audio.pause();
                audio.src = "";
            });
        };
    }, [previewAudios]);

    const handleTogglePreview = useCallback(
        (albumId: string, previewUrl: string) => {
            if (!previewUrl) {
                toast.error("No preview available for this album");
                return;
            }

            // Stop currently playing preview if any
            if (currentPreview && currentPreview !== albumId) {
                const audio = previewAudios.get(currentPreview);
                if (audio) {
                    audio.pause();
                    audio.currentTime = 0;
                }
            }

            // Toggle the clicked preview
            if (currentPreview === albumId) {
                const audio = previewAudios.get(albumId);
                if (audio) {
                    audio.pause();
                    audio.currentTime = 0;
                }
                setCurrentPreview(null);
            } else {
                let audio = previewAudios.get(albumId);
                if (!audio) {
                    audio = new Audio(previewUrl);
                    audio.onended = () => {
                        setCurrentPreview(null);
                    };
                    audio.onerror = () => {
                        toast.error("Failed to load preview");
                        setCurrentPreview(null);
                    };
                    const newMap = new Map(previewAudios);
                    newMap.set(albumId, audio);
                    setPreviewAudios(newMap);
                }

                audio
                    .play()
                    .then(() => {
                        setCurrentPreview(albumId);
                    })
                    .catch((error) => {
                        toast.error("Failed to play preview: " + error.message);
                    });
            }
        },
        [currentPreview, previewAudios]
    );

    return {
        currentPreview,
        handleTogglePreview,
    };
}
