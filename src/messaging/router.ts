import { AutoflowError, toAutoflowError } from "~/errors/autoflow-error"
import {
  extensionMessageSchema,
  type ExtensionMessage,
  type MessageKind,
  type MessageOf,
  type MessageResponse,
  type MessageSource,
  type MessageTarget,
} from "~/schemas/messages"
import { createCorrelationId } from "~/utils/ids"

type Handler<TKind extends MessageKind> = (
  message: MessageOf<TKind>,
  sender: chrome.runtime.MessageSender,
) => unknown

interface RegisteredHandler {
  allowedSources: ReadonlySet<MessageSource>
  invoke(message: ExtensionMessage, sender: chrome.runtime.MessageSender): Promise<unknown>
}

/** The router validates unknown runtime input before dispatch and enforces source allowlists. */
export class TypedMessageRouter {
  private readonly handlers = new Map<MessageKind, RegisteredHandler>()

  constructor(private readonly target: MessageTarget) {}

  register<TKind extends MessageKind>(
    kind: TKind,
    allowedSources: readonly MessageSource[],
    handler: Handler<TKind>,
  ): () => void {
    if (this.handlers.has(kind)) {
      throw new AutoflowError({
        code: "MESSAGE_HANDLER_DUPLICATE",
        category: "invalid_data",
        userMessage: "An AutoFlow message handler was registered twice.",
        diagnosticMessage: kind,
      })
    }

    this.handlers.set(kind, {
      allowedSources: new Set(allowedSources),
      invoke: (message, sender) => {
        if (message.kind !== kind) {
          throw new AutoflowError({
            code: "MESSAGE_KIND_MISMATCH",
            category: "invalid_data",
            userMessage: "AutoFlow received a mismatched message.",
          })
        }
        return Promise.resolve(handler(message as MessageOf<TKind>, sender))
      },
    })
    return () => this.handlers.delete(kind)
  }

  async route(
    rawMessage: unknown,
    sender: chrome.runtime.MessageSender,
  ): Promise<MessageResponse<unknown>> {
    const parsed = extensionMessageSchema.safeParse(rawMessage)
    if (!parsed.success) {
      const correlationId = createCorrelationId()
      return this.failure(
        correlationId,
        new AutoflowError({
          code: "MESSAGE_INVALID",
          category: "invalid_data",
          userMessage: "AutoFlow rejected an invalid extension message.",
          diagnosticMessage: parsed.error.message,
          correlationId,
        }),
      )
    }

    const message = parsed.data
    if (!this.isSenderConsistent(message.source, sender)) {
      return this.failure(
        message.correlationId,
        new AutoflowError({
          code: "MESSAGE_SENDER_INVALID",
          category: "authorization",
          userMessage: "AutoFlow rejected a message from an invalid sender context.",
          correlationId: message.correlationId,
        }),
      )
    }
    if (message.target !== this.target) {
      return this.failure(
        message.correlationId,
        new AutoflowError({
          code: "MESSAGE_WRONG_TARGET",
          category: "authorization",
          userMessage: "The extension message was sent to the wrong component.",
          correlationId: message.correlationId,
        }),
      )
    }

    const registration = this.handlers.get(message.kind)
    if (registration === undefined) {
      return this.failure(
        message.correlationId,
        new AutoflowError({
          code: "MESSAGE_HANDLER_MISSING",
          category: "invalid_data",
          userMessage: "This extension action is not available here.",
          correlationId: message.correlationId,
        }),
      )
    }
    if (!registration.allowedSources.has(message.source)) {
      return this.failure(
        message.correlationId,
        new AutoflowError({
          code: "MESSAGE_SOURCE_FORBIDDEN",
          category: "authorization",
          userMessage: "This extension component cannot perform that action.",
          correlationId: message.correlationId,
        }),
      )
    }

    try {
      return {
        ok: true,
        correlationId: message.correlationId,
        data: await registration.invoke(message, sender),
      }
    } catch (error) {
      return this.failure(
        message.correlationId,
        toAutoflowError(error, {
          code: "MESSAGE_HANDLER_FAILED",
          category: "unknown",
          userMessage: "AutoFlow could not complete the extension action.",
          correlationId: message.correlationId,
        }),
      )
    }
  }

  /** Sender metadata prevents a content script from claiming to be a privileged UI or worker. */
  private isSenderConsistent(source: MessageSource, sender: chrome.runtime.MessageSender): boolean {
    if (sender.id !== chrome.runtime.id) return false
    if (source === "content" || source === "in_page_panel") return sender.tab?.id !== undefined
    if (source === "background") return sender.tab === undefined

    const senderUrl = sender.url
    return (
      sender.tab === undefined &&
      senderUrl !== undefined &&
      senderUrl.startsWith(chrome.runtime.getURL(""))
    )
  }

  private failure(correlationId: string, error: AutoflowError): MessageResponse<never> {
    const serialized = error.toJSON()
    return {
      ok: false,
      correlationId,
      error: {
        code: serialized.code,
        category: serialized.category,
        userMessage: serialized.userMessage,
        recoverable: serialized.recoverable,
        ...(serialized.diagnosticMessage === undefined
          ? {}
          : { diagnosticMessage: serialized.diagnosticMessage }),
      },
    }
  }
}
