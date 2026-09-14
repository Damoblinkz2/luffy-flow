import type { AdapterSelectorConfig, AdapterTextSignals } from "~/adapters/contracts"

/** Describes a likely Gemini selector whose stability still needs real-site verification. */
const provisional = (query: string, assumption: string) => ({
  query,
  kind: "css" as const,
  confidence: "provisional" as const,
  note: `UNVERIFIED 2026-08-03: ${assumption}`,
})

/** Marks a lower-confidence selector that is tried only after stronger candidates fail. */
const fallback = (query: string, assumption: string) => ({
  query,
  kind: "css" as const,
  confidence: "fallback" as const,
  note: `UNVERIFIED FALLBACK 2026-08-03: ${assumption}`,
})

/** Gemini candidates avoid generated class names and remain provisional until authenticated testing. */
export const geminiSelectors = {
  promptInput: [
    provisional(
      'div[contenteditable="true"][role="textbox"]',
      "Gemini may expose its rich prompt editor as an ARIA textbox.",
    ),
    provisional('textarea[aria-label*="prompt" i]', "Gemini may render a native prompt textarea."),
    fallback(
      'rich-textarea div[contenteditable="true"]',
      "The editor may remain nested in a rich-textarea component.",
    ),
  ],
  submitButton: [
    provisional(
      'button[aria-label*="send message" i]',
      "Gemini may label its submission control Send message.",
    ),
    provisional('button[data-test-id="send-button"]', "A stable send test identifier may exist."),
    fallback(
      'button[aria-label*="submit" i]',
      "The submission control may use a generic accessible label.",
    ),
  ],
  stopButton: [
    provisional(
      'button[aria-label*="stop response" i]',
      "Gemini may expose a Stop response control.",
    ),
    fallback(
      'button[aria-label*="stop" i]',
      "The active generation control may have a shorter Stop label.",
    ),
  ],
  generationBusyIndicator: [
    provisional(
      'button[aria-label*="stop generating" i]',
      "Gemini exposes an enabled Stop generating action while a streamed response is active.",
    ),
    provisional(
      'button[aria-label*="stop response" i]',
      "Gemini may label its active stream control Stop response.",
    ),
    provisional(
      'model-response[aria-busy="true"]',
      "The current model response may carry ARIA busy state.",
    ),
    fallback(
      '[data-test-id*="loading" i][aria-busy="true"]',
      "A loading test-id may represent response generation.",
    ),
  ],
  outputContainer: [
    provisional("model-response", "Gemini may retain a semantic model-response custom element."),
    provisional(
      '[data-message-author-role="assistant"]',
      "Assistant turns may carry an explicit author role.",
    ),
    fallback('main [data-test-id*="response" i]', "Response containers may use a test identifier."),
  ],
  authenticationRequiredIndicator: [
    provisional(
      'a[href*="accounts.google.com"][href*="signin" i]',
      "The signed-out Gemini surface may link to Google sign-in.",
    ),
    fallback(
      'button[aria-label*="sign in" i]',
      "The signed-out surface may expose a Sign in button.",
    ),
  ],
  rateLimitIndicator: [
    provisional(
      '[data-test-id*="rate-limit" i]',
      "Gemini may expose a rate-limit status identifier.",
    ),
    fallback('[aria-label*="limit reached" i]', "Usage exhaustion may have an accessible label."),
  ],
  serviceUnavailableIndicator: [
    provisional(
      '[data-test-id*="service-unavailable" i]',
      "Gemini may expose an unavailable status identifier.",
    ),
    fallback(
      '[aria-label*="service unavailable" i]',
      "An outage message may have an accessible label.",
    ),
  ],
} satisfies AdapterSelectorConfig

export const geminiTextSignals = {
  authenticationRequired: ["sign in to continue", "sign in to gemini"],
  rateLimited: ["rate limit", "too many requests", "limit reached", "try again later"],
  serviceUnavailable: ["service unavailable", "temporarily unavailable", "something went wrong"],
} satisfies AdapterTextSignals
