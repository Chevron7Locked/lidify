import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

export type JobType = "scan" | "discover";

export interface JobStatus {
    status: "waiting" | "active" | "completed" | "failed" | "delayed";
    progress: number;
    result?: any;
    error?: string;
}

export function useJobStatus(
    jobId: string | null,
    jobType: JobType,
    options?: {
        pollInterval?: number;
        onComplete?: (result: any) => void;
        onError?: (error: string) => void;
    }
) {
    const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const pollInterval = options?.pollInterval || 5000; // Default: poll every 5 seconds (avoid rate limiting)

    const checkStatus = useCallback(async () => {
        if (!jobId) return;

        try {
            let statusData;
            if (jobType === "scan") {
                statusData = await api.getScanStatus(jobId);
            } else if (jobType === "discover") {
                statusData = await api.getDiscoverGenerationStatus(jobId);
            }

            if (!statusData) return;

            setJobStatus(statusData as JobStatus);

            // Stop polling if job is complete or failed
            if (statusData.status === "completed") {
                setIsPolling(false);
                if (options?.onComplete && statusData.result) {
                    options.onComplete(statusData.result);
                }
            } else if (statusData.status === "failed") {
                setIsPolling(false);
                if (options?.onError) {
                    const errorMsg =
                        statusData.result?.error ||
                        "Job failed with unknown error";
                    options.onError(errorMsg);
                }
            }
        } catch (error: any) {
            console.error("Error checking job status:", error);
            setIsPolling(false);
            if (options?.onError) {
                options.onError(error.message || "Failed to check job status");
            }
        }
    }, [jobId, jobType, options]);

    // Start polling when jobId is set
    useEffect(() => {
        if (jobId) {
            setIsPolling(true);
        }
    }, [jobId]);

    // Poll for status updates
    useEffect(() => {
        if (!isPolling || !jobId) return;

        // Check immediately
        checkStatus();

        // Then poll at interval
        const interval = setInterval(checkStatus, pollInterval);

        return () => clearInterval(interval);
    }, [isPolling, jobId, checkStatus, pollInterval]);

    return {
        jobStatus,
        isPolling,
        checkStatus,
    };
}
