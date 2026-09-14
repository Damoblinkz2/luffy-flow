# Stage 6: Initial platform adapters

Stage 6 implements the first Google Flow, Google Gemini, and Grok adapters behind the Stage 5
contract. It also boots the content-script composition root and provides a privacy-safe selector
diagnostic panel. Stage 7 UI work has not started.

## Selector confidence and support policy

The authenticated application DOMs are private, dynamic, and not documented by the platform
owners. Consequently, **no Stage 6 DOM selector is claimed as verified**. Every selector candidate
is marked `provisional` or `fallback`, and every maintenance note begins with `UNVERIFIED` plus the
review date. Generated class names are intentionally avoided.

Official public endpoints were checked on 2026-09-14:

- Google Flow: <https://flow.google/> redirects to <https://flow.google.com/>.
- Gemini web app: <https://gemini.google.com/app>.
- Standalone Grok: <https://grok.com/>; X also documents Grok access through its web navigation.

URL checks require HTTPS, exact official hosts, and explicit application paths where applicable.
Lookalike domains are rejected. The content script has narrow match patterns; X injection is limited
to `/i/grok` even though Chromium origin permissions are host-scoped.

## Adapter behavior

`ObservedPlatformAdapter` centralizes behavior without containing platform selectors:

1. Re-query the current DOM for each operation.
2. Detect authentication, rate-limit, service-unavailable, busy, and ready states.
3. Set native or contenteditable prompt values through visible controls only.
4. Snapshot existing output identities before clicking the visible submit control.
5. Observe generation start and completion with `MutationObserver`, a one-second fallback, explicit
   timeouts, DOM quiet-window capture, and linked `AbortSignal` cleanup.
6. Reject unsupported navigation and return typed adapter errors.
7. Extract text for Gemini/Grok and accessible HTTP(S) media metadata for Flow.

The implementation does not fetch protected media, refresh signed URLs, call private APIs, bypass
authentication, solve challenges, or work around platform limits. Rate-limit and outage signals
fail safely so the queue can pause.

## Selector diagnostics

`collectSelectorDebugSnapshot` reports the current adapter, version, health, candidate-group match
state, and fallback index. It deliberately removes URL query/hash data and never includes DOM text,
prompt text, or output content. `SelectorDebugPanel` renders the same snapshot with a manual refresh
button and an explicit provisional-selector warning. It is ready to be mounted in the Stage 7
options/developer surface.

## Composition and lifecycle

`src/contents/platform-automation.ts` registers all three adapters, the typed content message
router, the background client, and SPA URL observation. Route changes abort uncertain active work;
query-only URL updates do not. `pagehide` tears down observers, listeners, handlers, and adapters.

## Files added in Stage 6

- `src/adapters/shared/ObservedPlatformAdapter.ts`
- `src/adapters/shared/output-extraction.ts`
- `src/adapters/google-flow/GoogleFlowAdapter.ts`
- `src/adapters/google-flow/selectors.ts`
- `src/adapters/gemini/GeminiAdapter.ts`
- `src/adapters/gemini/selectors.ts`
- `src/adapters/grok/GrokAdapter.ts`
- `src/adapters/grok/selectors.ts`
- `src/adapters/create-default-registry.ts`
- `src/adapters/debug/selector-diagnostics.ts`
- `src/adapters/debug/SelectorDebugPanel.tsx`
- `src/contents/platform-automation.ts`

Stage 6 also extends the selector contract and shared DOM queries, wires navigation cancellation, and
adds the Flow alias/current official hosts to the manifest permission plan.

## Validation and known limitations

- Node's TypeScript parser accepts every non-JSX TypeScript module.
- All local TypeScript/TSX imports resolve.
- Static scans find no `eval`, raw HTML injection, `<all_urls>`, wildcard-domain match, or selector
  candidate claiming verified confidence.
- Full `tsc`, ESLint, Prettier, Vitest, and Plasmo build verification remains unavailable because
  `node_modules` is absent and dependency registry access is unavailable in this workspace.
- Authenticated live pages were not available for DOM validation. The diagnostic panel must be used
  to promote selectors only after manual validation on each supported surface and locale.
- Conservative route-change cancellation can require restarting a queue item when a platform
  changes its conversation pathname immediately after first submission. This avoids capturing an
  unrelated conversation after user navigation.
- Flow extraction intentionally ignores broad page images and videos; it may return no output until
  a generated-media container selector is confirmed.

The `.txt` prompt parser delivered in Stage 5 remains intact and first-class. Its visible upload,
preview, and editing controls belong to Stage 7, so they are intentionally not added here.
