import * as fs from "fs";
import * as path from "path";

describe("SoulseekService - Redis Migration", () => {
    describe("Search Session Methods", () => {
        it("should have saveSearchSession method", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            expect(content).toContain("async saveSearchSession(sessionId: string, data: any, ttlSeconds: number = 300)");
            expect(content).toContain("soulseek:search:");
            expect(content).toContain("redisClient.setEx");
        });

        it("should have getSearchSession method", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            expect(content).toContain("async getSearchSession(sessionId: string)");
            expect(content).toContain("redisClient.get");
        });

        it("should have deleteSearchSession method", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            expect(content).toContain("async deleteSearchSession(sessionId: string)");
            expect(content).toContain("redisClient.del");
        });

        it("should have listSearchSessions method", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            expect(content).toContain("async listSearchSessions()");
            expect(content).toContain("redisClient.keys");
        });

        it("should have extendSearchSessionTTL method", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            expect(content).toContain("async extendSearchSessionTTL(sessionId: string, ttlSeconds: number = 300)");
            expect(content).toContain("redisClient.expire");
        });

        it("should use default TTL of 300 seconds for search sessions", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            const saveSessionPattern = /saveSearchSession\(sessionId: string, data: any, ttlSeconds: number = 300\)/;
            expect(content).toMatch(saveSessionPattern);
        });
    });

    describe("Failed User Blocklist Methods", () => {
        it("should have markUserFailed method", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            expect(content).toContain("async markUserFailed(username: string)");
            expect(content).toContain("soulseek:failed-user:");
            expect(content).toContain("FAILED_USER_TTL");
        });

        it("should have isUserBlocked method that uses Redis", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            expect(content).toContain("async isUserBlocked(username: string)");
            expect(content).toContain("redisClient.get");
            expect(content).toContain("FAILURE_THRESHOLD");
        });

        it("should have clearUserFailures method", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            expect(content).toContain("async clearUserFailures(username: string)");
        });

        it("should have getBlockedUsers method", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            expect(content).toContain("async getBlockedUsers()");
            expect(content).toContain("soulseek:failed-user:");
        });

        it("should have 24-hour TTL constant for failed users", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            expect(content).toContain("FAILED_USER_TTL = 86400");
        });

        it("should not have in-memory failedUsers Map", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            const failedUsersMapPattern = /private failedUsers = new Map/;
            expect(content).not.toMatch(failedUsersMapPattern);
        });

        it("should not have cleanupFailedUsers method", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            expect(content).not.toContain("cleanupFailedUsers()");
        });
    });

    describe("Integration Points", () => {
        it("should import redisClient", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            expect(content).toContain('import { redisClient } from "../utils/redis"');
        });

        it("should update recordUserFailure to use Redis", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            expect(content).toContain("async recordUserFailure");
            expect(content).toContain("await this.markUserFailed(username)");
        });

        it("should update rankAllResults to await isUserBlocked", () => {
            const servicePath = path.join(__dirname, "../soulseek.ts");
            const content = fs.readFileSync(servicePath, "utf-8");

            const asyncRankPattern = /private async rankAllResults/;
            expect(content).toMatch(asyncRankPattern);
            expect(content).toContain("await this.isUserBlocked");
        });
    });
});
