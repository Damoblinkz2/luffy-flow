import { z } from "zod"

/** Stable categories let UI surfaces choose recovery actions without parsing messages. */
export const errorCategorySchema = z.enum([
  "authentication",
  "authorization",
  "subscription",
  "usage_limit",
  "network",
  "timeout",
  "platform_unsupported",
  "selector_not_found",
  "prompt_input_unavailable",
  "submission_failure",
  "generation_timeout",
  "output_detection_failure",
  "download_failure",
  "storage_failure",
  "invalid_data",
  "unknown",
])

/** Serializable errors exclude native causes and sensitive request details. */
export const serializedLuffyflowErrorSchema = z.object({
  code: z.string().min(1).max(128),
  category: errorCategorySchema,
  userMessage: z.string().min(1).max(2_000),
  diagnosticMessage: z.string().max(8_000).optional(),
  recoverable: z.boolean(),
  retryAfterMs: z.number().int().nonnegative().max(86_400_000).optional(),
  correlationId: z.string().min(1).max(128),
  details: z.record(z.string(), z.unknown()).optional(),
})

/** API error bodies use the same model but may omit a client-generated correlation ID. */
export const apiErrorBodySchema = z.object({
  code: z.string().min(1).max(128),
  category: errorCategorySchema.optional(),
  message: z.string().min(1).max(2_000),
  details: z.record(z.string(), z.unknown()).optional(),
  retryAfterMs: z.number().int().nonnegative().max(86_400_000).optional(),
})

export type ErrorCategory = z.infer<typeof errorCategorySchema>
export type SerializedLuffyflowError = z.infer<typeof serializedLuffyflowErrorSchema>
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>
