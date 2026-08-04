import type { z } from "zod"

import type { Logger } from "~/logging/logger"

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

/** Application requests contain typed bodies before the client serializes them. */
export interface ApiRequest<TBody = unknown> {
  method: HttpMethod
  path: string
  query?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
  body?: TBody
  timeoutMs?: number
  idempotencyKey?: string
  signal?: AbortSignal
  retry?: "safe" | "never"
  authentication?: "include" | "omit"
}

/** Transports receive a complete URL and serialized body but own no auth policy. */
export interface TransportRequest {
  method: HttpMethod
  url: string
  headers: Record<string, string>
  bodyText?: string
  signal: AbortSignal
}

export interface TransportResponse {
  status: number
  headers: Record<string, string>
  bodyText: string
}

export interface ApiTransport {
  execute(request: TransportRequest): Promise<TransportResponse>
}

/** Token access is injected so the API client never imports a concrete auth store. */
export interface AuthTokenProvider {
  getAccessToken(): Promise<string | null>
  refreshAccessToken(): Promise<string | null>
}

export interface ApiClientOptions {
  baseUrl: string
  defaultTimeoutMs: number
  maximumSafeRetryCount: number
  retryBaseDelayMs: number
  transport: ApiTransport
  logger: Logger
  tokenProvider?: AuthTokenProvider
  random?: () => number
}

export interface TypedApiClient {
  request<TResponse, TBody = unknown>(
    request: ApiRequest<TBody>,
    responseSchema: z.ZodType<TResponse>,
  ): Promise<TResponse>
}
