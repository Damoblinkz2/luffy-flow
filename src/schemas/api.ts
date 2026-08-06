import * as z from "zod/v3"

import { isoDateTimeSchema } from "./common"
import { promptRecordSchema } from "./prompt"
import { outputRecordSchema } from "./output"
import { luffyflowSettingsSchema } from "./settings"

/** Public environment values are validated before they configure any transport. */
export const appEnvironmentSchema = z.enum(["development", "test", "production"])

/** Sync batches include client revisions so a backend can detect conflicts safely. */
export const syncBatchSchema = z.object({
  clientId: z.string().min(1).max(128),
  requestedAt: isoDateTimeSchema,
  prompts: z.array(promptRecordSchema).max(1_000),
  outputs: z.array(outputRecordSchema).max(1_000),
  settings: luffyflowSettingsSchema.optional(),
})

export const syncBatchResultSchema = z.object({
  acceptedPromptIds: z.array(z.string().uuid()),
  acceptedOutputIds: z.array(z.string().uuid()),
  conflicts: z.array(
    z.object({
      entityType: z.enum(["prompt", "output", "settings"]),
      entityId: z.string().uuid(),
      remoteRevision: z.number().int().nonnegative(),
    }),
  ),
  serverTime: isoDateTimeSchema,
})

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>
export type SyncBatch = z.infer<typeof syncBatchSchema>
export type SyncBatchResult = z.infer<typeof syncBatchResultSchema>
