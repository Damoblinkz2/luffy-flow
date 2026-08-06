import type { AdapterSelectorConfig, AdapterTextSignals } from "~/adapters/contracts"

/** Describes a likely Flow selector whose stability still needs real-site verification. */
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

/** Flow's authenticated editor DOM is private; semantic candidates require live validation. */
export const googleFlowSelectors = {
  promptInput: [
    provisional(
      'textarea[aria-label*="prompt" i]',
      "Flow may label its prompt textarea semantically.",
    ),
    provisional(
      '[contenteditable="true"][role="textbox"][aria-label*="prompt" i]',
      "Flow may expose a rich prompt textbox.",
    ),
    fallback(
      'main textarea[placeholder*="describe" i]',
      "English placeholder text may identify the generation prompt.",
    ),
  ],
  submitButton: [
    provisional(
      'button[aria-label*="generate" i]',
      "Flow may expose an accessible Generate control.",
    ),
    provisional(
      'button[data-testid*="generate" i]',
      "A stable generation test identifier may exist.",
    ),
    fallback(
      'main button[aria-label*="create" i]',
      "An accessible Create control may submit in editor routes.",
    ),
  ],
  stopButton: [
    provisional(
      'button[aria-label*="stop generating" i]',
      "Flow may expose a generation stop control.",
    ),
    fallback(
      'button[data-testid*="stop" i]',
      "A stop test identifier may exist during generation.",
    ),
  ],
  generationBusyIndicator: [
    provisional(
      '[data-testid*="generation" i][aria-busy="true"]',
      "Flow may mark its generation region busy.",
    ),
    fallback(
      'main [role="progressbar"][aria-label*="generat" i]',
      "A labeled progress indicator may represent generation.",
    ),
  ],
  outputContainer: [
    provisional(
      '[data-testid*="generation-output" i]',
      "Flow may group the newest generated media in a test-id container.",
    ),
    provisional(
      "[data-output-id] img, [data-output-id] video, [data-output-id] audio",
      "Generated media may be keyed by an output identifier.",
    ),
    fallback(
      'main [aria-label*="generated" i] img, main [aria-label*="generated" i] video',
      "Accessible generated-media regions may contain output assets.",
    ),
  ],
  authenticationRequiredIndicator: [
    provisional(
      'a[href*="accounts.google.com"][href*="signin" i]',
      "The signed-out Flow surface may link to Google sign-in.",
    ),
    fallback(
      'button[aria-label*="sign in" i]',
      "The signed-out surface may expose a Sign in button.",
    ),
  ],
  rateLimitIndicator: [
    provisional('[data-testid*="rate-limit" i]', "Flow may expose a dedicated rate-limit status."),
    fallback(
      '[aria-label*="quota exceeded" i]',
      "A quota message may be labeled for assistive technology.",
    ),
  ],
  serviceUnavailableIndicator: [
    provisional(
      '[data-testid*="service-unavailable" i]',
      "Flow may expose a service status test identifier.",
    ),
    fallback(
      '[aria-label*="service unavailable" i]',
      "An outage message may have an accessible label.",
    ),
  ],
} satisfies AdapterSelectorConfig

export const googleFlowTextSignals = {
  authenticationRequired: ["sign in to continue", "sign in with google"],
  rateLimited: ["rate limit", "too many requests", "quota exceeded", "try again later"],
  serviceUnavailable: ["service unavailable", "temporarily unavailable", "something went wrong"],
} satisfies AdapterTextSignals
