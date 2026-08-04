import { ObservedPlatformAdapter } from "~/adapters/shared/ObservedPlatformAdapter"
import { detectTextOutput } from "~/adapters/shared/output-extraction"
import { applySelectorOverrides } from "~/adapters/selector-overrides"
import type { AdapterSelectorConfig } from "~/adapters/contracts"
import type { DetectedOutput, PlatformAdapterSettings } from "~/schemas"

import { grokSelectors, grokTextSignals } from "./selectors"

/** Grok automation accepts only grok.com and X's explicit /i/grok application route. */
export class GrokAdapter extends ObservedPlatformAdapter {
  override readonly id = "grok" as const
  override readonly displayName = "Grok"
  override readonly version = "0.1.0-provisional.1"
  protected override readonly selectors: AdapterSelectorConfig
  protected override readonly textSignals = grokTextSignals

  constructor(overrides: PlatformAdapterSettings["selectorOverrides"] = {}) {
    super()
    this.selectors = applySelectorOverrides(grokSelectors, overrides)
  }

  override isSupportedUrl(url: URL): boolean {
    if (url.protocol !== "https:") return false
    if (url.hostname === "grok.com" || url.hostname === "www.grok.com") return true
    return (
      (url.hostname === "x.com" || url.hostname === "www.x.com") &&
      /^\/i\/grok(?:\/|$)/.test(url.pathname)
    )
  }

  protected override detectOutput(element: HTMLElement): DetectedOutput | null {
    return detectTextOutput(element)
  }
}
