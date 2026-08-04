# Stage 7: User interfaces

Stage 7 implements AutoFlow's popup, side panel, routed dashboard, options page, prompt history,
output library, settings, account page, rename dialog, download actions, and reusable empty/error/
loading states. Stage 8 tests have not started.

## Extension surfaces

- `src/popup.tsx` shows authentication, mock plan and usage, active-tab support, current-session
  prompt/output counts, workspace access, logout, and dashboard/history/output/settings shortcuts.
- `src/sidepanel.tsx` hosts the authenticated platform workspace. The manifest explicitly registers
  `sidepanel.html` as the default Chromium side panel.
- `src/tabs/dashboard.tsx` uses extension-safe hash routing for Overview, Prompt history, Output
  library, Subscription, Settings, Account, Login, and Sign-up.
- `src/options.tsx` reuses the validated settings surface behind authentication.
- Browsers without `chrome.sidePanel` can mount `InPagePanelFallback` in a closed Shadow DOM. The
  content entry loads the fallback only when that API namespace is unavailable. Chrome documents
  Side Panel support for MV3 from Chrome 114 onward.

Every document uses the same service-provider pattern, strict auth restoration, theme application,
accessible feedback components, focus-visible styling, reduced-motion rules, and a major-surface
error boundary. Popup closure never owns or stops a queue.

## Prompt composition and TXT upload

`PromptComposer` provides both a multiline editor and a native file picker/drag target. It accepts
`.txt`, `.csv`, and `.json` and passes the browser `File` directly to the Stage 5 local
`PromptImportService`.

TXT upload is first-class:

1. The user chooses or drops a `.txt` file.
2. AutoFlow checks the 2 MiB limit and parses one prompt per non-empty line locally.
3. Imported drafts are displayed with source row and filename.
4. The user can edit, select, reorder, or remove each draft.
5. Only an explicit **Add selected to queue** action sends validated text to the background.
6. Importing never starts automation automatically.

Manual multiline text uses the same review path. CSV and JSON imports expose row-level warnings,
and valid records remain reviewable when other rows fail.

## Queue workspace

Dashboard, side panel, and in-page fallback reuse `AutomationWorkspace`. UI mutation commands go
through the runtime-validated background router; React does not own the queue timer or lease.

The workspace includes:

- Active supported-tab status.
- Safe prompt-delay and output-naming defaults.
- Queue creation and prompt addition.
- Inline prompt editing, confirmed removal, and reordering.
- Start, pause, resume, and stop controls.
- Durable queue progress and per-prompt status/errors.
- Retry and skip actions where the background state machine permits them.
- Latest session output cards.

SPA route changes and popup/side-panel closure retain the Stage 5 background/content safety model.
The in-page fallback avoids a second content message listener and refreshes storage-backed queue
state at low frequency instead.

## Output library and downloads

The output library provides search, platform/type/date filters, sorting, pagination, selection,
rename, confirmed deletion, metadata export, individual downloads, and selected downloads.

`DownloadService` runs in the background and:

- Revalidates authenticated record ownership.
- Renders TXT, Markdown, JSON, or CSV text exports.
- Produces a local ZIP when multiple text outputs are selected.
- Accepts media only from accessible HTTP(S) URLs.
- Uses sanitized stored filenames.
- Tracks browser download completion/interruption while the worker instance remains alive.
- Persists downloading/completed/failed states and recoverable messages.

It does not fetch protected content, refresh signed URLs, bypass CORS, or circumvent platform access.
Prompt history supports search, platform/status/date filters, sorting, paging, bulk selection,
confirmed deletion, retry, and JSON/CSV export.

## Settings, account, and diagnostics

The React Hook Form/Zod settings screen includes all requested defaults, naming tokens, sequence
scope/padding, automatic-save/download preferences, theme, mock mode, backend URL, logging/privacy,
adapter enable/timeouts, and advanced selector overrides.

Selector overrides are runtime-schema validated, limited to known selector groups, converted only
to CSS fallback candidates, and labeled `UNVERIFIED USER OVERRIDE`. They are loaded by content
scripts after the platform tab reloads. No override is executable code.

Live diagnostics ask the active tab adapter for selector-group presence and fallback index. They do
not return selector values, DOM text, prompts, outputs, URL query strings, or hashes.

The settings page also exports the authenticated user's local records/settings and provides a
confirmed clear-data action. Clearing is refused while a queue is active and closes IndexedDB before
deletion. The account page identifies mock authentication honestly, supports logout, and keeps
remote account deletion as a non-destructive placeholder.

## Important files added

- `src/popup.tsx`
- `src/sidepanel.tsx`
- `src/options.tsx`
- `src/tabs/dashboard.tsx`
- `src/styles/base.css`
- `src/components/common/*`
- `src/components/automation/*`
- `src/components/layout/*`
- `src/components/prompts/PromptComposer.tsx`
- `src/components/prompts/PromptQueue.tsx`
- `src/components/prompts/PromptHistory.tsx`
- `src/components/outputs/OutputCard.tsx`
- `src/components/outputs/OutputLibrary.tsx`
- `src/components/outputs/RenameDialog.tsx`
- `src/components/settings/SettingsPage.tsx`
- `src/components/settings/AdapterDiagnosticsCard.tsx`
- `src/hooks/useActivePlatform.ts`
- `src/hooks/useQueueWorkspace.ts`
- `src/services/downloads/DownloadService.ts`
- `src/sidepanel/mount-in-page-fallback.tsx`

Stage 7 also extends typed messaging with the isolated `in_page_panel` source, adds safe platform
status forwarding, applies stored selector overrides, and wires background download handlers.

## Validation and known limitations

- Node's TypeScript parser accepts every non-JSX TypeScript module.
- Every local TypeScript/TSX import resolves.
- Static scans reject `eval`, raw HTML injection, broad wildcard hosts, and password persistence.
- `package.json` remains valid JSON and selector overrides remain non-executable CSS strings.
- Full `tsc`, ESLint, Prettier, Vitest, React Testing Library, Tailwind, and Plasmo build verification
  remains unavailable because `node_modules` is absent and registry access is unavailable.
- Stage 8 will add browser mocks and automated UI/integration tests; this stage does not claim them.
- Authenticated live platform selectors remain unverified. Diagnostics may show missing groups until
  maintained selectors are confirmed for the user's locale and account variant.
- MV3 worker suspension can lose the in-memory browser-download-ID mapping. The browser download
  continues, but a record may remain `downloading` until recovery support is expanded.
- Large text/ZIP downloads currently use background-generated data URLs. Very large exports may hit
  browser URL limits and will need an offscreen-document/blob streaming strategy.
- `autoDownloadOutputs` and `autoSaveOutputs` are persisted configuration controls; automatic
  post-capture policy is not activated in Stage 7. Existing capture behavior and manual downloads
  work independently of these two preferences.
- Backend URL/mock-mode changes take effect when a new service graph is created after reload and
  still require matching optional host permission for a real backend.
