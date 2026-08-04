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
import { autoflowSettingsSchema, type AutoflowSettings } from "~/schemas"
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
  const namespace = new VersionedStorageNamespace<AutoflowSettings>({
    key: STORAGE_KEYS.settings,
    currentVersion: CURRENT_STORAGE_SCHEMA_VERSION,
    schema: autoflowSettingsSchema,
    store,
    now: () => clock.now(),
  })
  return new LocalSettingsRepository(namespace, () => createDefaultSettings(config, clock.now()))
}

const createDefaultSettings = (config: PublicAppConfig, now: Date): AutoflowSettings =>
  autoflowSettingsSchema.parse({
    schemaVersion: CURRENT_STORAGE_SCHEMA_VERSION,
    defaultPromptDelayMs: DEFAULT_PROMPT_DELAY_MS,
    maximumRetryCount: DEFAULT_MAXIMUM_RETRY_COUNT,
    defaultOutputFileFormat: "md",
    outputNamingPattern: DEFAULT_OUTPUT_NAMING_PATTERN,
    sequencePadding: DEFAULT_SEQUENCE_PADDING,
    sequenceScope: "global",
    autoSaveOutputs: true,
    autoDownloadOutputs: false,
    theme: "system",
    useMockApi: config.useMockApi,
    backendBaseUrl: config.apiBaseUrl,
    debugLogging: config.appEnvironment === "development",
    privacyMode: true,
    platformAdapters: {
      "google-flow": adapterDefaults(),
      gemini: adapterDefaults(),
      grok: adapterDefaults(),
    },
    updatedAt: now.toISOString(),
  })

const adapterDefaults = () => ({
  enabled: true,
  generationStartTimeoutMs: DEFAULT_GENERATION_START_TIMEOUT_MS,
  generationCompleteTimeoutMs: DEFAULT_GENERATION_COMPLETE_TIMEOUT_MS,
  selectorOverrides: {},
})
