"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { RotateCcw } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface RemoveProgressButtonProps {
    audiobookId: string;
    onProgressRemoved?: () => void;
}

export function RemoveProgressButton({
    audiobookId,
    onProgressRemoved,
}: RemoveProgressButtonProps) {
    const [isRemoving, setIsRemoving] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const { toast } = useToast();

    const handleRemoveProgress = async () => {
        setShowConfirmModal(false);
        setIsRemoving(true);
        try {
            await api.deleteAudiobookProgress(audiobookId);
            toast.success("Progress removed");
            onProgressRemoved?.();
        } catch (error) {
            console.error("Failed to remove progress:", error);
            toast.error("Failed to remove progress");
        } finally {
            setIsRemoving(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setShowConfirmModal(true)}
                disabled={isRemoving}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50 rounded-lg hover:bg-white/5"
                title="Start over from the beginning"
            >
                <RotateCcw className="w-4 h-4" />
                <span>{isRemoving ? "Removing..." : "Start Over"}</span>
            </button>

            <Modal
                isOpen={showConfirmModal}
                onClose={() => setShowConfirmModal(false)}
                title="Remove Progress"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => setShowConfirmModal(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleRemoveProgress}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Remove Progress
                        </Button>
                    </>
                }
            >
                <p className="text-gray-300">
                    Remove your progress for this audiobook? This will reset your position to the beginning.
                </p>
                <p className="text-gray-400 text-sm mt-2">
                    This action cannot be undone.
                </p>
            </Modal>
        </>
    );
}
