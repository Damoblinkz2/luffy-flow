import * as z from "zod/v3"

import { isoDateTimeSchema } from "./common"

export const themePreferenceSchema = z.enum(["light", "dark", "system"])
export const sequenceScopeSchema = z.enum(["global", "platform", "day", "session"])
export const textExportFormatSchema = z.enum(["txt", "md", "json", "csv"])
/** Chrome can use its Downloads folder or show its secure folder picker for each media file. */
export const mediaDownloadLocationSchema = z.enum(["default", "choose_folder"])

/** Selector overrides are ordered fallbacks and never executable code. */
export const selectorOverridesSchema = z.record(
  z.string().min(1).max(100),
  z.array(z.string().min(1).max(1_000)).max(20),
)

export const platformAdapterSettingsSchema = z.object({
  enabled: z.boolean(),
  generationStartTimeoutMs: z.number().int().min(5_000).max(300_000),
  generationCompleteTimeoutMs: z.number().int().min(10_000).max(1_800_000),
  selectorOverrides: selectorOverridesSchema,
})

/** New adapters receive safe defaults when older version-one settings are read. */
const defaultPlatformAdapterSettings = {
  enabled: true,
  generationStartTimeoutMs: 30_000,
  generationCompleteTimeoutMs: 600_000,
  selectorOverrides: {},
} as const

/** Settings defaults are applied by a service so migrations can distinguish missing values. */
export const luffyflowSettingsSchema = z.object({
  schemaVersion: z.number().int().positive(),
  defaultPromptDelayMs: z.number().int().min(1_000).max(3_600_000),
  maximumRetryCount: z.number().int().min(0).max(10),
  defaultOutputFileFormat: textExportFormatSchema,
  outputNamingPattern: z.string().min(1).max(255),
  sequencePadding: z.number().int().min(1).max(12),
  sequenceScope: sequenceScopeSchema,
  autoSaveOutputs: z.boolean(),
  autoDownloadOutputs: z.boolean(),
  // Defaults preserve existing installations while allowing people to opt in to
  // Chrome's Save As picker for image, video, audio, and file downloads.
  mediaDownloadLocation: mediaDownloadLocationSchema.default("default"),
  theme: themePreferenceSchema,
  debugLogging: z.boolean(),
  privacyMode: z.boolean(),
  platformAdapters: z.object({
    "google-flow": platformAdapterSettingsSchema,
    gemini: platformAdapterSettingsSchema,
    grok: platformAdapterSettingsSchema,
    "meta-ai": platformAdapterSettingsSchema.default(defaultPlatformAdapterSettings),
  }),
  updatedAt: isoDateTimeSchema,
})

export type ThemePreference = z.infer<typeof themePreferenceSchema>
export type SequenceScope = z.infer<typeof sequenceScopeSchema>
export type TextExportFormat = z.infer<typeof textExportFormatSchema>
export type MediaDownloadLocation = z.infer<typeof mediaDownloadLocationSchema>
export type PlatformAdapterSettings = z.infer<typeof platformAdapterSettingsSchema>
export type LuffyflowSettingsInput = z.input<typeof luffyflowSettingsSchema>
export type LuffyflowSettings = z.infer<typeof luffyflowSettingsSchema>
