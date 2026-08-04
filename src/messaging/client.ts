import type { z } from "zod"

import { AutoflowError, toAutoflowError } from "~/errors/autoflow-error"
import {
  createMessageResponseSchema,
  type MessageKind,
  type MessagePayload,
  type MessageSource,
  type MessageTarget,
} from "~/schemas/messages"

import { createMessage } from "./envelope"
import type { MessageTransport } from "./runtime-transport"

/** Typed client validates both the outbound envelope and correlated response data. */
export class TypedMessageClient {
  constructor(
    private readonly source: MessageSource,
    private readonly transport: MessageTransport,
  ) {}

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
      const response = createMessageResponseSchema(options.responseSchema).parse(rawResponse)
      if (!response.ok) {
        throw new AutoflowError({
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
      throw toAutoflowError(error, {
        code: "MESSAGE_SEND_FAILED",
        category: "network",
        userMessage: "AutoFlow could not communicate with another extension component.",
        correlationId: message.correlationId,
        recoverable: true,
        details: { kind: options.kind, target: options.target },
      })
    }
  }
}
