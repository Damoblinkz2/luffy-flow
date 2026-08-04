import { z } from "zod"

import {
  entityIdSchema,
  isoDateTimeSchema,
  supportedPlatformSchema,
  syncStatusSchema,
} from "./common"

/** Prompt text accepts multiline content while enforcing a storage and UI safety bound. */
export const promptTextSchema = z.string().trim().min(1).max(100_000)

/** Status values form the state machine implemented by the queue service in Stage 5. */
export const promptStatusSchema = z.enum([
  "draft",
  "queued",
  "sending",
  "waiting_for_output",
  "completed",
  "failed",
  "skipped",
  "cancelled",
])

export const promptRecordSchema = z.object({
  id: entityIdSchema,
  userId: entityIdSchema,
  platform: supportedPlatformSchema,
  text: promptTextSchema,
  queuePosition: z.number().int().nonnegative(),
  status: promptStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  submittedAt: isoDateTimeSchema.optional(),
  completedAt: isoDateTimeSchema.optional(),
  retryCount: z.number().int().nonnegative(),
  errorCode: z.string().min(1).max(128).optional(),
  errorMessage: z.string().min(1).max(2_000).optional(),
  outputIds: z.array(entityIdSchema),
  sessionId: entityIdSchema,
  adapterVersion: z.string().min(1).max(64),
  revision: z.number().int().nonnegative(),
  syncStatus: syncStatusSchema,
})

/** History filters are validated before repositories or remote APIs receive them. */
export const promptFiltersSchema = z.object({
  search: z.string().trim().max(500).optional(),
  platform: z.array(supportedPlatformSchema).max(3).optional(),
  status: z.array(promptStatusSchema).max(8).optional(),
  sessionId: entityIdSchema.optional(),
  createdFrom: isoDateTimeSchema.optional(),
  createdTo: isoDateTimeSchema.optional(),
  sort: z.enum(["created_desc", "created_asc", "platform"]).optional(),
})

export type PromptStatus = z.infer<typeof promptStatusSchema>
export type PromptRecord = z.infer<typeof promptRecordSchema>
export type PromptFilters = z.infer<typeof promptFiltersSchema>
