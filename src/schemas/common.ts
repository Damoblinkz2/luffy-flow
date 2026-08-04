import { z } from "zod"

/** Opaque UUIDs prevent accidental mixing with human-readable identifiers. */
export const entityIdSchema = z.string().uuid()

/** Persisted timestamps are UTC-compatible ISO strings, never locale-formatted text. */
export const isoDateTimeSchema = z.string().datetime({ offset: true })

/** Platforms are closed at runtime so unsupported pages cannot enter a queue. */
export const supportedPlatformSchema = z.enum(["google-flow", "gemini", "grok"])

/** Output kinds cover text and the media-oriented results produced by Google Flow. */
export const outputTypeSchema = z.enum(["text", "image", "video", "audio", "file", "unknown"])

/** Sync state is stored on mutable records even while remote sync is a placeholder. */
export const syncStatusSchema = z.enum(["local_only", "pending", "synced", "conflict", "failed"])

/** Pagination cursors remain opaque to callers and are bounded to avoid abusive requests. */
export const pageRequestSchema = z.object({
  cursor: z.string().min(1).max(2_048).optional(),
  limit: z.number().int().min(1).max(100).default(25),
})

/** A page can omit totals when computing a full count would be unnecessarily expensive. */
export const createPageResultSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().min(1).max(2_048).optional(),
    total: z.number().int().nonnegative().optional(),
  })

export type EntityId = z.infer<typeof entityIdSchema>
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>
export type SupportedPlatform = z.infer<typeof supportedPlatformSchema>
export type OutputType = z.infer<typeof outputTypeSchema>
export type SyncStatus = z.infer<typeof syncStatusSchema>
export type PageRequest = z.infer<typeof pageRequestSchema>
export interface PageResult<T> {
  items: T[]
  nextCursor?: string
  total?: number
}
