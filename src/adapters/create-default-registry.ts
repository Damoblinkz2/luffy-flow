import { GeminiAdapter } from "~/adapters/gemini"
import { GoogleFlowAdapter } from "~/adapters/google-flow"
import { GrokAdapter } from "~/adapters/grok"
import { PlatformAdapterRegistry } from "~/adapters/registry"
import type { AutoflowSettings } from "~/schemas"

/** The content composition root registers exactly one instance of every supported adapter. */
export const createDefaultAdapterRegistry = (
  settings?: AutoflowSettings["platformAdapters"],
): PlatformAdapterRegistry => {
  const registry = new PlatformAdapterRegistry()
  registry.register(new GoogleFlowAdapter(settings?.["google-flow"].selectorOverrides))
  registry.register(new GeminiAdapter(settings?.gemini.selectorOverrides))
  registry.register(new GrokAdapter(settings?.grok.selectorOverrides))
  return registry
}
