import type { AdapterSelectorConfig, SelectorCandidate } from "~/adapters/contracts"
import type { PlatformAdapterSettings } from "~/schemas"

/** User selector overrides are CSS-only, visibly unverified, and limited to known selector groups. */
export const applySelectorOverrides = (
  base: AdapterSelectorConfig,
  overrides: PlatformAdapterSettings["selectorOverrides"],
): AdapterSelectorConfig => {
  const result = { ...base }
  for (const key of Object.keys(base) as (keyof AdapterSelectorConfig)[]) {
    const custom = overrides[key]
    if (custom === undefined || custom.length === 0) continue
    const candidates: SelectorCandidate[] = custom.map((query) => ({
      query,
      kind: "css",
      confidence: "fallback",
      note: "UNVERIFIED USER OVERRIDE: configured in AutoFlow settings.",
    }))
    result[key] = [...candidates, ...base[key]]
  }
  return result
}
