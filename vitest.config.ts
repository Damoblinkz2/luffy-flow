import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

/**
 * Unit and integration tests run in JSDOM because React surfaces and adapter
 * utilities need browser-like DOM APIs. Chromium extension APIs remain explicit
 * test doubles so tests cannot accidentally depend on a developer's browser.
 */
export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    environmentOptions: {
      jsdom: {
        url: "https://luffyflow.test/",
      },
    },
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    pool: "threads",
    // A single worker avoids sporadic Windows worker-start timeouts while keeping
    // isolated test files deterministic across local and CI environments.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    passWithNoTests: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      // The enforced percentage covers deterministic, platform-independent
      // invariants. React entry points and live-page coordinators are exercised
      // by integration/manual checks without pretending JSDOM is Chromium E2E.
      include: [
        "src/services/naming/filename.ts",
        "src/services/naming/OutputNamingService.ts",
        "src/services/queue/QueueStateMachine.ts",
        "src/storage/VersionedStorageNamespace.ts",
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
})
