import type { Clock } from "~/utils/time"
import { systemClock } from "~/utils/time"
import { redactForLogging } from "~/utils/redaction"

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogEntry {
  timestamp: string
  level: LogLevel
  scope: string
  message: string
  correlationId?: string
  sessionId?: string
  metadata?: unknown
}

export interface LogSink {
  write(entry: LogEntry): void
}

export interface LoggerOptions {
  minimumLevel: LogLevel
  privacyMode: boolean
  sink?: LogSink
  clock?: Clock
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

/** The console sink is replaceable, which keeps tests deterministic and production extensible. */
export class ConsoleLogSink implements LogSink {
  write(entry: LogEntry): void {
    const target = globalThis.console
    target[entry.level](entry)
  }
}

/** Scoped structured logging applies redaction before any sink receives metadata. */
export class Logger {
  private readonly sink: LogSink
  private readonly clock: Clock

  constructor(
    private readonly scope: string,
    private readonly options: LoggerOptions,
  ) {
    this.sink = options.sink ?? new ConsoleLogSink()
    this.clock = options.clock ?? systemClock
  }

  debug(message: string, metadata?: unknown, context?: LogContext): void {
    this.write("debug", message, metadata, context)
  }

  info(message: string, metadata?: unknown, context?: LogContext): void {
    this.write("info", message, metadata, context)
  }

  warn(message: string, metadata?: unknown, context?: LogContext): void {
    this.write("warn", message, metadata, context)
  }

  error(message: string, metadata?: unknown, context?: LogContext): void {
    this.write("error", message, metadata, context)
  }

  child(childScope: string): Logger {
    return new Logger(`${this.scope}:${childScope}`, this.options)
  }

  private write(level: LogLevel, message: string, metadata?: unknown, context?: LogContext): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.options.minimumLevel]) return

    this.sink.write({
      timestamp: this.clock.now().toISOString(),
      level,
      scope: this.scope,
      message,
      ...(context?.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      ...(context?.sessionId === undefined ? {} : { sessionId: context.sessionId }),
      ...(metadata === undefined
        ? {}
        : { metadata: redactForLogging(metadata, { privacyMode: this.options.privacyMode }) }),
    })
  }
}

export interface LogContext {
  correlationId?: string
  sessionId?: string
}
