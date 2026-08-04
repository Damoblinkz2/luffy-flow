import type { AdapterSelectorConfig, AdapterTextSignals } from "~/adapters/contracts"

const provisional = (query: string, assumption: string) => ({
  query,
  kind: "css" as const,
  confidence: "provisional" as const,
  note: `UNVERIFIED 2026-08-03: ${assumption}`,
})

const fallback = (query: string, assumption: string) => ({
  query,
  kind: "css" as const,
  confidence: "fallback" as const,
  note: `UNVERIFIED FALLBACK 2026-08-03: ${assumption}`,
})

/** Grok supports its standalone site and exact X Grok route with separate provisional fallbacks. */
export const grokSelectors = {
  promptInput: [
    provisional(
      'textarea[aria-label*="ask" i]',
      "Grok may label its native prompt input with Ask.",
    ),
    provisional(
      '[contenteditable="true"][role="textbox"]',
      "Grok may expose a rich editor as an ARIA textbox.",
    ),
    fallback(
      'textarea[placeholder*="ask" i]',
      "English placeholder text may identify the prompt input.",
    ),
  ],
  submitButton: [
    provisional('button[aria-label*="submit" i]', "Grok may expose an accessible Submit control."),
    provisional('button[aria-label*="send" i]', "Grok may expose an accessible Send control."),
    fallback('button[data-testid*="send" i]', "A stable send test identifier may exist."),
  ],
  stopButton: [
    provisional(
      'button[aria-label*="stop generating" i]',
      "Grok may expose a Stop generating control.",
    ),
    fallback(
      'button[data-testid*="stop" i]',
      "A stop test identifier may exist during generation.",
    ),
  ],
  generationBusyIndicator: [
    provisional(
      '[data-message-author-role="assistant"][aria-busy="true"]',
      "The active assistant response may carry ARIA busy state.",
    ),
    fallback(
      '[data-testid*="response" i][aria-busy="true"]',
      "A response test-id may carry generation state.",
    ),
  ],
  outputContainer: [
    provisional(
      '[data-message-author-role="assistant"]',
      "Standalone Grok may annotate assistant turns explicitly.",
    ),
    provisional(
      '[data-testid*="assistant-message" i]',
      "Assistant responses may have a semantic test identifier.",
    ),
    fallback(
      'main article[data-testid*="message" i]',
      "X Grok may render responses as message articles.",
    ),
  ],
  authenticationRequiredIndicator: [
    provisional('a[href*="/login"]', "Signed-out Grok surfaces may link to a login route."),
    fallback(
      'button[aria-label*="sign in" i]',
      "The signed-out surface may expose a Sign in button.",
    ),
  ],
  rateLimitIndicator: [
    provisional('[data-testid*="rate-limit" i]', "Grok may expose a rate-limit status identifier."),
    fallback('[aria-label*="limit reached" i]', "Usage exhaustion may have an accessible label."),
  ],
  serviceUnavailableIndicator: [
    provisional(
      '[data-testid*="service-unavailable" i]',
      "Grok may expose an unavailable status identifier.",
    ),
    fallback(
      '[aria-label*="service unavailable" i]',
      "An outage message may have an accessible label.",
    ),
  ],
} satisfies AdapterSelectorConfig

export const grokTextSignals = {
  authenticationRequired: ["sign in to continue", "log in to continue"],
  rateLimited: ["rate limit", "too many requests", "limit reached", "try again later"],
  serviceUnavailable: ["service unavailable", "temporarily unavailable", "something went wrong"],
} satisfies AdapterTextSignals
