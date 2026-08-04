import type { z } from "zod"

import { AutoflowError, toAutoflowError } from "~/errors/autoflow-error"
import { apiErrorBodySchema } from "~/schemas/errors"
import { createCorrelationId } from "~/utils/ids"
import { delay } from "~/utils/time"

import type {
  ApiClientOptions,
  ApiRequest,
  TransportRequest,
  TransportResponse,
  TypedApiClient,
} from "./contracts"

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])

/** The API client centralizes auth, serialization, runtime validation, and safe retry policy. */
export class ApiClient implements TypedApiClient {
  private readonly random: () => number

  constructor(private readonly options: ApiClientOptions) {
    this.random = options.random ?? Math.random
  }

  async request<TResponse, TBody = unknown>(
    request: ApiRequest<TBody>,
    responseSchema: z.ZodType<TResponse>,
  ): Promise<TResponse> {
    const correlationId = createCorrelationId()
    const canRetry = this.canRetry(request)
    const maximumAttempts = canRetry ? this.options.maximumSafeRetryCount + 1 : 1
    let refreshAttempted = false

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      const attemptController = this.createAttemptController(
        request.signal,
        request.timeoutMs ?? this.options.defaultTimeoutMs,
      )

      try {
        const response = await this.options.transport.execute(
          await this.createTransportRequest(request, correlationId, attemptController.signal),
        )

        if (
          response.status === 401 &&
          request.authentication !== "omit" &&
          !refreshAttempted &&
          this.options.tokenProvider !== undefined
        ) {
          refreshAttempted = true
          const refreshedToken = await this.options.tokenProvider.refreshAccessToken()
          if (refreshedToken !== null) {
            // Refresh replays the same logical attempt and does not grant an unsafe mutation a retry budget.
            attempt -= 1
            attemptController.cleanup()
            continue
          }
        }

        if (response.status < 200 || response.status >= 300) {
          const error = this.createResponseError(response, correlationId)
          if (attempt < maximumAttempts && RETRYABLE_STATUS_CODES.has(response.status)) {
            await this.waitBeforeRetry(attempt, error.retryAfterMs, request.signal)
            continue
          }
          throw error
        }

        const decodedBody = this.decodeBody(response)
        const parsed = responseSchema.safeParse(decodedBody)
        if (!parsed.success) {
          throw new AutoflowError({
            code: "API_RESPONSE_INVALID",
            category: "invalid_data",
            userMessage: "AutoFlow received an invalid response from the service.",
            diagnosticMessage: parsed.error.message,
            correlationId,
            details: { status: response.status, path: request.path },
          })
        }

        this.options.logger.debug(
          "API request completed.",
          { method: request.method, path: request.path, status: response.status, attempt },
          { correlationId },
        )
        return parsed.data
      } catch (error) {
        const normalized = this.normalizeRequestError(
          error,
          request,
          correlationId,
          attemptController.signal,
        )
        if (attempt < maximumAttempts && normalized.category === "network") {
          await this.waitBeforeRetry(attempt, normalized.retryAfterMs, request.signal)
          continue
        }
        throw normalized
      } finally {
        attemptController.cleanup()
      }
    }

    throw new AutoflowError({
      code: "API_RETRY_EXHAUSTED",
      category: "network",
      userMessage: "AutoFlow could not reach the service after several attempts.",
      correlationId,
      recoverable: true,
    })
  }

  /** GET is inherently retryable; mutations require both opt-in and an idempotency key. */
  private canRetry<TBody>(request: ApiRequest<TBody>): boolean {
    if (request.retry === "never") return false
    if (request.method === "GET") return true
    return request.retry === "safe" && request.idempotencyKey !== undefined
  }

  private async createTransportRequest<TBody>(
    request: ApiRequest<TBody>,
    correlationId: string,
    signal: AbortSignal,
  ): Promise<TransportRequest> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Correlation-ID": correlationId,
      ...request.headers,
    }

    if (request.body !== undefined) headers["Content-Type"] = "application/json"
    if (request.idempotencyKey !== undefined) headers["Idempotency-Key"] = request.idempotencyKey

    const accessToken =
      request.authentication === "omit" ? null : await this.options.tokenProvider?.getAccessToken()
    if (accessToken !== undefined && accessToken !== null) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    return {
      method: request.method,
      url: this.createUrl(request.path, request.query),
      headers,
      signal,
      ...(request.body === undefined ? {} : { bodyText: JSON.stringify(request.body) }),
    }
  }

  /** Paths remain relative to the configured API origin and cannot replace its host. */
  private createUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`
    const url = new URL(normalizedPath, `${this.options.baseUrl.replace(/\/+$/, "")}/`)
    if (url.origin !== new URL(this.options.baseUrl).origin) {
      throw new AutoflowError({
        code: "API_PATH_INVALID",
        category: "invalid_data",
        userMessage: "The API request path is invalid.",
      })
    }

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
    return url.toString()
  }

  private decodeBody(response: TransportResponse): unknown {
    if (response.status === 204 || response.bodyText.trim() === "") return undefined
    try {
      return JSON.parse(response.bodyText) as unknown
    } catch (error) {
      throw new AutoflowError({
        code: "API_RESPONSE_NOT_JSON",
        category: "invalid_data",
        userMessage: "AutoFlow received an unreadable response from the service.",
        diagnosticMessage: "The response body was not valid JSON.",
        cause: error,
      })
    }
  }

  private createResponseError(response: TransportResponse, correlationId: string): AutoflowError {
    const parsedBody = (() => {
      try {
        return apiErrorBodySchema.safeParse(JSON.parse(response.bodyText) as unknown)
      } catch {
        return apiErrorBodySchema.safeParse(undefined)
      }
    })()
    const retryAfterMs = this.readRetryAfterMs(response.headers)

    return new AutoflowError({
      code: parsedBody.success ? parsedBody.data.code : `HTTP_${response.status}`,
      category:
        parsedBody.success && parsedBody.data.category !== undefined
          ? parsedBody.data.category
          : this.categoryForStatus(response.status),
      userMessage: parsedBody.success
        ? parsedBody.data.message
        : "AutoFlow could not complete the service request.",
      diagnosticMessage: `The API returned HTTP ${response.status}.`,
      correlationId,
      recoverable: RETRYABLE_STATUS_CODES.has(response.status),
      ...(parsedBody.success && parsedBody.data.details !== undefined
        ? { details: parsedBody.data.details }
        : {}),
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    })
  }

  private categoryForStatus(
    status: number,
  ): "authentication" | "authorization" | "network" | "unknown" {
    if (status === 401) return "authentication"
    if (status === 403) return "authorization"
    if (status === 408 || status === 429 || status >= 500) return "network"
    return "unknown"
  }

  private readRetryAfterMs(headers: Record<string, string>): number | undefined {
    const value = headers["retry-after"] ?? headers["Retry-After"]
    if (value === undefined) return undefined
    const seconds = Number(value)
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000)
    const date = Date.parse(value)
    return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
  }

  private normalizeRequestError<TBody>(
    error: unknown,
    request: ApiRequest<TBody>,
    correlationId: string,
    attemptSignal: AbortSignal,
  ): AutoflowError {
    if (error instanceof AutoflowError) return error
    const timedOut = attemptSignal.aborted && request.signal?.aborted !== true

    return toAutoflowError(error, {
      code: timedOut ? "API_TIMEOUT" : "API_NETWORK_ERROR",
      category: timedOut ? "timeout" : "network",
      userMessage: timedOut
        ? "The service request timed out."
        : "AutoFlow could not connect to the service.",
      correlationId,
      recoverable: true,
      details: { method: request.method, path: request.path },
    })
  }

  private async waitBeforeRetry(
    attempt: number,
    retryAfterMs: number | undefined,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const exponentialDelay = this.options.retryBaseDelayMs * 2 ** (attempt - 1)
    const jitteredDelay = exponentialDelay * (0.75 + this.random() * 0.5)
    await delay(retryAfterMs ?? Math.round(jitteredDelay), signal)
  }

  /** A per-attempt controller combines the caller signal with a bounded timeout. */
  private createAttemptController(
    callerSignal: AbortSignal | undefined,
    timeoutMs: number,
  ): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController()
    const handleCallerAbort = (): void => controller.abort(callerSignal?.reason)
    callerSignal?.addEventListener("abort", handleCallerAbort, { once: true })
    if (callerSignal?.aborted === true) handleCallerAbort()

    const timeout = setTimeout(() => {
      controller.abort(new DOMException("The API request timed out.", "TimeoutError"))
    }, timeoutMs)

    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timeout)
        callerSignal?.removeEventListener("abort", handleCallerAbort)
      },
    }
  }
}
