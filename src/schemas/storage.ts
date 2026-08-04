import { z } from "zod"

import { entityIdSchema, isoDateTimeSchema, syncStatusSchema } from "./common"

/** Sync metadata is separate from domain records so retries do not rewrite user data. */
export const syncMetadataSchema = z.object({
  entityType: z.enum(["prompt", "output", "settings"]),
  entityId: entityIdSchema,
  localRevision: z.number().int().nonnegative(),
  remoteRevision: z.number().int().nonnegative().optional(),
  status: syncStatusSchema,
  lastAttemptAt: isoDateTimeSchema.optional(),
  lastSyncedAt: isoDateTimeSchema.optional(),
})

/** Stored envelopes carry their schema version independently from entity revisions. */
export const storedEnvelopeSchema = z.object({
  schemaVersion: z.number().int().positive(),
  value: z.unknown(),
  updatedAt: isoDateTimeSchema,
})

export type SyncMetadata = z.infer<typeof syncMetadataSchema>
export type StoredEnvelope = z.infer<typeof storedEnvelopeSchema>
