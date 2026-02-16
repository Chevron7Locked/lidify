import { test, expect } from "@playwright/test";

const username = process.env.KIMA_TEST_USERNAME || "predeploy";
const password = process.env.KIMA_TEST_PASSWORD || "predeploy-password";

test("core smoke: login → play album → play/pause/next/prev", async ({ page }) => {
    // Login
    await page.goto("/login");
    await page.locator("#username").fill(username);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();

    // Login redirects to / (assuming onboarding was already completed by the API smoke test)
    await page.waitForURL(/\/($|\?)/);

    // Navigate to albums and open the first one
    await page.goto("/albums");
    await expect(page.getByRole("heading", { name: "All Albums" })).toBeVisible();

    const firstAlbum = page.locator('a[href^="/album/"]').first();
    const albumCount = await firstAlbum.count();
    expect(albumCount).toBeGreaterThan(0);
    await firstAlbum.click();

    // Start playback
    await page.getByLabel("Play all").click();

    // Mini player should reflect playing state
    const playPause = page.locator('button[title="Pause"], button[title="Play"]').first();
    await expect(playPause).toHaveAttribute("title", "Pause");

    // Toggle pause/play
    await playPause.click();
    await expect(playPause).toHaveAttribute("title", "Play");
    await playPause.click();
    await expect(playPause).toHaveAttribute("title", "Pause");

    // Next/Previous should be available for tracks (library content)
    const nextBtn = page.locator('button[title="Next"]');
    const prevBtn = page.locator('button[title="Previous"]');
    await expect(nextBtn).toBeVisible();
    await expect(prevBtn).toBeVisible();

    await nextBtn.click();
    await prevBtn.click();
});








