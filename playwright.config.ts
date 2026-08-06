import { defineConfig } from "@playwright/test"

/**
 * Browser smoke tests use Playwright's isolated Chrome for Testing build so
 * unpacked-extension flags never touch or depend on the user's normal profile.
 */
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
})
