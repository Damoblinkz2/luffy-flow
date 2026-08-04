import type { ApiTransport, TransportRequest, TransportResponse } from "~/api/client/contracts"

/** Fetch is isolated behind a transport so mock mode and tests never patch global networking. */
export class HttpTransport implements ApiTransport {
  constructor(private readonly fetchImplementation: typeof fetch = globalThis.fetch) {}

  async execute(request: TransportRequest): Promise<TransportResponse> {
    const response = await this.fetchImplementation(request.url, {
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
