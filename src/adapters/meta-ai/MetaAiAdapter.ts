import type { AdapterSelectorConfig } from "~/adapters/contracts"
import { applySelectorOverrides } from "~/adapters/selector-overrides"
import { ObservedPlatformAdapter } from "~/adapters/shared/ObservedPlatformAdapter"
import { detectTextOutput } from "~/adapters/shared/output-extraction"
import type { DetectedOutput, PlatformAdapterSettings } from "~/schemas"

import { metaAiSelectors, metaAiTextSignals } from "./selectors"

/** Meta AI automation is restricted to the standalone official web origin. */
export class MetaAiAdapter extends ObservedPlatformAdapter {
  override readonly id = "meta-ai" as const
  override readonly displayName = "Meta AI"
  override readonly version = "0.1.0-provisional.1"
  protected override readonly selectors: AdapterSelectorConfig
  protected override readonly textSignals = metaAiTextSignals

  /** Applies user-supplied selector corrections without mutating the shipped defaults. */
  constructor(overrides: PlatformAdapterSettings["selectorOverrides"] = {}) {
    super()
    this.selectors = applySelectorOverrides(metaAiSelectors, overrides)
  }

  /** Accepts only the standalone Meta AI HTTPS hosts declared in the extension manifest. */
  override isSupportedUrl(url: URL): boolean {
    return (
      url.protocol === "https:" && (url.hostname === "meta.ai" || url.hostname === "www.meta.ai")
    )
  }

  /** Text extraction falls back to rendered media when a response contains no textual content. */
  protected override detectOutput(element: HTMLElement): DetectedOutput | null {
    return detectTextOutput(element)
  }
}
