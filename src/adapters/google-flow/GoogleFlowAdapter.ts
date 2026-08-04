import { ObservedPlatformAdapter } from "~/adapters/shared/ObservedPlatformAdapter"
import { detectMediaOutput } from "~/adapters/shared/output-extraction"
import { applySelectorOverrides } from "~/adapters/selector-overrides"
import type { AdapterSelectorConfig } from "~/adapters/contracts"
import type { DetectedOutput, PlatformAdapterSettings } from "~/schemas"

import { googleFlowSelectors, googleFlowTextSignals } from "./selectors"

/** Google Flow automation is restricted to the official alias and Labs Flow routes. */
export class GoogleFlowAdapter extends ObservedPlatformAdapter {
  override readonly id = "google-flow" as const
  override readonly displayName = "Google Flow"
  override readonly version = "0.1.0-provisional.1"
  protected override readonly selectors: AdapterSelectorConfig
  protected override readonly textSignals = googleFlowTextSignals

  constructor(overrides: PlatformAdapterSettings["selectorOverrides"] = {}) {
    super()
    this.selectors = applySelectorOverrides(googleFlowSelectors, overrides)
  }

  override isSupportedUrl(url: URL): boolean {
    if (url.protocol !== "https:") return false
    if (url.hostname === "flow.google") return url.pathname === "/"
    if (url.hostname !== "labs.google" && url.hostname !== "www.labs.google") return false
    return /^\/fx(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/tools\/flow(?:\/|$)/i.test(url.pathname)
  }

  protected override detectOutput(element: HTMLElement): DetectedOutput | null {
    return detectMediaOutput(element)
  }
}
