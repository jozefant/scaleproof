import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the E2E coverage gate.
 *
 * Differences from `playwright.config.ts`:
 * - the web server is `scripts/coverage-server.mjs`, which runs Next.js in
 *   process so `NODE_V8_COVERAGE` observes the server route handlers;
 * - `E2E_COVERAGE=1` turns on the browser-side V8 collection fixture;
 * - `reuseExistingServer` is off so every run owns a clean profile set.
 *
 * Vitest never participates: this config only drives Playwright.
 */

const coverageDir = process.env.E2E_COVERAGE_DIR ?? path.join(process.cwd(), ".coverage");
const port = Number(process.env.COVERAGE_PORT ?? 3101);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "off",
  },
  webServer: {
    command: `node ./scripts/coverage-server.mjs`,
    url: `http://127.0.0.1:${port}`,
    // Same determinism contract as playwright.config.ts: never let an ambient
    // developer credential turn the mandatory-synthesis gate into a live,
    // billable model call.
    env: {
      OPENAI_API_KEY: "",
      PLAYWRIGHT_TEST: "1",
      COVERAGE_PORT: String(port),
      NODE_V8_COVERAGE: path.join(coverageDir, "server"),
    },
    reuseExistingServer: false,
    timeout: 180_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
