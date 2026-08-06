import { GeminiAdapter } from "~/adapters/gemini"
import { GoogleFlowAdapter } from "~/adapters/google-flow"
import { GrokAdapter } from "~/adapters/grok"
import { MetaAiAdapter } from "~/adapters/meta-ai"
import { PlatformAdapterRegistry } from "~/adapters/registry"
import type { LuffyflowSettings } from "~/schemas"

/** The content composition root registers exactly one instance of every supported adapter. */
export const createDefaultAdapterRegistry = (
  settings?: LuffyflowSettings["platformAdapters"],
): PlatformAdapterRegistry => {
  const registry = new PlatformAdapterRegistry()
  if (settings?.["google-flow"].enabled !== false)
    registry.register(new GoogleFlowAdapter(settings?.["google-flow"].selectorOverrides))
  if (settings?.gemini.enabled !== false)
    registry.register(new GeminiAdapter(settings?.gemini.selectorOverrides))
  if (settings?.grok.enabled !== false)
    registry.register(new GrokAdapter(settings?.grok.selectorOverrides))
  if (settings?.["meta-ai"].enabled !== false)
    registry.register(new MetaAiAdapter(settings?.["meta-ai"].selectorOverrides))
  return registry
}
