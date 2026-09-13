import type { ApiTransport, TransportRequest, TransportResponse } from "~/api/client/contracts"

/** Fetch is isolated behind a transport so tests can inject a deterministic boundary. */
export class HttpTransport implements ApiTransport {
  constructor(private readonly fetchImplementation: typeof fetch = globalThis.fetch) {}

  async execute(request: TransportRequest): Promise<TransportResponse> {
    // Native browser fetch validates its receiver. Calling a stored function as
    // a class member binds `this` to HttpTransport and throws before networking.
    const response = await this.fetchImplementation.call(globalThis, request.url, {
      method: request.method,
      headers: request.headers,
      signal: request.signal,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      ...(request.bodyText === undefined ? {} : { body: request.bodyText }),
    })

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      bodyText: await response.text(),
    }
  }
}
