import type { AdapterSelectorConfig, AdapterTextSignals } from "~/adapters/contracts"

/** Describes a likely Meta AI selector whose stability still needs real-site verification. */
const provisional = (query: string, assumption: string) => ({
  query,
  kind: "css" as const,
  confidence: "provisional" as const,
  note: `UNVERIFIED 2026-08-06: ${assumption}`,
})

/** Marks a lower-confidence selector that is tried only after stronger candidates fail. */
const fallback = (query: string, assumption: string) => ({
  query,
  kind: "css" as const,
  confidence: "fallback" as const,
  note: `UNVERIFIED FALLBACK 2026-08-06: ${assumption}`,
})

/** Meta AI selectors prefer semantic editor, control, and conversation attributes. */
export const metaAiSelectors = {
  promptInput: [
    provisional(
      'textarea[placeholder*="ask meta ai" i]',
      "The standalone composer may identify Meta AI in its placeholder.",
    ),
    provisional(
      '[contenteditable="true"][role="textbox"]',
      "The composer may expose a rich editor with the ARIA textbox role.",
    ),
    fallback(
      '[contenteditable="true"][data-lexical-editor="true"]',
      "Meta products commonly use a Lexical contenteditable editor.",
    ),
  ],
  submitButton: [
    provisional('button[aria-label*="send" i]', "The submit control may be labelled Send."),
    provisional(
      'button[data-testid*="send" i]',
      "The submit control may expose a stable send test identifier.",
    ),
    fallback('form button[type="submit"]', "The composer may use a semantic submit button."),
  ],
  stopButton: [
    provisional(
      'button[aria-label*="stop generating" i]',
      "An active response may expose a Stop generating control.",
    ),
    fallback(
      'button[data-testid*="stop" i]',
      "An active response may expose a stop test identifier.",
    ),
  ],
  generationBusyIndicator: [
    provisional(
      '[role="progressbar"][aria-label*="generat" i]',
      "Generation may expose an accessible progress indicator.",
    ),
    fallback(
      '[data-testid*="response" i][aria-busy="true"]',
      "The active response may carry an ARIA busy state.",
    ),
  ],
  outputContainer: [
    provisional(
      '[data-message-author-role="assistant"]',
      "Assistant turns may be marked with an author-role attribute.",
    ),
    provisional(
      '[data-testid*="assistant-message" i]',
      "Assistant responses may expose a semantic test identifier.",
    ),
    fallback(
      'main [role="article"]',
      "Conversation responses may be rendered as accessible articles.",
    ),
  ],
  authenticationRequiredIndicator: [
    provisional(
      'a[href*="login" i], a[href*="auth" i]',
      "The signed-out web experience may link to authentication.",
    ),
    fallback(
      'button[aria-label*="log in" i], button[aria-label*="sign in" i]',
      "The signed-out experience may expose an accessible login control.",
    ),
  ],
  rateLimitIndicator: [
    provisional(
      '[data-testid*="rate-limit" i]',
      "Meta AI may expose a rate-limit status identifier.",
    ),
    fallback('[aria-label*="limit reached" i]', "Usage exhaustion may have an accessible label."),
  ],
  serviceUnavailableIndicator: [
    provisional(
      '[data-testid*="service-unavailable" i]',
      "Meta AI may expose an unavailable status identifier.",
    ),
    fallback(
      '[aria-label*="service unavailable" i]',
      "An outage message may have an accessible label.",
    ),
  ],
} satisfies AdapterSelectorConfig

export const metaAiTextSignals = {
  authenticationRequired: ["log in to continue", "sign in to continue"],
  rateLimited: ["rate limit", "too many requests", "limit reached", "try again later"],
  serviceUnavailable: ["service unavailable", "temporarily unavailable", "something went wrong"],
} satisfies AdapterTextSignals
