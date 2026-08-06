import { LuffyflowError } from "~/errors/luffyflow-error"
import type { SupportedPlatform } from "~/schemas"

import type { PlatformAdapter } from "./contracts"

/** The registry owns adapter lifecycles while shared services depend only on the adapter contract. */
export class PlatformAdapterRegistry {
  private readonly adapters = new Map<SupportedPlatform, PlatformAdapter>()

  /** Adds one platform implementation and returns an ownership-safe unregister callback. */
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

  /** Looks up a platform explicitly when a queued command already names its adapter. */
  get(id: SupportedPlatform): PlatformAdapter | null {
    return this.adapters.get(id) ?? null
  }

  /** Chooses the first registered adapter that accepts the current page URL. */
  detect(url: URL): PlatformAdapter | null {
    return [...this.adapters.values()].find((adapter) => adapter.isSupportedUrl(url)) ?? null
  }

  /** Releases every adapter observer before clearing the registry. */
  dispose(): void {
    for (const adapter of this.adapters.values()) adapter.dispose()
    this.adapters.clear()
  }
}
