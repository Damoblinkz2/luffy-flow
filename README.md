# LuffyFlow

<img src="assets/icon.png" alt="LuffyFlow extension icon" width="96" height="96">

LuffyFlow is a Chromium Manifest V3 extension for preparing prompt queues, submitting them sequentially on supported AI websites, and organizing detected outputs with deterministic filenames and download history.

The project currently supports adapters for:

- Google Flow
- Google Gemini
- Grok, including the explicit X `/i/grok` route

LuffyFlow is at version `0.1.0`. It has a passing production build and automated validation pipeline, but it is not yet approved for public release. See [Production readiness](#production-readiness) and the [production checklist](docs/production-checklist.md).

## What it does

- Accepts manually entered prompts or local `.txt`, `.csv`, and `.json` prompt files.
- Treats `.txt` as one prompt per non-empty line.
- Lets users review, edit, select, remove, and reorder prompts before queueing them.
- Runs one queue at a time with explicit start, pause, resume, retry, skip, and stop controls.
- Persists queue state and uses worker leases to reduce duplicate submissions after Manifest V3 service-worker suspension.
- Detects text and media outputs through platform-specific adapters.
- Prevents duplicate output records with stable fingerprints.
- Generates safe sequence-based filenames and validates user renames.
- Downloads text as TXT, Markdown, JSON, or CSV and bundles multiple text outputs into ZIP files.
- Provides a popup, side panel, dashboard tab, options page, account/subscription placeholders, and adapter diagnostics.
- Includes a development mock API for authentication, plans, billing placeholders, and usage limits.

LuffyFlow does not bypass authentication, CAPTCHAs, rate limits, paywalls, or platform access controls. It automates only visible user-interface elements in a page the user can already access.

## Current status

| Area                                      | Status                                                             |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Strict TypeScript                         | Passing                                                            |
| ESLint and Prettier                       | Passing                                                            |
| Automated tests                           | 26 passing tests across 7 files                                    |
| Deterministic-core coverage               | 93.44% statements, 85.52% branches, 95.23% functions, 93.69% lines |
| Chrome MV3 production build               | Passing                                                            |
| Live authenticated adapter verification   | Pending                                                            |
| Least-privilege generated manifest review | Blocked; see below                                                 |
| Production backend and billing            | Not implemented; mock mode only by default                         |
| Chrome Web Store readiness                | Pending                                                            |

The generated manifest currently registers helper modules from Plasmo's reserved `src/contents` directory as `<all_urls>` content scripts. The declared host permissions remain platform-specific, but this generated content-script scope must be corrected and re-audited before public distribution.

## Requirements

- Node.js `20.19.0` or newer
- Corepack
- pnpm `10.34.5` through Corepack
- A Chromium-based browser with Manifest V3 support

The repository contains an exact pnpm lockfile. Do not replace it with npm or Yarn lockfiles.

## Installation

Install dependencies from the repository root:

```powershell
corepack pnpm install --frozen-lockfile
```

Create a local environment file if you need to override the safe development defaults:

```powershell
Copy-Item .env.example .env
```

Environment variables prefixed with `PLASMO_PUBLIC_` are embedded in extension bundles. Never place API secrets, signing keys, private billing credentials, or privileged backend tokens in them.

## Development

Start Plasmo's development build:

```powershell
corepack pnpm run dev
```

Load the generated development directory as an unpacked extension:

1. Open `chrome://extensions` or the equivalent browser extension page.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select `build/chrome-mv3-dev`.
5. Pin LuffyFlow if you want quick access to its popup.

Plasmo watches source changes and rebuilds the extension. Some background, content-script, manifest, and environment changes still require reloading the extension and affected platform tabs.

## Production build

Run the full release-grade validation pipeline:

```powershell
corepack pnpm run validate:release
```

This command performs:

1. Strict TypeScript checking.
2. Full-project ESLint.
3. The Vitest/JSDOM suite.
4. Prettier verification.
5. The enforced deterministic-core coverage gate.
6. A Chrome Manifest V3 production build.

The unpacked production build is written to `build/chrome-mv3-prod`.

To create Plasmo's distributable package after completing the production checklist:

```powershell
corepack pnpm run package
```

Do not publish a package solely because the automated command passes. Live platform verification, manifest review, privacy review, and store assets are separate release gates.

## Configuration

| Variable                              | Default                   | Purpose                                                           |
| ------------------------------------- | ------------------------- | ----------------------------------------------------------------- |
| `PLASMO_PUBLIC_API_BASE_URL`          | `https://api.example.com` | Fixed base URL for real HTTP mode. Remote origins must use HTTPS. |
| `PLASMO_PUBLIC_USE_MOCK_API`          | `true`                    | Uses the local development mock API when enabled.                 |
| `PLASMO_PUBLIC_APP_ENV`               | `development`             | Selects development, test, or production behavior.                |
| `PLASMO_PUBLIC_MOCK_API_LATENCY_MS`   | `500`                     | Adds bounded mock latency for realistic UI behavior.              |
| `PLASMO_PUBLIC_MOCK_API_FAILURE_RATE` | `0`                       | Simulates mock failures from `0` to `1`.                          |
| `PLASMO_PUBLIC_API_TIMEOUT_MS`        | `15000`                   | Default bounded API request timeout.                              |

For a production backend build:

- Set `PLASMO_PUBLIC_USE_MOCK_API=false`.
- Set `PLASMO_PUBLIC_APP_ENV=production`.
- Replace `https://api.example.com` with the real HTTPS API origin.
- Add the exact API origin to the production manifest permissions.
- Implement and validate the documented auth, billing, usage, and idempotency contracts.
- Rebuild after environment changes; changing the settings UI alone does not grant new host permissions or recreate the active service graph until reload.

## Using LuffyFlow

### 1. Sign in

Development mock mode seeds this account:

```text
Email: demo@luffyflow.local
Password: Demo123!
```

These credentials and mock tokens are development fixtures, not production authentication.

### 2. Open a supported page

Navigate to an authenticated supported route:

- `https://flow.google/` or the Google Labs Flow route
- `https://gemini.google.com/` or `/app/...`
- `https://grok.com/`
- `https://x.com/i/grok`

Open LuffyFlow's popup and use the side panel or dashboard workspace. Unsupported pages remain read-only and cannot start a queue.

### 3. Add prompts

Enter prompts manually or upload a local file:

- TXT: one prompt per non-empty line; BOM and CRLF are supported.
- CSV: the `prompt` or `text` column is preferred, otherwise the first column is used.
- JSON: accepts supported arrays or an object containing `prompts`.

Files are parsed locally. Uploading a file never starts automation automatically. Review and explicitly add selected prompts to the queue.

Limits:

- Maximum import size: 2 MiB
- Maximum imported prompts: 1,000
- Maximum prompt length: 100,000 characters

### 4. Run the queue

Choose **Start** only after confirming the target tab and prompt order. LuffyFlow processes prompts serially and defaults to an eight-second inter-prompt delay.

- Pause interrupts uncertain in-flight work and requires explicit review/retry.
- Resume reacquires a durable queue lease.
- Stop cancels unfinished prompts and prevents new submissions.
- A service-worker restart never blindly replays an uncertain prompt; the queue enters recovery pause where necessary.

### 5. Review and download outputs

Captured outputs receive names using the default pattern:

```text
{platform}-{date}-{sequence}-{promptSlug}
```

Sequence allocation is persistent and defaults to global per-user scope. Filenames are normalized across Chromium, Windows, macOS, and Linux. Duplicate names receive a deterministic numeric suffix.

Text outputs can be exported as TXT, Markdown, JSON, or CSV. Multiple text records can be bundled into a ZIP. Media downloads require an accessible platform-provided HTTP(S) URL.

## Extension surfaces

- **Popup:** account summary, active-platform detection, and quick navigation.
- **Side panel:** in-context queue workspace on supported browsers.
- **Dashboard:** overview, prompt history, outputs, subscription placeholder, settings, and account pages.
- **Options page:** authenticated settings surface.
- **In-page fallback:** closed Shadow DOM workspace for browsers without the side-panel API.

## Architecture

```mermaid
flowchart LR
  UI[Popup / Side panel / Dashboard / Options] -->|Validated messages| BG[MV3 background worker]
  BG --> QUEUE[Queue service and durable lease]
  BG --> DATA[(Chrome storage and IndexedDB)]
  BG -->|Tab messages| CONTENT[Content coordinator]
  CONTENT --> ADAPTER[Google Flow / Gemini / Grok adapter]
  ADAPTER --> PAGE[Visible authenticated platform UI]
  ADAPTER -->|Detected output| BG
  BG --> DOWNLOADS[Chromium downloads API]
  UI --> API[Mock or HTTPS API client]
```

Important boundaries:

- Zod schemas validate persisted data, API responses, imports, settings, and runtime messages.
- UI components depend on injected services and Zustand stores rather than browser implementations directly.
- The background worker is the authority for queue transitions, usage authorization, output capture, and downloads.
- Content code owns DOM interaction and platform adapter lifecycles.
- Platform-specific selectors are isolated from shared queue and persistence logic.
- IndexedDB stores prompts and outputs; small versioned namespaces store settings, sessions, mock API state, queue coordination, and sequence counters.

See [architecture.md](docs/architecture.md) for the detailed design and staged documents under `docs/` for implementation history.

## Permissions

| Permission  | Why LuffyFlow uses it                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| `storage`   | Sessions, settings, mock API data, durable queue state, and sequence counters. |
| `downloads` | User-requested output exports and media downloads.                             |
| `tabs`      | Active-tab detection and background-to-content coordination.                   |
| `sidePanel` | Preferred in-context workspace.                                                |
| `alarms`    | Worker-safe maintenance and recovery hints.                                    |

Declared host permissions cover only the documented Google Flow, Gemini, Grok, and X hosts. The example backend origin is optional. However, the generated content-script match scope currently includes `<all_urls>` for helper entry points; removing that generated scope is a production blocker.

Incognito mode is disabled.

## Security and privacy

- Prompt files are read locally and are not uploaded by the import service.
- Passwords are transient form/API request values. The mock API persists only a salted development verifier.
- Mock server sessions store token hashes; client session tokens remain local bearer credentials.
- Structured logs redact passwords, tokens, authorization headers, cookies, and prompt/output content when privacy mode is enabled.
- API requests use a validated fixed origin; non-local production traffic requires HTTPS.
- Downloads accept only validated local data URLs or accessible HTTP(S) media URLs.
- React renders output as text; the application does not inject platform HTML.
- Output filenames remove path separators, control characters, reserved device names, and unsafe trailing characters.
- Queue and record updates use revisions, leases, fingerprints, and idempotency keys to reduce conflicts and duplicate actions.
- The settings page can export local account/settings/prompt/output data and clear local data after confirmation.

Before production, publish a privacy policy that accurately describes host-page access, local storage, any backend transfer, retention, deletion, diagnostics, and third-party platform processing.

## Testing

Common commands:

```powershell
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm test
corepack pnpm run test:coverage
corepack pnpm run format:check
corepack pnpm run build
corepack pnpm run validate:release
```

The tests include browser API mocks and an integration-style workflow covering mock login, TXT import, queue execution, mock output capture, persistent sequence naming, and download completion.

Coverage percentages apply to deterministic, platform-independent invariants: filename/output naming, queue-state transitions, and versioned storage. They do not claim live Chromium or live AI-platform end-to-end coverage.

## Data and recovery behavior

- Only one non-terminal queue can own the durable queue slot.
- Record updates require expected revisions.
- Output fingerprints prevent repeated detection events from saving the same output twice.
- Uncertain in-flight prompts are failed and paused after worker recovery instead of replayed automatically.
- Download record status is persisted, but the mapping from Chromium download ID to output ID is in memory and can be lost during worker suspension.
- Media source URLs may expire with the platform session.

## Troubleshooting

### The active page is unsupported

Confirm the page uses HTTPS and matches an explicit supported route. Reload the platform tab after installing or reloading the extension. X routes other than `/i/grok` are intentionally rejected by the Grok adapter.

### The adapter says selectors are missing

Open Settings and review the adapter diagnostics. Platform DOM is undocumented and selectors are currently provisional. Selector overrides accept ordered CSS selector strings only; they cannot execute JavaScript. Do not add broad selectors that could target unrelated controls.

### The queue paused after a restart or navigation

Review the interrupted prompt and current platform state. Retry explicitly only when duplicate submission is safe. LuffyFlow intentionally favors pausing over replaying uncertain work.

### A download failed

For media, revisit the original platform page so its signed URL is current. Large text or ZIP exports use generated data URLs and may reach browser memory/URL limits. Retry from the output library after confirming storage and download permissions.

### Backend settings do not take effect

Reload the extension surface after changing backend/mock settings. A different remote origin also needs an exact manifest host permission and usually requires a rebuild.

### The production build fails during PostCSS loading

Keep the Parcel-compatible `.postcssrc.json` file. This Plasmo/Parcel toolchain must not be switched back to a CommonJS PostCSS file without verifying the bundler configuration parser.

## Known limitations

- Google Flow, Gemini, and Grok selectors have not been validated against authenticated live pages in this environment.
- The generated manifest currently includes unintended `<all_urls>` content-script entries for helper modules.
- Authentication, billing, subscription, invoices, and usage limits are development mocks by default.
- Automatic save/download settings are persisted but are not yet a complete unattended output pipeline.
- Browser download-ID tracking is in memory and can be lost when the background worker is suspended.
- Large text and ZIP exports use data URLs rather than a streaming/offscreen-document pipeline.
- Backend URL changes require a compatible manifest permission and service-graph reload.
- No live-platform end-to-end tests are included.
- The project is private and `UNLICENSED`; a production license decision is still required.

## Production readiness

Automated build quality is green, but public release remains blocked by:

1. Removing unintended `<all_urls>` content-script registration and re-auditing the built manifest.
2. Validating every platform adapter on authenticated live pages.
3. Reviewing each platform's terms and obtaining any required permission for automation.
4. Implementing and security-reviewing the production backend, authentication, billing, and usage enforcement—or removing those product claims.
5. Publishing privacy, support, retention, and account-deletion policies.
6. Completing accessibility, upgrade/migration, worker-suspension, and cross-browser smoke tests.
7. Choosing a license and preparing signed store artifacts and listing assets.

Use [docs/production-checklist.md](docs/production-checklist.md) as the release sign-off record.

## Repository guide

```text
assets/                         Extension icon source
docs/                           Architecture, stage notes, and release checklist
src/adapters/                   Platform contracts, selectors, and DOM automation
src/api/                        Typed API client, HTTP transport, and mock routes
src/background/                 Queue orchestration and MV3 worker runtime
src/components/                 Reusable React UI
src/contents/                   Plasmo content-script entries and current helpers
src/messaging/                  Validated extension message transport/router
src/schemas/                    Zod runtime schemas and inferred domain types
src/services/                   Auth, billing, queue, naming, output, and download logic
src/storage/                    Versioned Chrome storage and IndexedDB repositories
src/stores/                     Zustand UI state
tests/                          Unit, React, browser-mock, and integration-style tests
build/chrome-mv3-prod/          Generated production build
```

## License

`UNLICENSED`. No permission is granted to copy, redistribute, or publish this project until the owner selects and adds an explicit license.
