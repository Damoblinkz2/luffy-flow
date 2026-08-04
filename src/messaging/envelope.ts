import {
  extensionMessageSchema,
  type MessageKind,
  type MessageOf,
  type MessagePayload,
  type MessageSource,
  type MessageTarget,
} from "~/schemas/messages"
import { createCorrelationId, createId } from "~/utils/ids"

/** Message creation validates outbound payloads just as strictly as inbound messages. */
export const createMessage = <TKind extends MessageKind>(options: {
  kind: TKind
  payload: MessagePayload<TKind>
  source: MessageSource
  target: MessageTarget
  correlationId?: string
}): MessageOf<TKind> => {
  const candidate: unknown = {
    version: 1,
    id: createId(),
    correlationId: options.correlationId ?? createCorrelationId(),
    sentAt: new Date().toISOString(),
    source: options.source,
    target: options.target,
    kind: options.kind,
    payload: options.payload,
  }
  const parsed = extensionMessageSchema.parse(candidate)
  if (parsed.kind !== options.kind) {
    throw new Error("The validated message kind did not match the requested kind.")
  }
  return parsed as MessageOf<TKind>
}
