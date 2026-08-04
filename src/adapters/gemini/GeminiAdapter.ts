import { ObservedPlatformAdapter } from "~/adapters/shared/ObservedPlatformAdapter"
import { detectTextOutput } from "~/adapters/shared/output-extraction"
import { applySelectorOverrides } from "~/adapters/selector-overrides"
import type { AdapterSelectorConfig } from "~/adapters/contracts"
import type { DetectedOutput, PlatformAdapterSettings } from "~/schemas"

import { geminiSelectors, geminiTextSignals } from "./selectors"

/** Gemini automation accepts only the official web app host and app conversation routes. */
export class GeminiAdapter extends ObservedPlatformAdapter {
  override readonly id = "gemini" as const
  override readonly displayName = "Google Gemini"
  override readonly version = "0.1.0-provisional.1"
  protected override readonly selectors: AdapterSelectorConfig
  protected override readonly textSignals = geminiTextSignals

  constructor(overrides: PlatformAdapterSettings["selectorOverrides"] = {}) {
    super()
    this.selectors = applySelectorOverrides(geminiSelectors, overrides)
  }

  override isSupportedUrl(url: URL): boolean {
    if (url.protocol !== "https:" || url.hostname !== "gemini.google.com") return false
    return url.pathname === "/" || /^\/(?:u\/\d+\/)?app(?:\/|$)/.test(url.pathname)
  }

  protected override detectOutput(element: HTMLElement): DetectedOutput | null {
    return detectTextOutput(element)
  }
}
