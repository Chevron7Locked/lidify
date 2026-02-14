/**
 * Tests for data cleanup cron job
 */

import { runDataCleanup } from "../dataCleanup";
import { prisma } from "../../utils/db";

jest.mock("../../utils/db", () => ({
    prisma: {
        downloadJob: {
            deleteMany: jest.fn(),
        },
        webhookEvent: {
            deleteMany: jest.fn(),
        },
        discoveryBatch: {
            deleteMany: jest.fn(),
        },
    },
}));

describe("Data Cleanup", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should clean up old download jobs", async () => {
        (prisma.downloadJob.deleteMany as jest.Mock).mockResolvedValue({
            count: 5,
        });
        (prisma.webhookEvent.deleteMany as jest.Mock).mockResolvedValue({
            count: 0,
        });
        (prisma.discoveryBatch.deleteMany as jest.Mock).mockResolvedValue({
            count: 0,
        });

        const result = await runDataCleanup();

        expect(result.downloadJobs).toBe(5);
        expect(result.total).toBe(5);
        expect(prisma.downloadJob.deleteMany).toHaveBeenCalledWith({
            where: {
                status: { in: ["completed", "failed"] },
                completedAt: {
                    lt: expect.any(Date),
                },
            },
        });
    });

    it("should clean up old webhook events", async () => {
        (prisma.downloadJob.deleteMany as jest.Mock).mockResolvedValue({
            count: 0,
        });
        (prisma.webhookEvent.deleteMany as jest.Mock).mockResolvedValue({
            count: 10,
        });
        (prisma.discoveryBatch.deleteMany as jest.Mock).mockResolvedValue({
            count: 0,
        });

        const result = await runDataCleanup();

        expect(result.webhookEvents).toBe(10);
        expect(result.total).toBe(10);
        expect(prisma.webhookEvent.deleteMany).toHaveBeenCalledWith({
            where: {
                processed: true,
                createdAt: {
                    lt: expect.any(Date),
                },
            },
        });
    });

    it("should clean up old discovery batches", async () => {
        (prisma.downloadJob.deleteMany as jest.Mock).mockResolvedValue({
            count: 0,
        });
        (prisma.webhookEvent.deleteMany as jest.Mock).mockResolvedValue({
            count: 0,
        });
        (prisma.discoveryBatch.deleteMany as jest.Mock).mockResolvedValue({
            count: 3,
        });

        const result = await runDataCleanup();

        expect(result.discoveryBatches).toBe(3);
        expect(result.total).toBe(3);
        expect(prisma.discoveryBatch.deleteMany).toHaveBeenCalledWith({
            where: {
                status: "completed",
                completedAt: {
                    lt: expect.any(Date),
                },
            },
        });
    });

    it("should clean up all types in one run", async () => {
        (prisma.downloadJob.deleteMany as jest.Mock).mockResolvedValue({
            count: 15,
        });
        (prisma.webhookEvent.deleteMany as jest.Mock).mockResolvedValue({
            count: 42,
        });
        (prisma.discoveryBatch.deleteMany as jest.Mock).mockResolvedValue({
            count: 2,
        });

        const result = await runDataCleanup();

        expect(result.downloadJobs).toBe(15);
        expect(result.webhookEvents).toBe(42);
        expect(result.discoveryBatches).toBe(2);
        expect(result.total).toBe(59);
    });

    it("should use correct retention periods", async () => {
        (prisma.downloadJob.deleteMany as jest.Mock).mockResolvedValue({
            count: 0,
        });
        (prisma.webhookEvent.deleteMany as jest.Mock).mockResolvedValue({
            count: 0,
        });
        (prisma.discoveryBatch.deleteMany as jest.Mock).mockResolvedValue({
            count: 0,
        });

        await runDataCleanup();

        const now = new Date();
        const downloadJobsCutoff = (
            prisma.downloadJob.deleteMany as jest.Mock
        ).mock.calls[0][0].where.completedAt.lt as Date;
        const webhookEventsCutoff = (
            prisma.webhookEvent.deleteMany as jest.Mock
        ).mock.calls[0][0].where.createdAt.lt as Date;
        const discoveryBatchesCutoff = (
            prisma.discoveryBatch.deleteMany as jest.Mock
        ).mock.calls[0][0].where.completedAt.lt as Date;

        const daysDiffDownloadJobs = Math.round(
            (now.getTime() - downloadJobsCutoff.getTime()) /
                (1000 * 60 * 60 * 24)
        );
        const daysDiffWebhookEvents = Math.round(
            (now.getTime() - webhookEventsCutoff.getTime()) /
                (1000 * 60 * 60 * 24)
        );
        const daysDiffDiscoveryBatches = Math.round(
            (now.getTime() - discoveryBatchesCutoff.getTime()) /
                (1000 * 60 * 60 * 24)
        );

        expect(daysDiffDownloadJobs).toBe(30);
        expect(daysDiffWebhookEvents).toBe(30);
        expect(daysDiffDiscoveryBatches).toBe(60);
    });
});
