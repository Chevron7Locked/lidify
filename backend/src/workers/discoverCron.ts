/**
 * Discover Weekly Cron Scheduler
 *
 * Automatically generates Discover Weekly playlists on Sunday evenings
 * so users have fresh music waiting Monday morning.
 */

import cron, { ScheduledTask } from "node-cron";
import { prisma } from "../utils/db";
import { discoverQueue } from "./queues";

let cronTask: ScheduledTask | null = null;

export function startDiscoverWeeklyCron() {
    // Run every Sunday at 8 PM (20:00)
    // Cron format: minute hour day-of-month month day-of-week
    // "0 20 * * 0" = At 20:00 on Sunday
    const schedule = "0 20 * * 0";

    console.log(
        `Scheduling Discover Weekly to run: ${schedule} (Sundays at 8 PM)`
    );

    cronTask = cron.schedule(schedule, async () => {
        console.log(`\n === Discover Weekly Cron Triggered ===`);
        console.log(`   Time: ${new Date().toLocaleString()}`);

        try {
            // Get all users with Discover Weekly enabled
            const configs = await prisma.userDiscoverConfig.findMany({
                where: {
                    enabled: true,
                },
                select: {
                    userId: true,
                    playlistSize: true,
                },
            });

            console.log(
                `   Found ${configs.length} users with Discover Weekly enabled`
            );

            for (const config of configs) {
                console.log(`   Queueing job for user ${config.userId}...`);

                await discoverQueue.add("discover-weekly", {
                    userId: config.userId,
                });
            }

            console.log(`   Queued ${configs.length} Discover Weekly jobs`);
        } catch (error: any) {
            console.error(`   ✗ Discover Weekly cron error:`, error.message);
        }
    });

    console.log("Discover Weekly cron scheduler started");
}

export function stopDiscoverWeeklyCron() {
    if (cronTask) {
        cronTask.stop();
        cronTask = null;
        console.log("Discover Weekly cron scheduler stopped");
    }
}
