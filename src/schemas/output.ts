import * as z from "zod/v3"

import {
  entityIdSchema,
  isoDateTimeSchema,
  outputTypeSchema,
  supportedPlatformSchema,
  syncStatusSchema,
} from "./common"
import { errorCategorySchema } from "./errors"

/** Media metadata remains extensible while common dimensions receive strict validation. */
export const outputMediaMetadataSchema = z
  .object({
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationSeconds: z.number().nonnegative().optional(),
    fileSizeBytes: z.number().int().nonnegative().optional(),
    generationTimestamp: isoDateTimeSchema.optional(),
  })
  .catchall(z.unknown())

export const downloadStatusSchema = z.enum([
  "not_requested",
  "queued",
  "downloading",
  "completed",
  "failed",
])

/** Persisted output errors are intentionally smaller than internal diagnostic errors. */
export const outputErrorSchema = z.object({
  code: z.string().min(1).max(128),
  category: errorCategorySchema,
  userMessage: z.string().min(1).max(2_000),
})

export const outputRecordSchema = z.object({
  id: entityIdSchema,
  promptId: entityIdSchema,
  userId: entityIdSchema,
  platform: supportedPlatformSchema,
  outputType: outputTypeSchema,
  originalDetectedTitle: z.string().max(1_000).optional(),
  userDefinedName: z.string().max(255).optional(),
  sequenceNumber: z.number().int().positive(),
  generatedFilename: z.string().min(1).max(255),
  textContent: z.string().max(5_000_000).optional(),
  sourceUrl: z.string().url().max(16_384).optional(),
  thumbnailUrl: z.string().url().max(16_384).optional(),
  mimeType: z.string().min(1).max(255).optional(),
  fileExtension: z
    .string()
    .regex(/^\.[a-z0-9]{1,16}$/i)
    .optional(),
  metadata: outputMediaMetadataSchema,
  fingerprint: z.string().min(16).max(512),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  downloadStatus: downloadStatusSchema,
  downloadedAt: isoDateTimeSchema.optional(),
  error: outputErrorSchema.optional(),
  sessionId: entityIdSchema,
  revision: z.number().int().nonnegative(),
  syncStatus: syncStatusSchema,
})

export const outputFiltersSchema = z.object({
  search: z.string().trim().max(500).optional(),
  platform: z.array(supportedPlatformSchema).max(3).optional(),
  outputType: z.array(outputTypeSchema).max(6).optional(),
  sessionId: entityIdSchema.optional(),
  createdFrom: isoDateTimeSchema.optional(),
  createdTo: isoDateTimeSchema.optional(),
  sort: z.enum(["created_desc", "created_asc", "platform", "sequence"]).optional(),
})

export type OutputMediaMetadata = z.infer<typeof outputMediaMetadataSchema>
export type DownloadStatus = z.infer<typeof downloadStatusSchema>
export type OutputRecord = z.infer<typeof outputRecordSchema>
export type OutputFilters = z.infer<typeof outputFiltersSchema>
