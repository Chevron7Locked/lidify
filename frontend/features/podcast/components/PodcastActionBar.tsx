"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, ExternalLink, Trash2, Plus, Loader2 } from "lucide-react";

// Lidify brand yellow for all on-page action buttons
const LIDIFY_YELLOW = "#ecb200";

interface PodcastActionBarProps {
    isSubscribed: boolean;
    feedUrl?: string;
    colors: any;
    isSubscribing: boolean;
    showDeleteConfirm: boolean;
    onSubscribe: () => void;
    onRemove: () => void;
    onShowDeleteConfirm: (show: boolean) => void;
}

export function PodcastActionBar({
    isSubscribed,
    feedUrl,
    colors,
    isSubscribing,
    showDeleteConfirm,
    onSubscribe,
    onRemove,
    onShowDeleteConfirm,
}: PodcastActionBarProps) {
    const router = useRouter();

    return (
        <div className="flex items-center justify-between gap-3 md:gap-4 flex-wrap">
            <div className="flex items-center gap-3 md:gap-4">
                <Button
                    variant="ghost"
                    onClick={() => router.back()}
                    className="flex items-center gap-2"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </Button>
                {feedUrl && (
                    <a
                        href={feedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-full font-bold transition-all backdrop-blur-sm border border-white/5 text-sm"
                    >
                        <ExternalLink className="w-4 h-4" />
                        <span className="hidden md:inline">
                            RSS Feed
                        </span>
                    </a>
                )}
            </div>

            {/* Subscribe Button (Preview Mode) */}
            {!isSubscribed && (
                <Button
                    variant="primary"
                    onClick={onSubscribe}
                    disabled={isSubscribing}
                    className="flex items-center gap-2"
                    style={{
                        backgroundColor: LIDIFY_YELLOW,
                        borderColor: LIDIFY_YELLOW,
                        color: "#000000",
                    }}
                >
                    {isSubscribing ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Subscribing...
                        </>
                    ) : (
                        <>
                            <Plus className="w-4 h-4" />
                            Subscribe
                        </>
                    )}
                </Button>
            )}

            {/* Remove Podcast Button (Subscribed Mode) */}
            {isSubscribed && (
                <>
                    {!showDeleteConfirm ? (
                        <Button
                            variant="ghost"
                            onClick={() => onShowDeleteConfirm(true)}
                            className="flex items-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                            <Trash2 className="w-4 h-4" />
                            <span className="hidden md:inline">
                                Remove
                            </span>
                        </Button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400 hidden md:inline">
                                Remove podcast?
                            </span>
                            <Button
                                variant="ghost"
                                onClick={onRemove}
                                className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
                            >
                                Confirm
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => onShowDeleteConfirm(false)}
                            >
                                Cancel
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
