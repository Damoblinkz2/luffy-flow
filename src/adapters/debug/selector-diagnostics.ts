import type { PlatformAdapterRegistry } from "~/adapters/registry"
import type { AdapterHealth, SupportedPlatform } from "~/schemas"

export interface SelectorDebugSnapshot {
  page: string
  supported: boolean
  adapterId?: SupportedPlatform
  adapterVersion?: string
  health?: AdapterHealth
  message?: string
}

/** Debug snapshots omit query strings, hashes, DOM text, prompts, and generated output content. */
export const collectSelectorDebugSnapshot = async (
  registry: PlatformAdapterRegistry,
  signal: AbortSignal,
): Promise<SelectorDebugSnapshot> => {
  const url = new URL(globalThis.location.href)
  const page = `${url.origin}${url.pathname}`
  const adapter = registry.detect(url)
  if (adapter === null) {
    return {
      page,
      supported: false,
      message: "No adapter accepts this exact URL.",
    }
  }
  return {
    page,
    supported: true,
    adapterId: adapter.id,
    adapterVersion: adapter.version,
    health: await adapter.getHealth(signal),
  }
}
