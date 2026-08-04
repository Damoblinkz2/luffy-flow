import { Storage } from "@plasmohq/storage"

import type { KeyValueStore } from "./contracts"

/** Plasmo local storage provides cross-runtime persistence for small coordination records. */
export class PlasmoKeyValueStore implements KeyValueStore {
  private readonly storage: Storage

  constructor(area: "local" | "sync" | "session" = "local") {
    this.storage = new Storage({ area })
  }

  get(key: string): Promise<unknown> {
    return this.storage.get(key)
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.storage.set(key, value)
  }

  async remove(key: string): Promise<void> {
    await this.storage.remove(key)
  }
}
