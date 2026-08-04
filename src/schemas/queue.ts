import { z } from "zod"

import { entityIdSchema, isoDateTimeSchema, supportedPlatformSchema } from "./common"

export const queueRunStatusSchema = z.enum([
  "idle",
  "running",
  "paused",
  "paused_recovery",
  "stopping",
  "stopped",
  "completed",
  "failed",
])

/** Lease generations make stale content-script commands harmless after worker recovery. */
export const queueLeaseSchema = z.object({
  ownerId: z.string().min(1).max(128),
  generation: z.number().int().nonnegative(),
  acquiredAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
})

export const queueStateSchema = z.object({
  id: entityIdSchema,
  userId: entityIdSchema,
  sessionId: entityIdSchema,
  platform: supportedPlatformSchema,
  targetTabId: z.number().int().nonnegative().optional(),
  status: queueRunStatusSchema,
  promptIds: z.array(entityIdSchema).max(10_000),
  currentPromptId: entityIdSchema.optional(),
  activeCommandId: z.string().uuid().optional(),
  delayMs: z.number().int().min(1_000).max(3_600_000),
  lease: queueLeaseSchema.optional(),
  pauseReason: z.string().max(2_000).optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  revision: z.number().int().nonnegative(),
})

export const automationSessionSchema = z.object({
  id: entityIdSchema,
  userId: entityIdSchema,
  platform: supportedPlatformSchema,
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.optional(),
  promptsSent: z.number().int().nonnegative(),
  outputsSaved: z.number().int().nonnegative(),
})

export const sequenceCounterSchema = z.object({
  scopeKey: z.string().min(1).max(512),
  value: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  updatedAt: isoDateTimeSchema,
})

export type QueueRunStatus = z.infer<typeof queueRunStatusSchema>
export type QueueLease = z.infer<typeof queueLeaseSchema>
export type QueueState = z.infer<typeof queueStateSchema>
export type AutomationSession = z.infer<typeof automationSessionSchema>
export type SequenceCounter = z.infer<typeof sequenceCounterSchema>
