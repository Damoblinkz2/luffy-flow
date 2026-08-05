import { LuffyflowError } from "~/errors/luffyflow-error"
import type {
  ApiTransport,
  HttpMethod,
  TransportRequest,
  TransportResponse,
} from "~/api/client/contracts"
import { delay } from "~/utils/time"

export interface MockRequestContext {
  method: HttpMethod
  path: string
  query: URLSearchParams
  headers: Readonly<Record<string, string>>
  body: unknown
  signal: AbortSignal
}

export interface MockHandlerResponse {
  status?: number
  headers?: Record<string, string>
  body?: unknown
}

export type MockRouteHandler = (
  context: MockRequestContext,
) => Promise<MockHandlerResponse> | MockHandlerResponse

export interface MockTransportOptions {
  latencyMs: number
  failureRate: number
  random?: () => number
}

/** Route-based mock transport simulates network behavior without storing credentials. */
export class MockTransport implements ApiTransport {
  private readonly routes = new Map<string, MockRouteHandler>()
  private readonly random: () => number

  constructor(private readonly options: MockTransportOptions) {
    this.random = options.random ?? Math.random
  }

  register(method: HttpMethod, path: string, handler: MockRouteHandler): () => void {
    const key = this.routeKey(method, path)
    if (this.routes.has(key)) {
      throw new LuffyflowError({
        code: "MOCK_ROUTE_DUPLICATE",
        category: "invalid_data",
        userMessage: "A mock API route was registered more than once.",
        diagnosticMessage: key,
      })
    }
    this.routes.set(key, handler)
    return () => this.routes.delete(key)
  }

  async execute(request: TransportRequest): Promise<TransportResponse> {
    await delay(this.options.latencyMs, request.signal)
    if (this.random() < this.options.failureRate) {
      return this.jsonResponse(500, {
        code: "MOCK_SERVER_ERROR",
        category: "network",
        message: "The development mock service simulated a server error.",
      })
    }

    const url = new URL(request.url)
    const handler = this.routes.get(this.routeKey(request.method, url.pathname))
    if (handler === undefined) {
      return this.jsonResponse(404, {
        code: "MOCK_ROUTE_NOT_FOUND",
        category: "invalid_data",
        message: "The requested mock API route does not exist.",
      })
    }

    try {
      const result = await handler({
        method: request.method,
        path: url.pathname,
        query: url.searchParams,
        headers: request.headers,
        body: this.parseBody(request.bodyText),
        signal: request.signal,
      })
      return this.jsonResponse(result.status ?? 200, result.body, result.headers)
    } catch (error) {
      if (error instanceof LuffyflowError) {
        return this.jsonResponse(this.statusForError(error), {
          code: error.code,
          category: error.category,
          message: error.userMessage,
          details: error.details,
          retryAfterMs: error.retryAfterMs,
        })
      }
      return this.jsonResponse(500, {
        code: "MOCK_HANDLER_ERROR",
        category: "unknown",
        message: "The development mock service encountered an unexpected error.",
      })
    }
  }

  private routeKey(method: HttpMethod, path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`
    return `${method} ${normalizedPath.replace(/\/+$/, "") || "/"}`
  }

  private parseBody(bodyText: string | undefined): unknown {
    if (bodyText === undefined || bodyText.trim() === "") return undefined
    try {
      return JSON.parse(bodyText) as unknown
    } catch {
      return bodyText
    }
  }

  private jsonResponse(
    status: number,
    body: unknown,
    headers?: Record<string, string>,
  ): TransportResponse {
    return {
      status,
      headers: { "content-type": "application/json", ...headers },
      bodyText: body === undefined ? "" : JSON.stringify(body),
    }
  }

  private statusForError(error: LuffyflowError): number {
    if (error.category === "authentication") return 401
    if (error.category === "authorization") return 403
    if (error.category === "usage_limit") return 429
    if (error.category === "invalid_data") return 400
    if (error.category === "timeout") return 408
    return 500
  }
}
