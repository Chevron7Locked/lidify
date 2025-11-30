import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { SoulseekResult } from "../types";

interface UseSoulseekSearchProps {
    query: string;
}

interface UseSoulseekSearchReturn {
    soulseekResults: SoulseekResult[];
    isSoulseekSearching: boolean;
    isSoulseekPolling: boolean;
    soulseekEnabled: boolean;
    downloadingFiles: Set<string>;
    handleDownload: (result: SoulseekResult) => Promise<void>;
}

export function useSoulseekSearch({ query }: UseSoulseekSearchProps): UseSoulseekSearchReturn {
    const [soulseekResults, setSoulseekResults] = useState<SoulseekResult[]>([]);
    const [isSoulseekSearching, setIsSoulseekSearching] = useState(false);
    const [isSoulseekPolling, setIsSoulseekPolling] = useState(false);
    const [soulseekSearchId, setSoulseekSearchId] = useState<string | null>(null);
    const [soulseekEnabled, setSoulseekEnabled] = useState(false);
    const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());

    // Check if Soulseek is enabled
    useEffect(() => {
        const checkSoulseekStatus = async () => {
            try {
                const settings = await api.getSystemSettings();
                setSoulseekEnabled(settings.slskdEnabled || false);
            } catch (error) {
                console.error("Failed to check Soulseek status:", error);
                setSoulseekEnabled(false);
            }
        };

        checkSoulseekStatus();
    }, []);

    // Soulseek search with polling
    useEffect(() => {
        if (!query.trim() || !soulseekEnabled) {
            setSoulseekResults([]);
            setSoulseekSearchId(null);
            return;
        }

        let pollInterval: NodeJS.Timeout | null = null;

        const timer = setTimeout(async () => {
            setIsSoulseekSearching(true);
            setIsSoulseekPolling(true);

            try {
                const { searchId } = await api.searchSoulseek(query);
                setSoulseekSearchId(searchId);
                setSoulseekResults([]);

                // Poll for results - limit to 5 for inline display
                let pollCount = 0;
                const maxPolls = 10;

                // Wait 3 seconds before starting to poll
                await new Promise((resolve) => setTimeout(resolve, 3000));
                setIsSoulseekSearching(false); // Initial search request complete

                pollInterval = setInterval(async () => {
                    try {
                        const { results } = await api.getSoulseekResults(searchId);

                        if (results && results.length > 0) {
                            setSoulseekResults(results);
                        }

                        pollCount++;

                        if (results.length >= 5 || pollCount >= maxPolls) {
                            if (pollInterval) clearInterval(pollInterval);
                            setIsSoulseekPolling(false);
                        }
                    } catch (error) {
                        console.error("Error polling Soulseek results:", error);
                        if (pollInterval) clearInterval(pollInterval);
                        setIsSoulseekPolling(false);
                    }
                }, 2000);
            } catch (error: any) {
                console.error("Soulseek search error:", error);
                if (error.message?.includes("not enabled")) {
                    setSoulseekEnabled(false);
                }
                setIsSoulseekSearching(false);
                setIsSoulseekPolling(false);
            }
        }, 800);

        return () => {
            clearTimeout(timer);
            if (pollInterval) {
                clearInterval(pollInterval);
            }
            setIsSoulseekPolling(false);
        };
    }, [query, soulseekEnabled]);

    // Handle downloads
    const handleDownload = useCallback(async (result: SoulseekResult) => {
        try {
            setDownloadingFiles((prev) => new Set([...prev, result.filename]));

            await api.downloadFromSoulseek(
                result.username,
                result.path,
                result.filename,
                result.size,
                result.parsedArtist,
                result.parsedAlbum
            );

            toast.success(`Download started: ${result.filename}`);

            setTimeout(() => {
                setDownloadingFiles((prev) => {
                    const newSet = new Set(prev);
                    newSet.delete(result.filename);
                    return newSet;
                });
            }, 5000);
        } catch (error: any) {
            console.error("Download error:", error);
            toast.error(error.message || "Failed to start download");
            setDownloadingFiles((prev) => {
                const newSet = new Set(prev);
                newSet.delete(result.filename);
                return newSet;
            });
        }
    }, []);

    return {
        soulseekResults,
        isSoulseekSearching,
        isSoulseekPolling,
        soulseekEnabled,
        downloadingFiles,
        handleDownload,
    };
}
