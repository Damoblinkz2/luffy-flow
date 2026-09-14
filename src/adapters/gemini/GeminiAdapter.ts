import { ObservedPlatformAdapter } from "~/adapters/shared/ObservedPlatformAdapter"
import { detectMediaOutput, detectTextOutput } from "~/adapters/shared/output-extraction"
import { applySelectorOverrides } from "~/adapters/selector-overrides"
import type { AdapterSelectorConfig } from "~/adapters/contracts"
import type { DetectedOutput, PlatformAdapterSettings } from "~/schemas"

import { geminiSelectors, geminiTextSignals } from "./selectors"

/** Gemini automation accepts only the official web app host and app conversation routes. */
export class GeminiAdapter extends ObservedPlatformAdapter {
  override readonly id = "gemini" as const
  override readonly displayName = "Google Gemini"
  override readonly version = "0.1.0-provisional.2"
  // Gemini commonly turns a new chat into a conversation URL while it is generating.
  // That same supported-route transition must not be treated as a user cancellation.
  override readonly allowsGenerationRouteChange = true
  protected override readonly selectors: AdapterSelectorConfig
  protected override readonly textSignals = geminiTextSignals

  /** Applies user-supplied selector corrections without mutating the shipped defaults. */
  constructor(overrides: PlatformAdapterSettings["selectorOverrides"] = {}) {
    super()
    this.selectors = applySelectorOverrides(geminiSelectors, overrides)
  }

  /** Restricts injection to Gemini's HTTPS conversation routes. */
  override isSupportedUrl(url: URL): boolean {
    if (url.protocol !== "https:" || url.hostname !== "gemini.google.com") return false
    return url.pathname === "/" || /^\/(?:u\/\d+\/)?app(?:\/|$)/.test(url.pathname)
  }

  /** Captures native generated media before falling back to Gemini's textual response. */
  protected override detectOutput(element: HTMLElement): DetectedOutput | null {
    return detectMediaOutput(element) ?? detectTextOutput(element)
  }
}
