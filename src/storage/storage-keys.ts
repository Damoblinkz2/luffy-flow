/** Namespaced keys prevent unrelated data from being cleared or migrated accidentally. */
export const STORAGE_KEYS = {
  authentication: "luffyflow:auth",
  userProfile: "luffyflow:user-profile",
  subscription: "luffyflow:subscription",
  usage: "luffyflow:usage",
  settings: "luffyflow:settings",
  promptRecords: "luffyflow:prompts",
  outputRecords: "luffyflow:outputs",
  queueState: "luffyflow:queue",
  sequenceCounters: "luffyflow:sequences",
  sessions: "luffyflow:sessions",
  syncMetadata: "luffyflow:sync-metadata",
  mockApiState: "luffyflow:mock-api",
} as const

export type StorageNamespaceName = keyof typeof STORAGE_KEYS
export type StorageKey = (typeof STORAGE_KEYS)[StorageNamespaceName]

/** Clear-data flows iterate only this allowlist instead of clearing all extension storage. */
export const ALL_LUFFYFLOW_STORAGE_KEYS = Object.values(STORAGE_KEYS)
