import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
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

export function useSoulseekSearch({
    query,
}: UseSoulseekSearchProps): UseSoulseekSearchReturn {
    const [soulseekResults, setSoulseekResults] = useState<SoulseekResult[]>(
        []
    );
    const [isSoulseekSearching, setIsSoulseekSearching] = useState(false);
    const [isSoulseekPolling, setIsSoulseekPolling] = useState(false);
    const [soulseekSearchId, setSoulseekSearchId] = useState<string | null>(
        null
    );
    const [soulseekEnabled, setSoulseekEnabled] = useState(false);
    const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(
        new Set()
    );
    const { toast } = useToast();

    // Check if Soulseek is configured (has credentials)
    // Use the public /soulseek/status endpoint instead of admin-only /system-settings
    useEffect(() => {
        const checkSoulseekStatus = async () => {
            try {
                const status = await api.getSlskdStatus();
                // The status endpoint returns { enabled: boolean, connected: boolean }
                setSoulseekEnabled(Boolean(status.enabled));
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

        // Track if this effect has been cancelled
        let cancelled = false;
        let pollInterval: NodeJS.Timeout | null = null;
        let searchId: string | null = null;

        const timer = setTimeout(async () => {
            if (cancelled) return;

            setIsSoulseekSearching(true);
            setIsSoulseekPolling(true);

            try {
                const response = await api.searchSoulseek(query);
                if (cancelled) return;

                searchId = response.searchId;
                setSoulseekSearchId(searchId);
                setSoulseekResults([]);

                let pollCount = 0;
                const maxPolls = 30;

                // Wait 3 seconds before starting to poll
                await new Promise((resolve) => setTimeout(resolve, 3000));
                if (cancelled) return;

                setIsSoulseekSearching(false);

                pollInterval = setInterval(async () => {
                    if (cancelled) {
                        if (pollInterval) clearInterval(pollInterval);
                        return;
                    }

                    try {
                        const { results } = await api.getSoulseekResults(searchId!);
                        if (cancelled) return;

                        if (results && results.length > 0) {
                            setSoulseekResults(results);
                            if (results.length >= 10) {
                                if (pollInterval) clearInterval(pollInterval);
                                pollInterval = null;
                                setIsSoulseekPolling(false);
                            }
                        }

                        pollCount++;

                        if (pollCount >= maxPolls) {
                            if (pollInterval) clearInterval(pollInterval);
                            pollInterval = null;
                            setIsSoulseekPolling(false);
                        }
                    } catch (error) {
                        console.error("Error polling Soulseek results:", error);
                        if (pollInterval) clearInterval(pollInterval);
                        pollInterval = null;
                        setIsSoulseekPolling(false);
                    }
                }, 2000);
            } catch (error) {
                if (cancelled) return;
                console.error("Error starting Soulseek search:", error);
                setIsSoulseekSearching(false);
                setIsSoulseekPolling(false);
            }
        }, 800);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            if (pollInterval) {
                clearInterval(pollInterval);
            }
            setIsSoulseekSearching(false);
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

            // Use the activity sidebar (Active tab) instead of a toast/modal
            if (typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent("set-activity-panel-tab", {
                        detail: { tab: "active" },
                    })
                );
                window.dispatchEvent(new CustomEvent("open-activity-panel"));
                window.dispatchEvent(new CustomEvent("notifications-changed"));
            }

            setTimeout(() => {
                setDownloadingFiles((prev) => {
                    const newSet = new Set(prev);
                    newSet.delete(result.filename);
                    return newSet;
                });
            }, 5000);
        } catch (error) {
            console.error("Download error:", error);
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to start download";
            toast.error(message);
            setDownloadingFiles((prev) => {
                const newSet = new Set(prev);
                newSet.delete(result.filename);
                return newSet;
            });
        }
    }, [toast]);

    return {
        soulseekResults,
        isSoulseekSearching,
        isSoulseekPolling,
        soulseekEnabled,
        downloadingFiles,
        handleDownload,
    };
}
