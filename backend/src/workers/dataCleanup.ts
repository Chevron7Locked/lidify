/**
 * Data Cleanup Cron Scheduler
 *
 * Periodically removes old completed download jobs, webhook events, and discovery batches
 * to prevent database bloat and maintain optimal performance.
 *
 * Schedule: Daily at 2 AM
 * Retention:
 *   - Download jobs (completed/failed): 30 days
 *   - Webhook events (processed): 30 days
 *   - Discovery batches (completed): 60 days
 */

import { logger } from "../utils/logger";
import cron, { ScheduledTask } from "node-cron";
import { prisma } from "../utils/db";

let cronTask: ScheduledTask | null = null;

const RETENTION_DAYS = {
    downloadJobs: 30,
    webhookEvents: 30,
    discoveryBatches: 60,
};

async function cleanupDownloadJobs(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS.downloadJobs);

    const result = await prisma.downloadJob.deleteMany({
        where: {
            status: { in: ["completed", "failed"] },
            completedAt: {
                lt: cutoffDate,
            },
        },
    });

    return result.count;
}

async function cleanupWebhookEvents(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS.webhookEvents);

    const result = await prisma.webhookEvent.deleteMany({
        where: {
            processed: true,
            createdAt: {
                lt: cutoffDate,
            },
        },
    });

    return result.count;
}

async function cleanupDiscoveryBatches(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS.discoveryBatches);

    const result = await prisma.discoveryBatch.deleteMany({
        where: {
            status: "completed",
            completedAt: {
                lt: cutoffDate,
            },
        },
    });

    return result.count;
}

export function startDataCleanupCron() {
    // Run daily at 2 AM
    // Cron format: minute hour day-of-month month day-of-week
    // "0 2 * * *" = At 02:00 every day
    const schedule = "0 2 * * *";

    logger.debug(
        `Scheduling data cleanup to run: ${schedule} (daily at 2 AM)`
    );

    cronTask = cron.schedule(schedule, async () => {
        logger.debug(`\n === Data Cleanup Cron Triggered ===`);
        logger.debug(`   Time: ${new Date().toLocaleString()}`);

        try {
            const jobsDeleted = await cleanupDownloadJobs();
            logger.debug(
                `   Cleaned up ${jobsDeleted} old download job(s) (>${RETENTION_DAYS.downloadJobs} days)`
            );

            const eventsDeleted = await cleanupWebhookEvents();
            logger.debug(
                `   Cleaned up ${eventsDeleted} old webhook event(s) (>${RETENTION_DAYS.webhookEvents} days)`
            );

            const batchesDeleted = await cleanupDiscoveryBatches();
            logger.debug(
                `   Cleaned up ${batchesDeleted} old discovery batch(es) (>${RETENTION_DAYS.discoveryBatches} days)`
            );

            const totalDeleted = jobsDeleted + eventsDeleted + batchesDeleted;
            if (totalDeleted > 0) {
                logger.debug(
                    `   Total records cleaned: ${totalDeleted}`
                );
            } else {
                logger.debug(`   No old records to clean up`);
            }
        } catch (error) {
            logger.error(` Data cleanup cron error:`, error);
        }
    });

    logger.debug("Data cleanup cron scheduler started");
}

export function stopDataCleanupCron() {
    if (cronTask) {
        cronTask.stop();
        cronTask = null;
        logger.debug("Data cleanup cron scheduler stopped");
    }
}

/**
 * Manual trigger for testing or on-demand cleanup
 * Returns total number of records deleted
 */
export async function runDataCleanup(): Promise<{
    downloadJobs: number;
    webhookEvents: number;
    discoveryBatches: number;
    total: number;
}> {
    const jobsDeleted = await cleanupDownloadJobs();
    const eventsDeleted = await cleanupWebhookEvents();
    const batchesDeleted = await cleanupDiscoveryBatches();

    return {
        downloadJobs: jobsDeleted,
        webhookEvents: eventsDeleted,
        discoveryBatches: batchesDeleted,
        total: jobsDeleted + eventsDeleted + batchesDeleted,
    };
}
