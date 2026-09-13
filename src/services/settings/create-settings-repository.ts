import {
  CURRENT_STORAGE_SCHEMA_VERSION,
  DEFAULT_GENERATION_COMPLETE_TIMEOUT_MS,
  DEFAULT_GENERATION_START_TIMEOUT_MS,
  DEFAULT_MAXIMUM_RETRY_COUNT,
  DEFAULT_OUTPUT_NAMING_PATTERN,
  DEFAULT_PROMPT_DELAY_MS,
  DEFAULT_SEQUENCE_PADDING,
} from "~/constants"
import type { PublicAppConfig } from "~/config/env"
import { luffyflowSettingsSchema, type LuffyflowSettings } from "~/schemas"
import type { KeyValueStore } from "~/storage/contracts"
import { LocalSettingsRepository } from "~/storage/repositories/LocalSettingsRepository"
import { STORAGE_KEYS } from "~/storage/storage-keys"
import { VersionedStorageNamespace } from "~/storage/VersionedStorageNamespace"
import type { Clock } from "~/utils/time"
import { systemClock } from "~/utils/time"

/** Stage 5 defaults supply queue/naming behavior before the Stage 7 settings UI exists. */
export const createSettingsRepository = (
  store: KeyValueStore,
  config: PublicAppConfig,
  clock: Clock = systemClock,
): LocalSettingsRepository => {
  const namespace = new VersionedStorageNamespace<LuffyflowSettings>({
    key: STORAGE_KEYS.settings,
    currentVersion: CURRENT_STORAGE_SCHEMA_VERSION,
    schema: luffyflowSettingsSchema,
    store,
    now: () => clock.now(),
  })
  return new LocalSettingsRepository(namespace, () => createDefaultSettings(config, clock.now()))
}

/** Creates a schema-validated settings document from public build-time defaults. */
const createDefaultSettings = (config: PublicAppConfig, now: Date): LuffyflowSettings =>
  luffyflowSettingsSchema.parse({
    schemaVersion: CURRENT_STORAGE_SCHEMA_VERSION,
    defaultPromptDelayMs: DEFAULT_PROMPT_DELAY_MS,
    maximumRetryCount: DEFAULT_MAXIMUM_RETRY_COUNT,
    defaultOutputFileFormat: "md",
    outputNamingPattern: DEFAULT_OUTPUT_NAMING_PATTERN,
    sequencePadding: DEFAULT_SEQUENCE_PADDING,
    sequenceScope: "global",
    autoSaveOutputs: true,
    autoDownloadOutputs: false,
    mediaDownloadLocation: "default",
    theme: "system",
    debugLogging: config.appEnvironment === "development",
    privacyMode: true,
    platformAdapters: {
      "google-flow": adapterDefaults(),
      gemini: adapterDefaults(),
      grok: adapterDefaults(),
      "meta-ai": adapterDefaults(),
    },
    updatedAt: now.toISOString(),
  })

/** Returns a fresh adapter policy so platforms never share a mutable settings object. */
const adapterDefaults = () => ({
  enabled: true,
  generationStartTimeoutMs: DEFAULT_GENERATION_START_TIMEOUT_MS,
  generationCompleteTimeoutMs: DEFAULT_GENERATION_COMPLETE_TIMEOUT_MS,
  selectorOverrides: {},
})
