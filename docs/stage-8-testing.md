# Stage 8: Testing

Stage 8 adds a deterministic Vitest/JSDOM test harness for AutoFlow. The suite does not connect to or automate live Google Flow, Gemini, or Grok pages. Platform selectors remain provisional until they are verified manually against the live, permitted user interface.

## Commands

```sh
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm validate
pnpm validate:release
```

`pnpm test:coverage` enforces the project thresholds configured in `vitest.config.ts`: 80% for branches, functions, lines, and statements. The percentage gate is scoped to deterministic, platform-independent invariants: filename/output naming, queue state transitions, and versioned storage. React entry points and live-page coordinators remain covered by behavior tests and the manual Chromium checklist rather than being counted as JSDOM end-to-end coverage. `pnpm validate` runs TypeScript, ESLint, tests, and Prettier checks. `pnpm validate:release` adds the coverage gate and production Chrome MV3 build.

The current automated baseline contains 26 passing tests. The deterministic coverage gate reports 93.44% statements, 85.52% branches, 95.23% functions, and 93.69% lines.

## Test layout

- `tests/setup.ts` installs jest-dom matchers, Web Crypto, an isolated Chromium API mock, and DOM cleanup.
- `tests/helpers/chrome-mock.ts` mocks runtime, storage, tabs, alarms, side-panel, and downloads APIs. Download events can be emitted explicitly.
- `tests/helpers/memory.ts` supplies deterministic key-value, prompt, and output repositories for service tests.
- `tests/unit` covers auth state, mock authentication, API failures/retries, Zod schemas, message validation, TXT imports, queue transitions, pause/resume, retry limits, repository revisions/migrations, sequence persistence, filename sanitization, duplicate/rename behavior, supported URLs, adapter DOM helpers, React login UI, and browser download naming/status.
- `tests/integration/automation-workflow.test.ts` exercises the required workflow: mock login, local TXT prompt import, queue creation/start, mock adapter output, output persistence, sequence-based naming, and a mocked Chromium download that reaches completion.

## Browser mock guidance

Every test receives a fresh `chrome` object. Inspect `chromeControls().downloadRequests` to assert download options, use `emitDownloadChanged` to simulate completion/interruption, and use `storedValues` when a test must examine raw extension storage. Add only the smallest API surface required by production code; unsupported browser behavior should fail visibly instead of silently succeeding.

## Boundaries

These are unit and integration-style tests running in JSDOM. They verify extension-owned logic and adapter utilities, not live-platform end-to-end compatibility. Before release, load the unpacked build in a dedicated Chromium profile and follow the manual verification checklist for authentication, permissions, supported URL detection, platform adapter readiness, pause/stop safety, output capture, and downloads.
