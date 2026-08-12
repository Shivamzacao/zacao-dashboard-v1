import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/presentation/browser",
  testMatch: "f1-shell.spec.ts",
  outputDir: "test-results/f1",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "ZACAO_DATA_MODE=fixture corepack pnpm@11.9.0 dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/executive",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
    },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } },
    },
  ],
});
