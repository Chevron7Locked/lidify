/**
 * Manual test script for data cleanup functionality
 * Run with: npx ts-node src/scripts/testDataCleanup.ts
 */

import { runDataCleanup } from "../workers/dataCleanup";
import { logger } from "../utils/logger";
import { prisma } from "../utils/db";

async function main() {
    logger.debug("Starting data cleanup test...");
    logger.debug("Current time:", new Date().toLocaleString());

    try {
        // Show current counts before cleanup
        const beforeCounts = {
            downloadJobs: await prisma.downloadJob.count({
                where: {
                    status: { in: ["completed", "failed"] },
                },
            }),
            webhookEvents: await prisma.webhookEvent.count({
                where: {
                    processed: true,
                },
            }),
            discoveryBatches: await prisma.discoveryBatch.count({
                where: {
                    status: "completed",
                },
            }),
        };

        logger.debug("\nBefore cleanup:");
        logger.debug(`  Download jobs (completed/failed): ${beforeCounts.downloadJobs}`);
        logger.debug(`  Webhook events (processed): ${beforeCounts.webhookEvents}`);
        logger.debug(`  Discovery batches (completed): ${beforeCounts.discoveryBatches}`);

        // Run cleanup
        logger.debug("\nRunning cleanup...");
        const result = await runDataCleanup();

        logger.debug("\nCleanup results:");
        logger.debug(`  Download jobs deleted: ${result.downloadJobs}`);
        logger.debug(`  Webhook events deleted: ${result.webhookEvents}`);
        logger.debug(`  Discovery batches deleted: ${result.discoveryBatches}`);
        logger.debug(`  Total records deleted: ${result.total}`);

        // Show counts after cleanup
        const afterCounts = {
            downloadJobs: await prisma.downloadJob.count({
                where: {
                    status: { in: ["completed", "failed"] },
                },
            }),
            webhookEvents: await prisma.webhookEvent.count({
                where: {
                    processed: true,
                },
            }),
            discoveryBatches: await prisma.discoveryBatch.count({
                where: {
                    status: "completed",
                },
            }),
        };

        logger.debug("\nAfter cleanup:");
        logger.debug(`  Download jobs (completed/failed): ${afterCounts.downloadJobs}`);
        logger.debug(`  Webhook events (processed): ${afterCounts.webhookEvents}`);
        logger.debug(`  Discovery batches (completed): ${afterCounts.discoveryBatches}`);

        logger.debug("\nData cleanup test completed successfully!");
    } catch (error) {
        logger.error("Data cleanup test failed:", error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
