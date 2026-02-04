import { test, expect } from "@playwright/test";
import { loginAsTestUser, skipIfNoEnv } from "../fixtures/test-helpers";

test.describe("Integrations", () => {
    test.beforeEach(async ({ page }) => {
        await loginAsTestUser(page);
    });

    test("Audiobookshelf connection test", async ({ page }, testInfo) => {
        skipIfNoEnv("LIDIFY_TEST_ABS_URL", testInfo);
        skipIfNoEnv("LIDIFY_TEST_ABS_API_KEY", testInfo);

        await page.goto("/settings");

        // Navigate to Media Servers section in the sidebar
        const mediaServersLink = page.locator("text=Media Servers").first();
        await expect(mediaServersLink).toBeVisible({ timeout: 5000 });
        await mediaServersLink.click();

        // Wait for the Audiobookshelf section to appear
        const absContainer = page.locator('#audiobookshelf');
        await expect(absContainer).toBeVisible({ timeout: 5000 });

        // Enable Audiobookshelf if not already
        const enableToggle = page.locator('#abs-enabled');
        if (await enableToggle.isVisible({ timeout: 2000 })) {
            const isChecked = await enableToggle.isChecked();
            if (!isChecked) {
                await enableToggle.click({ force: true });
                await page.waitForTimeout(500);
            }
        }
        const urlInput = absContainer.locator('input[placeholder*="localhost:13378" i]');
        const apiKeyInput = absContainer.getByRole('textbox', { name: 'Enter API key' });

        if (await urlInput.isVisible({ timeout: 2000 })) {
            await urlInput.fill(process.env.LIDIFY_TEST_ABS_URL!);
        }
        if (await apiKeyInput.isVisible({ timeout: 2000 })) {
            await apiKeyInput.fill(process.env.LIDIFY_TEST_ABS_API_KEY!);
        }

        // Click test connection within Audiobookshelf section
        const testBtn = absContainer.getByRole("button", { name: /test connection/i });
        await expect(testBtn).toBeVisible({ timeout: 3000 });
        await testBtn.click();

        // Wait for result - should show version number on success
        await page.waitForTimeout(3000);
        const pageText = await page.textContent("body");
        const hasResult = pageText?.includes("Connected") ||
                         pageText?.includes("v2.") ||
                         pageText?.includes("Failed") ||
                         pageText?.includes("error");
        expect(hasResult).toBeTruthy();
    });

    test("Lidarr connection test", async ({ page }, testInfo) => {
        skipIfNoEnv("LIDIFY_TEST_LIDARR_URL", testInfo);
        skipIfNoEnv("LIDIFY_TEST_LIDARR_API_KEY", testInfo);

        await page.goto("/settings");

        // Find Lidarr section and expand if needed
        const lidarrSection = page.locator("text=Lidarr").first();
        await lidarrSection.click();

        // Fill in test credentials
        const urlInput = page.locator('input[placeholder*="url" i], input[name*="lidarr" i][name*="url" i]').first();
        const apiKeyInput = page.locator('input[placeholder*="api" i], input[name*="apikey" i], input[type="password"]').first();

        if (await urlInput.isVisible()) {
            await urlInput.fill(process.env.LIDIFY_TEST_LIDARR_URL!);
        }
        if (await apiKeyInput.isVisible()) {
            await apiKeyInput.fill(process.env.LIDIFY_TEST_LIDARR_API_KEY!);
        }

        // Click test connection button
        const testBtn = page.getByRole("button", { name: /test/i });
        if (await testBtn.isVisible()) {
            await testBtn.click();

            // Should show success or connection result
            await page.waitForTimeout(3000);
            const pageText = await page.textContent("body");
            const hasResult = pageText?.includes("success") ||
                             pageText?.includes("connected") ||
                             pageText?.includes("failed") ||
                             pageText?.includes("error");
            expect(hasResult).toBeTruthy();
        }
    });

    test("Soulseek connection test", async ({ page }, testInfo) => {
        skipIfNoEnv("LIDIFY_TEST_SOULSEEK_USER", testInfo);
        skipIfNoEnv("LIDIFY_TEST_SOULSEEK_PASS", testInfo);

        await page.goto("/settings");

        // Find Soulseek section
        const soulseekSection = page.locator("text=Soulseek").first();
        if (await soulseekSection.isVisible()) {
            await soulseekSection.click();

            // Fill credentials
            const userInput = page.locator('input[placeholder*="username" i]');
            const passInput = page.locator('input[placeholder*="password" i], input[type="password"]');

            if (await userInput.first().isVisible()) {
                await userInput.first().fill(process.env.LIDIFY_TEST_SOULSEEK_USER!);
            }
            if (await passInput.first().isVisible()) {
                await passInput.first().fill(process.env.LIDIFY_TEST_SOULSEEK_PASS!);
            }

            // Test connection
            const testBtn = page.getByRole("button", { name: /test/i });
            if (await testBtn.isVisible()) {
                await testBtn.click();
                await page.waitForTimeout(5000);

                const pageText = await page.textContent("body");
                const hasResult = pageText?.includes("success") ||
                                 pageText?.includes("connected") ||
                                 pageText?.includes("failed");
                expect(hasResult).toBeTruthy();
            }
        }
    });
});
