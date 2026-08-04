/** Namespaced keys prevent unrelated data from being cleared or migrated accidentally. */
export const STORAGE_KEYS = {
  authentication: "autoflow:auth",
  userProfile: "autoflow:user-profile",
  subscription: "autoflow:subscription",
  usage: "autoflow:usage",
  settings: "autoflow:settings",
  promptRecords: "autoflow:prompts",
  outputRecords: "autoflow:outputs",
  queueState: "autoflow:queue",
  sequenceCounters: "autoflow:sequences",
  sessions: "autoflow:sessions",
  syncMetadata: "autoflow:sync-metadata",
  mockApiState: "autoflow:mock-api",
} as const

export type StorageNamespaceName = keyof typeof STORAGE_KEYS
export type StorageKey = (typeof STORAGE_KEYS)[StorageNamespaceName]

/** Clear-data flows iterate only this allowlist instead of clearing all extension storage. */
export const ALL_AUTOFLOW_STORAGE_KEYS = Object.values(STORAGE_KEYS)
