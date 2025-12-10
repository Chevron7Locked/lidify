import { Job } from "bull";
import { discoverWeeklyService } from "../../services/discoverWeekly";

export interface DiscoverJobData {
    userId: string;
}

export interface DiscoverJobResult {
    success: boolean;
    playlistName: string;
    songCount: number;
    error?: string;
}

export async function processDiscoverWeekly(
    job: Job<DiscoverJobData>
): Promise<DiscoverJobResult> {
    const { userId } = job.data;

    console.log(
        `[DiscoverJob ${job.id}] Generating Discover Weekly for user ${userId}`
    );

    await job.progress(10);

    try {
        // Note: The discoverWeeklyService.generatePlaylist doesn't have progress callback yet
        // For now, we'll just report progress at key stages
        await job.progress(20); // Starting generation

        console.log(
            `[DiscoverJob ${job.id}] Calling discoverWeeklyService.generatePlaylist...`
        );
        const result = await discoverWeeklyService.generatePlaylist(userId);

        console.log(`[DiscoverJob ${job.id}] Result:`, {
            success: result.success,
            playlistName: result.playlistName,
            songCount: result.songCount,
            error: result.error,
        });

        await job.progress(100); // Complete

        console.log(
            `[DiscoverJob ${job.id}] Generation complete: ${
                result.success ? "SUCCESS" : "FAILED"
            }`
        );
        if (!result.success) {
            console.log(`[DiscoverJob ${job.id}] Error: ${result.error}`);
        }

        return result;
    } catch (error: any) {
        console.error(
            `[DiscoverJob ${job.id}] Generation failed with exception:`,
            error
        );
        console.error(`[DiscoverJob ${job.id}] Stack trace:`, error.stack);

        return {
            success: false,
            playlistName: "",
            songCount: 0,
            error: error.message || "Unknown error",
        };
    }
}
