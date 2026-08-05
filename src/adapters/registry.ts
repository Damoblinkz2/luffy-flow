import { LuffyflowError } from "~/errors/luffyflow-error"
import type { SupportedPlatform } from "~/schemas"

import type { PlatformAdapter } from "./contracts"

/** The registry owns adapter lifecycles while shared services depend only on the adapter contract. */
export class PlatformAdapterRegistry {
  private readonly adapters = new Map<SupportedPlatform, PlatformAdapter>()

  register(adapter: PlatformAdapter): () => void {
    if (this.adapters.has(adapter.id)) {
      throw new LuffyflowError({
        code: "ADAPTER_DUPLICATE",
        category: "invalid_data",
        userMessage: `The ${adapter.displayName} adapter was registered more than once.`,
      })
    }
    this.adapters.set(adapter.id, adapter)
    return () => {
      if (this.adapters.get(adapter.id) === adapter) {
        this.adapters.delete(adapter.id)
        adapter.dispose()
      }
    }
  }

  get(id: SupportedPlatform): PlatformAdapter | null {
    return this.adapters.get(id) ?? null
  }

  detect(url: URL): PlatformAdapter | null {
    return [...this.adapters.values()].find((adapter) => adapter.isSupportedUrl(url)) ?? null
  }

  dispose(): void {
    for (const adapter of this.adapters.values()) adapter.dispose()
    this.adapters.clear()
  }
}
