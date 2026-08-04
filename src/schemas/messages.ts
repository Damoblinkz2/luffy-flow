import { z } from "zod"

import { adapterHealthSchema, detectedOutputSchema } from "./adapter"
import { userSchema } from "./auth"
import { entityIdSchema, isoDateTimeSchema, supportedPlatformSchema } from "./common"
import { serializedAutoflowErrorSchema } from "./errors"
import { promptStatusSchema } from "./prompt"
import { queueStateSchema } from "./queue"
import { autoflowSettingsSchema, textExportFormatSchema } from "./settings"
import { usageSchema } from "./billing"

/** Every message includes version, routing, and correlation metadata before its payload. */
const messageMetadataShape = {
  version: z.literal(1),
  id: z.string().uuid(),
  correlationId: z.string().min(1).max(128),
  sentAt: isoDateTimeSchema,
  source: z.enum([
    "popup",
    "dashboard",
    "options",
    "sidepanel",
    "in_page_panel",
    "background",
    "content",
  ]),
  target: z.enum(["background", "content", "ui"]),
}

/** The factory keeps variant definitions uniform while preserving literal kind types. */
const createMessageSchema = <TKind extends string, TPayload extends z.ZodType>(
  kind: TKind,
  payload: TPayload,
) => z.object({ ...messageMetadataShape, kind: z.literal(kind), payload })

const messageErrorSchema = serializedAutoflowErrorSchema.pick({
  code: true,
  category: true,
  userMessage: true,
  diagnosticMessage: true,
  recoverable: true,
})

/** The discriminated union is the runtime trust boundary for extension messaging. */
export const extensionMessageSchema = z.discriminatedUnion("kind", [
  createMessageSchema("auth/status/get", z.object({}).strict()),
  createMessageSchema(
    "auth/status/changed",
    z.object({
      authenticated: z.boolean(),
      user: userSchema.pick({ id: true, email: true, displayName: true }).optional(),
    }),
  ),
  createMessageSchema(
    "platform/status/get",
    z.object({ tabId: z.number().int().nonnegative().optional() }),
  ),
  createMessageSchema(
    "platform/status/changed",
    z.object({
      tabId: z.number().int().nonnegative(),
      platform: supportedPlatformSchema.optional(),
      supported: z.boolean(),
      ready: z.boolean(),
      adapterHealth: adapterHealthSchema.optional(),
    }),
  ),
  createMessageSchema(
    "queue/create",
    z.object({
      platform: supportedPlatformSchema,
      promptTexts: z.array(z.string().trim().min(1).max(100_000)).min(1).max(1_000),
      delayMs: z.number().int().min(1_000).max(3_600_000),
      adapterVersion: z.string().min(1).max(64),
    }),
  ),
  createMessageSchema(
    "queue/prompts/add",
    z.object({
      queueId: entityIdSchema,
      expectedRevision: z.number().int().nonnegative(),
      promptTexts: z.array(z.string().trim().min(1).max(100_000)).min(1).max(1_000),
      adapterVersion: z.string().min(1).max(64),
    }),
  ),
  createMessageSchema(
    "queue/prompt/edit",
    z.object({ promptId: entityIdSchema, text: z.string().trim().min(1).max(100_000) }),
  ),
  createMessageSchema(
    "queue/prompt/remove",
    z.object({
      queueId: entityIdSchema,
      expectedRevision: z.number().int().nonnegative(),
      promptId: entityIdSchema,
    }),
  ),
  createMessageSchema(
    "queue/prompts/reorder",
    z.object({
      queueId: entityIdSchema,
      expectedRevision: z.number().int().nonnegative(),
      orderedPromptIds: z.array(entityIdSchema).max(10_000),
    }),
  ),
  createMessageSchema("queue/prompt/retry", z.object({ promptId: entityIdSchema })),
  createMessageSchema("queue/prompt/skip", z.object({ promptId: entityIdSchema })),
  createMessageSchema(
    "queue/start",
    z.object({
      queueId: entityIdSchema,
      tabId: z.number().int().nonnegative(),
      expectedRevision: z.number().int().nonnegative(),
    }),
  ),
  createMessageSchema(
    "queue/pause",
    z.object({
      queueId: entityIdSchema,
      expectedRevision: z.number().int().nonnegative(),
      reason: z.string().max(2_000).optional(),
    }),
  ),
  createMessageSchema(
    "queue/resume",
    z.object({
      queueId: entityIdSchema,
      tabId: z.number().int().nonnegative(),
      expectedRevision: z.number().int().nonnegative(),
    }),
  ),
  createMessageSchema(
    "queue/stop",
    z.object({ queueId: entityIdSchema, expectedRevision: z.number().int().nonnegative() }),
  ),
  createMessageSchema("queue/state/changed", z.object({ queue: queueStateSchema })),
  createMessageSchema(
    "prompt/submit",
    z.object({
      queueId: entityIdSchema,
      promptId: entityIdSchema,
      commandId: z.string().uuid(),
      promptText: z.string().trim().min(1).max(100_000),
      adapterId: supportedPlatformSchema,
      adapterVersion: z.string().min(1).max(64),
      tabId: z.number().int().nonnegative(),
      leaseGeneration: z.number().int().nonnegative(),
      previousOutputFingerprints: z.array(z.string().min(16).max(512)).max(10_000),
      generationStartTimeoutMs: z.number().int().min(5_000).max(300_000),
      generationCompleteTimeoutMs: z.number().int().min(10_000).max(1_800_000),
    }),
  ),
  createMessageSchema(
    "prompt/status/changed",
    z.object({
      promptId: entityIdSchema,
      status: promptStatusSchema,
      error: messageErrorSchema.optional(),
    }),
  ),
  createMessageSchema(
    "output/detected",
    z.object({
      eventId: z.string().uuid(),
      promptId: entityIdSchema,
      sessionId: entityIdSchema,
      detectedOutput: detectedOutputSchema,
    }),
  ),
  createMessageSchema(
    "output/rename",
    z.object({
      outputId: entityIdSchema,
      expectedRevision: z.number().int().nonnegative(),
      requestedName: z.string().trim().min(1).max(255),
    }),
  ),
  createMessageSchema(
    "download/request",
    z.object({
      outputIds: z.array(entityIdSchema).min(1).max(1_000),
      exportFormat: z.union([textExportFormatSchema, z.literal("native")]).optional(),
      archiveName: z.string().trim().min(1).max(255).optional(),
    }),
  ),
  createMessageSchema(
    "download/completed",
    z.object({ outputId: entityIdSchema, browserDownloadId: z.number().int().nonnegative() }),
  ),
  createMessageSchema(
    "download/failed",
    z.object({ outputId: entityIdSchema, error: messageErrorSchema }),
  ),
  createMessageSchema("settings/updated", z.object({ settings: autoflowSettingsSchema })),
  createMessageSchema("usage/updated", z.object({ usage: usageSchema })),
  createMessageSchema(
    "adapter/error",
    z.object({
      tabId: z.number().int().nonnegative(),
      promptId: entityIdSchema.optional(),
      error: messageErrorSchema,
    }),
  ),
  createMessageSchema(
    "command/cancel",
    z.object({ commandId: z.string().uuid(), reason: z.string().min(1).max(2_000) }),
  ),
])

/** Message responses never throw across a runtime boundary. */
export const createMessageResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), correlationId: z.string().min(1).max(128), data: dataSchema }),
    z.object({
      ok: z.literal(false),
      correlationId: z.string().min(1).max(128),
      error: messageErrorSchema,
    }),
  ])

export type ExtensionMessage = z.infer<typeof extensionMessageSchema>
export type MessageKind = ExtensionMessage["kind"]
export type MessageSource = ExtensionMessage["source"]
export type MessageTarget = ExtensionMessage["target"]
export type MessageOf<TKind extends MessageKind> = Extract<ExtensionMessage, { kind: TKind }>
export type MessagePayload<TKind extends MessageKind> = MessageOf<TKind>["payload"]
export type MessageResponse<T> =
  | { ok: true; correlationId: string; data: T }
  | { ok: false; correlationId: string; error: z.infer<typeof messageErrorSchema> }
