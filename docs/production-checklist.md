# AutoFlow production checklist

This checklist is the release sign-off record for AutoFlow. A checked automated item is not a substitute for the unchecked manual, security, legal, privacy, or platform-compatibility gates.

**Current version:** `0.1.0`  
**Checklist updated:** 2026-08-04  
**Current disposition:** **Not approved for public production release**

## 1. Release identity and ownership

- [ ] Confirm the release owner and final approvers.
- [ ] Replace the `UNLICENSED` placeholder with the intended license or retain private distribution with documented authorization.
- [ ] Confirm the package name, display name, version, description, and icon are final.
- [ ] Update the version consistently in `package.json`, generated manifest, backend compatibility policy, and release notes.
- [ ] Confirm AutoFlow naming and artwork do not infringe third-party trademarks.
- [ ] Record the source commit/tag used for the release.
- [ ] Record dependency-lockfile integrity and archive the signed build provenance.

## 2. Automated quality gates

Run from a clean checkout with the committed lockfile:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm run validate:release
```

- [x] Strict TypeScript passes.
- [x] Full-project ESLint passes with zero warnings.
- [x] Prettier check passes.
- [x] All 26 Vitest tests pass.
- [x] The deterministic-core 80% coverage thresholds pass.
- [x] Current coverage is 93.44% statements, 85.52% branches, 95.23% functions, and 93.69% lines.
- [x] Chrome MV3 production build completes.
- [ ] Repeat `validate:release` on the final clean release commit in CI.
- [ ] Add CI artifacts for test results, coverage, manifest, dependency audit, and build archive.
- [ ] Review or remediate package-manager peer/deprecation warnings before release.

## 3. Generated manifest and permissions — blocking

Inspect `build/chrome-mv3-prod/manifest.json`, not only `package.json`.

- [ ] **Blocker:** move non-entry helper modules out of Plasmo's reserved `src/contents` directory or give them explicit narrow content-script configurations.
- [ ] **Blocker:** confirm the generated manifest contains no unintended `<all_urls>` content scripts.
- [ ] Confirm content scripts run only on the documented Google Flow, Gemini, Grok, and X Grok routes.
- [ ] Confirm `host_permissions` contains only origins required for shipped adapters.
- [ ] Replace the example optional backend permission with the exact production API origin or implement a user-initiated optional permission flow.
- [ ] Reassess whether the full `tabs` permission is necessary or can be narrowed to `activeTab` plus explicit host permissions.
- [ ] Confirm `storage`, `downloads`, `sidePanel`, and `alarms` are required and accurately disclosed.
- [ ] Confirm web-accessible resources expose only files required for the in-page fallback and only to supported origins.
- [ ] Confirm the extension CSP contains no unsafe inline/eval allowances.
- [ ] Confirm incognito behavior is intentionally disabled or implement and document safe isolation.
- [ ] Compare a fresh generated manifest against the approved manifest baseline.

## 4. Platform authorization and policy — blocking

- [ ] Review Google Flow, Gemini, Grok, and X terms applicable to UI automation.
- [ ] Obtain written permission where required.
- [ ] Confirm the product does not claim affiliation with Google, xAI, X, or other platform owners.
- [ ] Confirm automation does not bypass authentication, access controls, CAPTCHAs, rate limits, or paid entitlements.
- [ ] Document user responsibility for submitted content and generated outputs.
- [ ] Define a rapid adapter-disable process for policy or platform changes.

## 5. Live adapter verification — blocking

Use dedicated test accounts and non-sensitive prompts. Record browser version, account tier, locale, URL, adapter version, and test date for every result.

### Google Flow

- [ ] Verify `https://flow.google/` redirect behavior.
- [ ] Verify supported Labs Flow routes and locale variants.
- [ ] Verify authentication-required detection.
- [ ] Verify prompt input discovery and text entry.
- [ ] Verify exactly one visible submit action.
- [ ] Verify generation-start and generation-completion detection.
- [ ] Verify image/video output extraction and accessible media URLs.
- [ ] Verify navigation changes, rate limits, service errors, cancellation, and retry behavior.

### Google Gemini

- [ ] Verify root, `/app`, conversation, and `/u/<n>/app` routes.
- [ ] Verify authentication-required detection.
- [ ] Verify prompt input discovery, text entry, and exactly one submit action.
- [ ] Verify streaming start/completion and final text extraction.
- [ ] Verify an existing response cannot be misidentified as the new output.
- [ ] Verify navigation changes, rate limits, service errors, cancellation, and retry behavior.

### Grok

- [ ] Verify `grok.com` and `www.grok.com` supported routes.
- [ ] Verify only explicit `/i/grok` routes are accepted on `x.com` and `www.x.com`.
- [ ] Verify authentication-required detection.
- [ ] Verify prompt input discovery, text entry, and exactly one submit action.
- [ ] Verify streaming start/completion and final output extraction.
- [ ] Verify navigation changes, rate limits, service errors, cancellation, and retry behavior.

### Cross-platform adapter checks

- [ ] Verify every selector diagnostic group reports expected primary/fallback matches.
- [ ] Replace provisional selectors with evidence-backed selectors and update adapter versions.
- [ ] Verify at least two supported Chromium versions and common zoom levels.
- [ ] Verify at least one non-English locale per platform or explicitly restrict supported locales.
- [ ] Verify selectors do not target unrelated controls, hidden elements, ads, or prior outputs.
- [ ] Verify DOM mutations do not cause duplicate submission or output capture.

## 6. Queue safety and worker recovery

- [ ] Confirm only one active queue can exist across popup, dashboard, side panel, and worker contexts.
- [ ] Start a queue, close all UI surfaces, and confirm the background-owned queue continues safely.
- [ ] Force service-worker suspension between prompts and confirm durable recovery.
- [ ] Force suspension during `sending` and `waiting_for_output`; verify no automatic uncertain replay.
- [ ] Verify stale lease owners and generations cannot submit, resume, stop, or release another worker's queue.
- [ ] Verify pause, resume, stop, skip, and retry behavior for every allowed queue status.
- [ ] Verify retry ceilings are enforced after repeated failures.
- [ ] Verify active-tab navigation and tab closure pause safely.
- [ ] Verify platform rate limits and authentication expiry pause safely.
- [ ] Verify long generation timeouts and user cancellation release DOM observers and timers.

## 7. Prompt import and local files

- [ ] Verify TXT with UTF-8 BOM, CRLF, blank lines, and maximum-length prompts.
- [ ] Verify CSV quoted commas, multiline cells, headers, configured columns, and malformed input.
- [ ] Verify every supported JSON shape and invalid structures.
- [ ] Verify unsupported extensions and files above 2 MiB are rejected before reading/parsing.
- [ ] Verify more than 1,000 prompts are bounded with actionable warnings.
- [ ] Verify uploaded content remains local unless the user later starts a queue or explicitly syncs it.
- [ ] Verify file import never starts automation automatically.

## 8. Output capture, naming, and downloads

- [ ] Verify duplicate DOM events create only one output record and one usage event.
- [ ] Verify fingerprint behavior for text, image, video, audio, file, and unknown outputs.
- [ ] Verify global, platform, day, and session sequence scopes persist across reloads.
- [ ] Verify sequence allocation remains unique across concurrently open extension surfaces.
- [ ] Verify reserved device names, illegal characters, long names, Unicode normalization, path-like names, and duplicate suffixes.
- [ ] Verify output rename revision conflicts and duplicate-name errors.
- [ ] Verify TXT, Markdown, JSON, CSV, and multi-text ZIP downloads.
- [ ] Verify media downloads reject non-HTTP(S), missing, malformed, expired, and cross-account URLs.
- [ ] Verify Chromium download completion and interruption update output status.
- [ ] **Blocker:** define recovery for in-memory browser download-ID tracking after worker suspension.
- [ ] **Blocker or documented limit:** replace large data-URL exports with a bounded streaming/offscreen approach or establish tested size limits.

## 9. Production backend, authentication, and billing — blocking

- [ ] Decide whether production accounts, billing, subscriptions, usage, invoices, and remote sync are in the release scope.
- [ ] Set `PLASMO_PUBLIC_USE_MOCK_API=false` and `PLASMO_PUBLIC_APP_ENV=production` for production builds.
- [ ] Replace `https://api.example.com` with the exact HTTPS production origin.
- [ ] Confirm no secret is present in any `PLASMO_PUBLIC_` variable or extension bundle.
- [ ] Implement the documented auth endpoints and response schemas.
- [ ] Use production password hashing, abuse controls, email verification/recovery, and account enumeration protections.
- [ ] Use short-lived access tokens, refresh rotation, revocation, issuer/audience validation, and secure token-storage review.
- [ ] Configure strict extension-origin CORS and reject arbitrary browser origins.
- [ ] Enforce authorization and record ownership server-side for every request.
- [ ] Enforce idempotency for usage and other safely retryable mutations.
- [ ] Implement real subscription/billing webhooks and server-side entitlement checks if billing ships.
- [ ] Never collect payment-card fields inside the extension.
- [ ] Add backend availability, timeout, rate-limit, audit, and incident-response monitoring.
- [ ] Run a dedicated backend security assessment.

## 10. Privacy, retention, and deletion — blocking

- [ ] Inventory every local, IndexedDB, log, download, and backend data field.
- [ ] Document whether prompts, outputs, filenames, URLs, account data, and diagnostics leave the browser.
- [ ] Define retention periods for local and remote records.
- [ ] Verify export includes all user-owned local data in a portable format.
- [ ] Verify clear-data removes sessions, mock state, settings, queues, prompts, outputs, and sequence counters.
- [ ] Implement production account deletion and backend data deletion if accounts ship.
- [ ] Publish a privacy policy matching actual permissions and behavior.
- [ ] Publish support and deletion-request contact information.
- [ ] Complete Chrome Web Store data-use disclosures.
- [ ] Review diagnostic logs for secrets, prompt content, output content, cookies, headers, and signed URLs.
- [ ] Confirm privacy mode is enabled by default in production.

## 11. UI, accessibility, and user control

- [ ] Test popup, side panel, dashboard, options page, and in-page fallback at supported viewport sizes.
- [ ] Verify keyboard-only navigation and visible focus for all controls/dialogs.
- [ ] Verify labels, descriptions, alerts, status messages, and dialog focus behavior with a screen reader.
- [ ] Verify light, dark, and system themes meet contrast requirements.
- [ ] Verify loading, empty, unsupported, unauthenticated, error, recovery, and usage-limit states.
- [ ] Verify every destructive action requires confirmation and explains scope.
- [ ] Verify queue start always requires an explicit user action.
- [ ] Verify auto-save/auto-download settings accurately reflect implemented behavior; remove or complete misleading controls.
- [ ] Check UI strings for encoding artifacts, truncation, pluralization, and narrow popup layout.

## 12. Storage, migrations, and upgrades

- [ ] Test first install with empty storage.
- [ ] Test upgrade from every publicly released storage schema version.
- [ ] Confirm migrations are contiguous, idempotent, bounded, and preserve ownership/revisions.
- [ ] Test corrupted, newer-version, and partially migrated storage.
- [ ] Test IndexedDB blocked upgrades and multiple open extension pages.
- [ ] Define downgrade behavior and rollback limitations.
- [ ] Verify uninstall/reinstall expectations and document whether browser data remains.

## 13. Browser and operating-system matrix

- [ ] Test current stable Google Chrome on Windows, macOS, and Linux.
- [ ] Test Microsoft Edge if it is a supported distribution target.
- [ ] Test a browser without `chrome.sidePanel` and verify the fallback safely.
- [ ] Verify download filenames and reserved-name behavior on Windows, macOS, and Linux.
- [ ] Verify sleep/wake, network offline/online, tab discard, and browser restart behavior.
- [ ] Define the minimum supported Chromium version from the APIs and generated syntax actually used.

## 14. Packaging and store submission

- [ ] Run `corepack pnpm run validate:release` from the final clean commit.
- [ ] Run `corepack pnpm run package` and inspect the resulting archive.
- [ ] Confirm source maps, test data, environment files, coverage, and development-only artifacts are absent.
- [ ] Confirm production mock credentials and development diagnostics are removed or explicitly acceptable for the distribution channel.
- [ ] Verify the packaged manifest version, permissions, CSP, icons, and resource hashes.
- [ ] Scan the package for secrets and unexpected network origins.
- [ ] Prepare store icon, screenshots, description, support URL, privacy-policy URL, and permission justifications.
- [ ] Test the exact packaged archive as an unpacked extension before upload.
- [ ] Record the package checksum and signing/upload account.
- [ ] Submit for store review only after all blocking items are complete.

## 15. Monitoring, rollback, and maintenance

- [ ] Define adapter-health telemetry that does not capture prompt/output content.
- [ ] Define alert thresholds for selector failures, auth errors, rate limits, downloads, and queue recovery.
- [ ] Document how to disable a broken adapter without risking queued work.
- [ ] Prepare rollback instructions and identify storage-schema compatibility constraints.
- [ ] Establish dependency, browser, and platform-selector review cadence.
- [ ] Establish a security vulnerability intake and patch process.
- [ ] Archive release notes, known limitations, validation evidence, and approver sign-off.

## Final sign-off

All blocking items above must be complete before public production release.

| Role             | Name | Decision | Date | Evidence/link |
| ---------------- | ---- | -------- | ---- | ------------- |
| Engineering      |      | Pending  |      |               |
| Security/privacy |      | Pending  |      |               |
| Product/legal    |      | Pending  |      |               |
| Release owner    |      | Pending  |      |               |

### Release decision

- [ ] Approved for public production release
- [ ] Approved for limited/private distribution only
- [x] Not approved; blocking work remains
