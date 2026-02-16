import { defineConfig } from "@playwright/test";

const baseURL = process.env.KIMA_UI_BASE_URL || "http://127.0.0.1:3030";

export default defineConfig({
    testDir: "./tests/e2e",
    timeout: 60_000,
    expect: { timeout: 15_000 },
    retries: process.env.CI ? 2 : 0,
    use: {
        baseURL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    reporter: [["list"], ["html", { open: "never" }]],
    webServer: process.env.KIMA_E2E_START_WEB
        ? {
              command: "npm run dev",
              url: baseURL,
              reuseExistingServer: true,
              timeout: 120_000,
          }
        : undefined,
});








