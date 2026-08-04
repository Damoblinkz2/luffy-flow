import type { ErrorCategory, SerializedAutoflowError } from "~/schemas/errors"
import { createCorrelationId } from "~/utils/ids"

export interface AutoflowErrorOptions {
  code: string
  category: ErrorCategory
  userMessage: string
  diagnosticMessage?: string
  recoverable?: boolean
  retryAfterMs?: number
  correlationId?: string
  details?: Record<string, unknown>
  cause?: unknown
}

/** One error class normalizes failures across storage, APIs, messaging, and adapters. */
export class AutoflowError extends Error {
  readonly code: string
  readonly category: ErrorCategory
  readonly userMessage: string
  readonly diagnosticMessage?: string
  readonly recoverable: boolean
  readonly retryAfterMs?: number
  readonly correlationId: string
  readonly details?: Record<string, unknown>

  constructor(options: AutoflowErrorOptions) {
    super(options.diagnosticMessage ?? options.userMessage, { cause: options.cause })
    this.name = "AutoflowError"
    this.code = options.code
    this.category = options.category
    this.userMessage = options.userMessage
    this.recoverable = options.recoverable ?? false
    this.correlationId = options.correlationId ?? createCorrelationId()

    if (options.diagnosticMessage !== undefined) this.diagnosticMessage = options.diagnosticMessage
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs
    if (options.details !== undefined) this.details = options.details
  }

  /** Serialization deliberately omits the native cause and stack trace. */
  toJSON(): SerializedAutoflowError {
    return {
      code: this.code,
      category: this.category,
      userMessage: this.userMessage,
      recoverable: this.recoverable,
      correlationId: this.correlationId,
      ...(this.diagnosticMessage === undefined
        ? {}
        : { diagnosticMessage: this.diagnosticMessage }),
      ...(this.retryAfterMs === undefined ? {} : { retryAfterMs: this.retryAfterMs }),
      ...(this.details === undefined ? {} : { details: this.details }),
    }
  }
}

/** Unknown thrown values become safe, user-facing errors at module boundaries. */
export const toAutoflowError = (
  error: unknown,
  fallback: Omit<AutoflowErrorOptions, "cause">,
): AutoflowError => {
  if (error instanceof AutoflowError) return error

  return new AutoflowError({
    ...fallback,
    diagnosticMessage:
      fallback.diagnosticMessage ??
      (error instanceof Error ? error.message : "A non-Error value was thrown."),
    cause: error,
  })
}
