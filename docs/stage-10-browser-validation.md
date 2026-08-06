# Stage 10: browser and live-adapter validation

Stage 10 adds a real Chromium smoke gate and defines the authenticated verification process that
must be completed before LuffyFlow can be released publicly.

## Automated browser gate

Install the isolated Playwright browser once:

```powershell
corepack pnpm run test:browser:install
```

Build and run all Stage 10 gates:

```powershell
corepack pnpm run validate:stage10
```

The Playwright suite loads `build/chrome-mv3-prod` into a temporary Chrome for Testing profile. It
does not reuse the developer's Chrome profile, cookies, logins, extensions, or browsing history.

The suite verifies:

- The generated manifest points to packaged popup, side-panel, options, dashboard, worker, and
  content-script files.
- The generated manifest contains one narrowly matched content script and no `<all_urls>` access.
- Popup, side panel, dashboard, and options render in signed-out state without uncaught page errors.
- Development mock login succeeds in the real extension runtime.
- The authenticated session is restored across dashboard, popup, side panel, and options contexts.

This gate found and fixed two production-only blank-page failures that unit tests could not expose:

1. Parcel treated React and other browser dependencies as external modules.
2. Parcel removed Zod's re-exported schema factories during production tree shaking.

The package now declares an explicit browser target with bundled node modules and imports Zod's v3
runtime namespace directly. A successful Plasmo build alone is not considered proof that a surface
can render; `test:browser` is the regression gate.

## Authenticated live-adapter procedure

Automated tests must not use a personal AI account or pretend that synthetic DOM proves current live
selectors. Complete the following with dedicated test accounts, non-sensitive prompts, and an
approved platform-testing policy.

For each of Google Flow, Gemini, Grok, and Meta AI:

1. Start the development build with `corepack pnpm run dev` and load `build/chrome-mv3-dev`.
2. Open one documented HTTPS route and authenticate normally. Do not automate login or CAPTCHA.
3. Reload the platform tab after installing or reloading LuffyFlow.
4. Open LuffyFlow Settings, run **Inspect active tab**, and choose **Copy sanitized evidence**.
5. Record browser version, date, locale, account tier, safe route without query parameters, adapter
   version, readiness, selector checks, and warnings.
6. Confirm the prompt input and submit checks target the visible composer controls only.
7. Submit one unique, non-sensitive prompt and confirm exactly one submission occurs.
8. Confirm generation start, completion, new-output discrimination, capture, naming, and download.
9. Repeat once with an existing response already present to prove it is not captured as the new one.
10. Exercise cancellation and an SPA navigation change. Confirm uncertain work pauses rather than
    replaying automatically.

Never record cookies, tokens, account identifiers, prompt/output content, signed media URLs, or DOM
HTML. The copied evidence intentionally contains only a query-free route, browser user agent,
adapter identity/version, readiness, selector group presence, fallback index, and warnings.

## Evidence record

Create one copy of this table per tested route:

| Field                        | Result                       |
| ---------------------------- | ---------------------------- |
| Platform                     |                              |
| Test date                    |                              |
| Browser and version          |                              |
| Locale and account tier      |                              |
| Query-free route             |                              |
| Adapter version              |                              |
| Readiness                    |                              |
| Missing selector groups      |                              |
| Fallback selector groups     |                              |
| Exactly one submission       | Pass / Fail                  |
| Generation start/completion  | Pass / Fail                  |
| New-output discrimination    | Pass / Fail                  |
| Output capture and naming    | Pass / Fail                  |
| Download                     | Pass / Fail / Not applicable |
| Cancellation                 | Pass / Fail                  |
| Navigation safety            | Pass / Fail                  |
| Notes without sensitive data |                              |

## Stage completion rule

The automated portion of Stage 10 is complete when `validate:stage10` passes. Stage 10 as a release
gate remains open until every shipped adapter has dated authenticated evidence, provisional selectors
have been replaced or explicitly accepted as a release risk, and the manual queue/worker scenarios in
the production checklist are signed off.
