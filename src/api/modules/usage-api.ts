import type { TypedApiClient } from "~/api/client/contracts"
import { usageSchema, type Usage } from "~/schemas/billing"

/** Usage events use a separate contract so queue accounting can stay idempotent. */
export interface UsageApi {
  getUsage(): Promise<Usage>
  increment(idempotencyKey: string): Promise<Usage>
}

/** Usage increments are retryable only because their idempotency key is required. */
export class UsageApiClient implements UsageApi {
  constructor(private readonly client: TypedApiClient) {}

  getUsage(): Promise<Usage> {
    return this.client.request({ method: "GET", path: "/usage" }, usageSchema)
  }

  increment(idempotencyKey: string): Promise<Usage> {
    return this.client.request(
      {
        method: "POST",
        path: "/usage/increment",
        idempotencyKey,
        retry: "safe",
      },
      usageSchema,
    )
  }
}
