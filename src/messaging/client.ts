import type { z } from "zod"

import { LuffyflowError, toLuffyflowError } from "~/errors/luffyflow-error"
import {
  createMessageResponseSchema,
  type MessageKind,
  type MessagePayload,
  type MessageResponse,
  type MessageSource,
  type MessageTarget,
} from "~/schemas/messages"

import { createMessage } from "./envelope"
import type { MessageTransport } from "./runtime-transport"

/** Typed client validates both the outbound envelope and correlated response data. */
export class TypedMessageClient {
  /** Binds every outbound message to one source context and transport. */
  constructor(
    private readonly source: MessageSource,
    private readonly transport: MessageTransport,
  ) {}

  /** Builds, sends, correlates, validates, and unwraps one typed extension request. */
  async send<TKind extends MessageKind, TResponse>(options: {
    kind: TKind
    payload: MessagePayload<TKind>
    target: MessageTarget
    responseSchema: z.ZodType<TResponse>
  }): Promise<TResponse> {
    const message = createMessage({
      kind: options.kind,
      payload: options.payload,
      source: this.source,
      target: options.target,
    })

    try {
      const rawResponse = await this.transport.send(message)
      // Runtime parsing proves the union shape; the explicit contract restores generic narrowing
      // that Zod 3 cannot preserve through this dynamically constructed schema.
      const response = createMessageResponseSchema(options.responseSchema).parse(
        rawResponse,
      ) as MessageResponse<TResponse>
      if (!response.ok) {
        throw new LuffyflowError({
          code: response.error.code,
          category: response.error.category,
          userMessage: response.error.userMessage,
          recoverable: response.error.recoverable,
          correlationId: response.correlationId,
          ...(response.error.diagnosticMessage === undefined
            ? {}
            : { diagnosticMessage: response.error.diagnosticMessage }),
        })
      }
      return response.data
    } catch (error) {
      throw toLuffyflowError(error, {
        code: "MESSAGE_SEND_FAILED",
        category: "network",
        userMessage: "LuffyFlow could not communicate with another extension component.",
        correlationId: message.correlationId,
        recoverable: true,
        details: { kind: options.kind, target: options.target },
      })
    }
  }
}
