import type { TypedApiClient } from "~/api/client/contracts"
import {
  checkoutResultSchema,
  purchaseRecordSchema,
  tokenPacksResponseSchema,
  type CheckoutRequest,
  type CheckoutResult,
  type PurchaseRecord,
  type TokenPack,
} from "~/schemas/billing"
import { createPageResultSchema, type PageRequest, type PageResult } from "~/schemas/common"

/** Billing owns token-pack discovery and purchases but never mutates balances directly. */
export interface BillingApi {
  listTokenPacks(): Promise<TokenPack[]>
  checkout(request: CheckoutRequest, idempotencyKey: string): Promise<CheckoutResult>
  verifyPayment(paymentId: string): Promise<PurchaseRecord>
  listPurchases(page: PageRequest): Promise<PageResult<PurchaseRecord>>
}

/** Payment mutations require idempotency and never contain card or crypto-wallet secrets. */
export class BillingApiClient implements BillingApi {
  constructor(private readonly client: TypedApiClient) {}

  async listTokenPacks(): Promise<TokenPack[]> {
    const response = await this.client.request(
      { method: "GET", path: "/billing/token-packs", authentication: "omit" },
      tokenPacksResponseSchema,
    )
    return response.items
  }

  checkout(request: CheckoutRequest, idempotencyKey: string): Promise<CheckoutResult> {
    return this.client.request(
      {
        method: "POST",
        path: "/billing/checkout",
        body: request,
        idempotencyKey,
        retry: "safe",
      },
      checkoutResultSchema,
    )
  }

  verifyPayment(paymentId: string): Promise<PurchaseRecord> {
    return this.client.request(
      { method: "GET", path: `/billing/payments/${encodeURIComponent(paymentId)}/verify` },
      purchaseRecordSchema,
    )
  }

  async listPurchases(page: PageRequest): Promise<PageResult<PurchaseRecord>> {
    const result = await this.client.request(
      {
        method: "GET",
        path: "/billing/purchases",
        query: { cursor: page.cursor, limit: page.limit },
      },
      createPageResultSchema(purchaseRecordSchema),
    )
    return {
      items: result.items,
      ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
      ...(result.total === undefined ? {} : { total: result.total }),
    }
  }
}
