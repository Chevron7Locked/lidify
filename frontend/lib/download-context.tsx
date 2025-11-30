"use client";

import {
    createContext,
    useContext,
    useState,
    ReactNode,
    useEffect,
} from "react";
import { useDownloadStatus } from "@/hooks/useDownloadStatus";
import { useAuth } from "@/lib/auth-context";

interface PendingDownload {
    id: string;
    type: "artist" | "album";
    subject: string;
    mbid: string; // Unique identifier for deduplication
    timestamp: number;
}

interface DownloadContextType {
    pendingDownloads: PendingDownload[];
    downloadStatus: {
        activeDownloads: any[];
        recentDownloads: any[];
        hasActiveDownloads: boolean;
        failedDownloads: any[];
    };
    addPendingDownload: (
        type: "artist" | "album",
        subject: string,
        mbid: string
    ) => string | null;
    removePendingDownload: (id: string) => void;
    removePendingByMbid: (mbid: string) => void;
    isPending: (subject: string) => boolean;
    isPendingByMbid: (mbid: string) => boolean;
    isAnyPending: () => boolean;
}

const DownloadContext = createContext<DownloadContextType | undefined>(
    undefined
);

export function DownloadProvider({ children }: { children: ReactNode }) {
    const [pendingDownloads, setPendingDownloads] = useState<PendingDownload[]>(
        []
    );
    const { isAuthenticated } = useAuth();
    const downloadStatus = useDownloadStatus(15000, isAuthenticated);

    // Sync pending downloads with actual download status
    useEffect(() => {
        // Remove pending downloads that have completed or failed
        setPendingDownloads((prev) => {
            return prev.filter((pending) => {
                // Check if this MBID has a job that's completed or failed
                const matchingJob = [
                    ...downloadStatus.activeDownloads,
                    ...downloadStatus.recentDownloads,
                    ...downloadStatus.failedDownloads,
                ].find((job) => job.targetMbid === pending.mbid);

                // If job is completed or failed, remove from pending
                if (
                    matchingJob &&
                    (matchingJob.status === "completed" ||
                        matchingJob.status === "failed")
                ) {
                    return false;
                }

                // Keep if still pending/processing or no job found yet
                return true;
            });
        });
    }, [
        downloadStatus.activeDownloads,
        downloadStatus.recentDownloads,
        downloadStatus.failedDownloads,
    ]);

    const addPendingDownload = (
        type: "artist" | "album",
        subject: string,
        mbid: string
    ): string | null => {
        // Check if already downloading this MBID
        if (pendingDownloads.some((d) => d.mbid === mbid)) {
            return null;
        }

        const id = `${Date.now()}-${Math.random()}`;
        const download: PendingDownload = {
            id,
            type,
            subject,
            mbid,
            timestamp: Date.now(),
        };

        setPendingDownloads((prev) => [...prev, download]);

        return id;
    };

    const removePendingDownload = (id: string) => {
        setPendingDownloads((prev) => prev.filter((d) => d.id !== id));
    };

    const removePendingByMbid = (mbid: string) => {
        setPendingDownloads((prev) => prev.filter((d) => d.mbid !== mbid));
    };

    const isPending = (subject: string): boolean => {
        return pendingDownloads.some((d) => d.subject === subject);
    };

    const isPendingByMbid = (mbid: string): boolean => {
        // Check both pending downloads AND active download jobs
        const isPendingLocal = pendingDownloads.some((d) => d.mbid === mbid);
        const hasActiveJob = downloadStatus.activeDownloads.some(
            (job) => job.targetMbid === mbid
        );

        return isPendingLocal || hasActiveJob;
    };

    const isAnyPending = (): boolean => {
        return pendingDownloads.length > 0;
    };

    return (
        <DownloadContext.Provider
            value={{
                pendingDownloads,
                downloadStatus,
                addPendingDownload,
                removePendingDownload,
                removePendingByMbid,
                isPending,
                isPendingByMbid,
                isAnyPending,
            }}
        >
            {children}
        </DownloadContext.Provider>
    );
}

export function useDownloadContext() {
    const context = useContext(DownloadContext);
    if (!context) {
        throw new Error(
            "useDownloadContext must be used within DownloadProvider"
        );
    }
    return context;
}
