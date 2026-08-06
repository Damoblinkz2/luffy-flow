import * as z from "zod/v3"

import { entityIdSchema, isoDateTimeSchema } from "./common"
import { promptTextSchema } from "./prompt"

/** File imports use a closed format list and treat TXT as a first-class source. */
export const promptImportFormatSchema = z.enum(["text", "txt", "csv", "json"])

export const promptImportSourceSchema = z.object({
  format: promptImportFormatSchema,
  filename: z.string().min(1).max(255).optional(),
  byteSize: z
    .number()
    .int()
    .nonnegative()
    .max(2 * 1024 * 1024)
    .optional(),
  importedAt: isoDateTimeSchema,
})

export const importedPromptDraftSchema = z.object({
  clientId: entityIdSchema,
  text: promptTextSchema,
  source: promptImportSourceSchema,
  sourceRow: z.number().int().positive(),
  selected: z.boolean(),
})

export const promptImportIssueSchema = z.object({
  row: z.number().int().positive().optional(),
  field: z.string().min(1).max(100).optional(),
  code: z.enum([
    "unsupported_file_type",
    "file_too_large",
    "too_many_prompts",
    "invalid_encoding",
    "invalid_structure",
    "empty_prompt",
    "prompt_too_long",
  ]),
  message: z.string().min(1).max(2_000),
})

export const promptImportResultSchema = z.object({
  drafts: z.array(importedPromptDraftSchema).max(1_000),
  issues: z.array(promptImportIssueSchema).max(2_000),
  rejectedCount: z.number().int().nonnegative(),
})

/** JSON imports accept the documented shapes before normalization into drafts. */
const jsonPromptObjectSchema = z
  .object({
    prompt: promptTextSchema.optional(),
    text: promptTextSchema.optional(),
  })
  .refine((value) => value.prompt !== undefined || value.text !== undefined, {
    message: "A prompt object must contain a prompt or text field.",
  })

export const jsonPromptImportContentSchema = z.union([
  z.array(promptTextSchema).max(1_000),
  z.array(jsonPromptObjectSchema).max(1_000),
  z.object({ prompts: z.array(z.union([promptTextSchema, jsonPromptObjectSchema])).max(1_000) }),
])

export const promptImportOptionsSchema = z.object({
  maxFileBytes: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  maxPrompts: z.number().int().positive().max(10_000),
  maxPromptCharacters: z.number().int().positive().max(1_000_000),
  csvColumn: z.string().trim().min(1).max(100).optional(),
})

export type PromptImportFormat = z.infer<typeof promptImportFormatSchema>
export type PromptImportSource = z.infer<typeof promptImportSourceSchema>
export type ImportedPromptDraft = z.infer<typeof importedPromptDraftSchema>
export type PromptImportIssue = z.infer<typeof promptImportIssueSchema>
export type PromptImportResult = z.infer<typeof promptImportResultSchema>
export type JsonPromptImportContent = z.infer<typeof jsonPromptImportContentSchema>
export type PromptImportOptions = z.infer<typeof promptImportOptionsSchema>
