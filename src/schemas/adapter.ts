import * as z from "zod/v3"

import { isoDateTimeSchema, outputTypeSchema, supportedPlatformSchema } from "./common"
import { outputMediaMetadataSchema } from "./output"

export const adapterErrorCodeSchema = z.enum([
  "page_not_ready",
  "selector_not_found",
  "input_unavailable",
  "generation_in_progress",
  "submission_failed",
  "generation_start_timeout",
  "generation_complete_timeout",
  "output_not_found",
  "rate_limited",
  "service_unavailable",
  "navigation_changed",
  "aborted",
])

export const pageReadinessSchema = z.enum([
  "ready",
  "loading",
  "authentication_required",
  "generation_in_progress",
  "rate_limited",
  "service_unavailable",
  "unsupported",
])

export const pageStateSchema = z.object({
  readiness: pageReadinessSchema,
  url: z.string().url().max(16_384),
  routeKey: z.string().min(1).max(2_048),
  generationInProgress: z.boolean(),
  detectedAt: isoDateTimeSchema,
})

/** Adapter health exposes selector diagnostics without including prompt content. */
export const adapterHealthSchema = z.object({
  adapterId: supportedPlatformSchema,
  adapterVersion: z.string().min(1).max(64),
  status: z.enum(["healthy", "degraded", "unavailable"]),
  checkedAt: isoDateTimeSchema,
  selectorChecks: z.array(
    z.object({
      key: z.string().min(1).max(100),
      found: z.boolean(),
      matchedFallbackIndex: z.number().int().nonnegative().optional(),
    }),
  ),
  warnings: z.array(z.string().max(2_000)).max(100),
})

/** Platform status is safe for UI surfaces because it excludes page text and selector strings. */
export const platformStatusSnapshotSchema = z.object({
  tabId: z.number().int().nonnegative(),
  platform: supportedPlatformSchema.optional(),
  supported: z.boolean(),
  ready: z.boolean(),
  adapterHealth: adapterHealthSchema.optional(),
})

/** Detected output is the only page-derived data allowed across the runtime boundary. */
export const detectedOutputSchema = z.object({
  type: outputTypeSchema,
  detectedTitle: z.string().max(1_000).optional(),
  textContent: z.string().max(5_000_000).optional(),
  sourceUrl: z.string().url().max(16_384).optional(),
  thumbnailUrl: z.string().url().max(16_384).optional(),
  mimeType: z.string().min(1).max(255).optional(),
  fileExtension: z
    .string()
    .regex(/^\.[a-z0-9]{1,16}$/i)
    .optional(),
  metadata: outputMediaMetadataSchema,
  platformOutputId: z.string().min(1).max(512).optional(),
  fingerprintSource: z.string().min(1).max(16_384),
  detectedAt: isoDateTimeSchema,
})

export type AdapterErrorCode = z.infer<typeof adapterErrorCodeSchema>
export type PageReadiness = z.infer<typeof pageReadinessSchema>
export type PageState = z.infer<typeof pageStateSchema>
export type AdapterHealth = z.infer<typeof adapterHealthSchema>
export type PlatformStatusSnapshot = z.infer<typeof platformStatusSnapshotSchema>
export type DetectedOutput = z.infer<typeof detectedOutputSchema>
