const ALWAYS_SENSITIVE_KEY =
  /^(accessToken|refreshToken|password|authorization|cookie|set-cookie|clientSecret|apiKey)$/i
const PRIVATE_CONTENT_KEY = /^(prompt|promptText|textContent|outputContent)$/i
const MAX_LOG_STRING_LENGTH = 4_000

export interface RedactionOptions {
  privacyMode: boolean
  maxDepth?: number
}

/** Redaction traverses metadata defensively and never mutates the caller's object. */
export const redactForLogging = (value: unknown, options: RedactionOptions): unknown => {
  const seen = new WeakSet()
  const maxDepth = options.maxDepth ?? 8

  const visit = (candidate: unknown, depth: number, key?: string): unknown => {
    if (key !== undefined && ALWAYS_SENSITIVE_KEY.test(key)) return "[REDACTED]"
    if (options.privacyMode && key !== undefined && PRIVATE_CONTENT_KEY.test(key)) {
      return "[REDACTED: privacy mode]"
    }
    if (typeof candidate === "string") {
      return candidate.length > MAX_LOG_STRING_LENGTH
        ? `${candidate.slice(0, MAX_LOG_STRING_LENGTH)}…[truncated]`
        : candidate
    }
    if (candidate === null || typeof candidate !== "object") return candidate
    if (depth >= maxDepth) return "[REDACTED: maximum depth]"
    if (seen.has(candidate)) return "[Circular]"
    seen.add(candidate)

    if (candidate instanceof Error) {
      return { name: candidate.name, message: candidate.message }
    }
    if (Array.isArray(candidate)) {
      return candidate.map((item) => visit(item, depth + 1))
    }

    return Object.fromEntries(
      Object.entries(candidate).map(([entryKey, entryValue]) => [
        entryKey,
        visit(entryValue, depth + 1, entryKey),
      ]),
    )
  }

  return visit(value, 0)
}
