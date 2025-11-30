"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Image from "next/image";

export default function SyncPage() {
    const router = useRouter();
    const [syncing, setSyncing] = useState(true);
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState("Scanning your music library...");
    const [error, setError] = useState("");

    useEffect(() => {
        let mounted = true;
        let pollInterval: NodeJS.Timeout | null = null;
        let redirectTimeout: NodeJS.Timeout | null = null;

        const startSync = async () => {
            try {
                // Start the library scan
                const scanResult = await api.scanLibrary();
                const jobId = scanResult.jobId;

                if (!mounted) return;
                setMessage("Scanning your music library...");

                // Poll for actual scan progress
                pollInterval = setInterval(async () => {
                    try {
                        const status = await api.getScanStatus(jobId);

                        if (!mounted) {
                            if (pollInterval) clearInterval(pollInterval);
                            return;
                        }

                        if (status.status === "completed") {
                            if (pollInterval) clearInterval(pollInterval);
                            setProgress(90);

                            // Trigger post-scan operations
                            try {
                                // 1. Audiobook sync
                                setMessage("Syncing audiobooks...");
                                await api.post("/audiobooks/sync");
                            } catch (audiobookError) {
                                console.error("Audiobook sync failed:", audiobookError);
                                // Don't fail the whole flow if audiobook sync fails
                            }

                            if (!mounted) return;
                            setProgress(95);

                            // Enrichment runs on-demand from Settings page
                            // Artists get images from Deezer/Fanart when first viewed

                            setProgress(100);
                            setMessage("All set! Redirecting...");
                            redirectTimeout = setTimeout(() => {
                                // Use window.location for full page reload to ensure fresh data
                                window.location.href = "/";
                            }, 1500);
                        } else if (status.status === "failed") {
                            if (pollInterval) clearInterval(pollInterval);
                            setError(
                                "Scan failed. You can skip and try again later."
                            );
                            setSyncing(false);
                        } else {
                            // Update progress based on actual scan progress
                            setProgress(Math.min(status.progress || 0, 90)); // Cap at 90% to reserve last 10% for audiobooks
                            if (status.progress > 0 && status.progress < 30) {
                                setMessage("Discovering tracks...");
                            } else if (
                                status.progress >= 30 &&
                                status.progress < 60
                            ) {
                                setMessage("Indexing albums...");
                            } else if (
                                status.progress >= 60 &&
                                status.progress < 90
                            ) {
                                setMessage("Organizing artists...");
                            } else if (status.progress >= 90) {
                                setMessage("Almost done...");
                            }
                        }
                    } catch (pollError) {
                        console.error("Error polling scan status:", pollError);
                    }
                }, 1000); // Poll every second
            } catch (err: any) {
                console.error("Sync error:", err);
                if (!mounted) return;
                setError(
                    "Failed to start sync. You can skip and start manually later."
                );
                setSyncing(false);
            }
        };

        startSync();

        return () => {
            mounted = false;
            if (pollInterval) {
                clearInterval(pollInterval);
            }
            if (redirectTimeout) {
                clearTimeout(redirectTimeout);
            }
        };
    }, []);

    const handleSkip = () => {
        // Use window.location for full page reload to ensure fresh data
        window.location.href = "/";
    };

    return (
        <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-[#0a0a0a] via-purple-900/20 to-[#0a0a0a]">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#ecb200]/10 via-purple-900/15 to-transparent" />

            {/* Animated gradient blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 -left-48 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
                <div
                    className="absolute bottom-1/4 -right-48 w-96 h-96 bg-[#ecb200]/10 rounded-full blur-[120px] animate-pulse"
                    style={{ animationDelay: "1s" }}
                />
            </div>

            {/* Main content */}
            <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
                <div className="w-full max-w-2xl">
                    {/* Logo */}
                    <div className="text-center mb-12">
                        <div className="inline-flex items-center gap-4 mb-4">
                            <div className="relative">
                                <div className="absolute inset-0 bg-white/10 blur-xl rounded-full" />
                                <Image
                                    src="/assets/images/LIDIFY.webp"
                                    alt="Lidify"
                                    width={64}
                                    height={64}
                                    className="relative z-10 drop-shadow-2xl"
                                />
                            </div>
                            <h1 className="text-5xl font-bold bg-gradient-to-r from-white via-white to-gray-200 bg-clip-text text-transparent drop-shadow-2xl">
                                Lidify
                            </h1>
                        </div>
                    </div>

                    {/* Sync card */}
                    <div className="bg-black/40 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl p-12">
                        <div className="text-center space-y-8">
                            {/* Icon */}
                            <div className="flex justify-center">
                                <div className="w-24 h-24 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center animate-pulse">
                                    <svg
                                        className="w-12 h-12 text-purple-400"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                                        />
                                    </svg>
                                </div>
                            </div>

                            {/* Title */}
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-2">
                                    {syncing
                                        ? "Setting Things Up"
                                        : "Ready to Go!"}
                                </h2>
                                <p className="text-white/60">
                                    {error || message}
                                </p>
                            </div>

                            {/* Progress bar */}
                            {syncing && !error && (
                                <div className="space-y-3">
                                    <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500 ease-out rounded-full"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                    <p className="text-sm text-white/50">
                                        {progress}% complete
                                    </p>
                                </div>
                            )}

                            {/* Error state */}
                            {error && (
                                <div className="flex items-center justify-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                                    <span className="text-red-500"></span>
                                    <p className="text-red-500 text-sm">
                                        {error}
                                    </p>
                                </div>
                            )}

                            {/* Features list */}
                            <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/10">
                                <div className="flex items-center gap-2 text-sm text-white/70">
                                    <div className="w-5 h-5 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                                        <svg
                                            className="w-3 h-3 text-purple-400"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={3}
                                                d="M5 13l4 4L19 7"
                                            />
                                        </svg>
                                    </div>
                                    <span>Scanning tracks</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-white/70">
                                    <div className="w-5 h-5 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                                        <svg
                                            className="w-3 h-3 text-purple-400"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={3}
                                                d="M5 13l4 4L19 7"
                                            />
                                        </svg>
                                    </div>
                                    <span>Building library</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-white/70">
                                    <div className="w-5 h-5 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                                        <svg
                                            className="w-3 h-3 text-purple-400"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={3}
                                                d="M5 13l4 4L19 7"
                                            />
                                        </svg>
                                    </div>
                                    <span>Organizing albums</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-white/70">
                                    <div className="w-5 h-5 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                                        <svg
                                            className="w-3 h-3 text-purple-400"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={3}
                                                d="M5 13l4 4L19 7"
                                            />
                                        </svg>
                                    </div>
                                    <span>Creating indexes</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Skip button */}
                    <div className="flex justify-end mt-6">
                        <button
                            onClick={handleSkip}
                            className="px-6 py-3 bg-white/5 border border-white/10 text-white/70 font-medium rounded-full hover:bg-white/10 hover:text-white transition-all"
                        >
                            Skip for Now →
                        </button>
                    </div>

                    {/* Footer note */}
                    <p className="text-center text-white/40 text-sm mt-6">
                        This may take a few minutes for large libraries
                    </p>
                </div>
            </div>
        </div>
    );
}
