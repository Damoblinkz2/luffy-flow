# Post-Stage-9 production hardening

The original implementation plan ends at Stage 9. This document records the first post-stage production-hardening increment completed on 2026-08-06: Meta AI platform support and least-privilege content-script bundling.

## Meta AI support

Meta documents `meta.ai` as its standalone web experience and describes text, image, voice, and document-oriented workflows on the web. LuffyFlow grants access only to:

- `https://meta.ai/*`
- `https://www.meta.ai/*`

It does not request access to Facebook, Instagram, Messenger, or WhatsApp for this adapter. Official product references:

- [Introducing the Meta AI App](https://about.fb.com/news/2025/04/introducing-meta-ai-app-new-way-access-ai-assistant/)
- [Meta AI is now multilingual, more creative and smarter](https://about.fb.com/news/2024/07/meta-ai-is-now-multilingual-more-creative-and-smarter/)

The `MetaAiAdapter` uses the same observer-driven submission, cancellation, timeout, output deduplication, status detection, and health-diagnostic behavior as the existing adapters. Text extraction falls back to rendered media when a response container has no text.

All Meta AI selectors are provisional. Meta does not publish a stable DOM automation contract, and authenticated live-page verification was unavailable in this environment. Before release, verify every selector using a dedicated account, non-sensitive prompts, and the Settings diagnostics panel. Replace evidence-backed selectors and increment the adapter version after verification.

Older saved settings remain readable. The runtime schema supplies safe Meta AI adapter defaults when version-one settings do not yet contain the new platform key.

## Least-privilege content scripts

Plasmo treats every module in `src/contents` as a content-script entry. Helper modules previously stored there generated independent `<all_urls>` entries even though declared host permissions were platform-specific.

Shared content coordination now lives under `src/content-runtime`. Only `src/contents/platform-automation.ts` remains in the reserved entry directory. The generated Chrome MV3 manifest now contains one content script with these matches:

- Google Flow and supported Labs Flow routes
- Google Gemini
- Standalone Grok
- Meta AI
- X's explicit `/i/grok` route

The generated manifest contains zero `<all_urls>` content scripts. This closes the first blocker recorded in the Stage 9 production checklist.

## Remaining release blockers

- Verify every platform adapter against authenticated live pages.
- Review applicable platform policies and obtain permission where required.
- Decide whether mock backend, authentication, billing, and usage claims will be replaced or removed.
- Publish privacy, retention, support, and account-deletion policies.
- Complete accessibility, worker-recovery, upgrade, and multi-browser manual checks.
- Select a license and prepare store artifacts.

## Known limitations

- Meta AI availability, authentication, routes, and UI may vary by region, account, experiment, and locale.
- Provisional selectors can degrade without notice when Meta changes its web interface.
- Media URLs are saved or downloaded only when already exposed to the authenticated page and allowed by browser and origin policy.
- LuffyFlow does not bypass authentication, rate limits, CAPTCHAs, regional availability, signed URLs, or other platform controls.
