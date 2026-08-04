import type { TypedApiClient } from "~/api/client/contracts"
import {
  changePlanRequestSchema,
  checkoutResultSchema,
  invoicePlaceholderSchema,
  subscriptionSchema,
  type CheckoutRequest,
  type CheckoutResult,
  type InvoicePlaceholder,
  type PlanId,
  type Subscription,
} from "~/schemas/billing"
import { createPageResultSchema, type PageRequest, type PageResult } from "~/schemas/common"

/** Billing contract remains compatible with a future hosted-checkout provider adapter. */
export interface BillingApi {
  getSubscription(): Promise<Subscription>
  checkout(request: CheckoutRequest): Promise<CheckoutResult>
  changePlan(planId: PlanId): Promise<Subscription>
  cancel(): Promise<Subscription>
  listInvoices(page: PageRequest): Promise<PageResult<InvoicePlaceholder>>
}

/** Billing mutations never opt into automatic retries. */
export class BillingApiClient implements BillingApi {
  constructor(private readonly client: TypedApiClient) {}

  getSubscription(): Promise<Subscription> {
    return this.client.request({ method: "GET", path: "/billing/subscription" }, subscriptionSchema)
  }

  checkout(request: CheckoutRequest): Promise<CheckoutResult> {
    return this.client.request(
      { method: "POST", path: "/billing/checkout", body: request, retry: "never" },
      checkoutResultSchema,
    )
  }

  changePlan(planId: PlanId): Promise<Subscription> {
    const body = changePlanRequestSchema.parse({ planId })
    return this.client.request(
      { method: "POST", path: "/billing/change-plan", body, retry: "never" },
      subscriptionSchema,
    )
  }

  cancel(): Promise<Subscription> {
    return this.client.request(
      { method: "POST", path: "/billing/cancel", retry: "never" },
      subscriptionSchema,
    )
  }

  async listInvoices(page: PageRequest): Promise<PageResult<InvoicePlaceholder>> {
    const result = await this.client.request(
      {
        method: "GET",
        path: "/billing/invoices",
        query: { cursor: page.cursor, limit: page.limit },
      },
      createPageResultSchema(invoicePlaceholderSchema),
    )
    return {
      items: result.items,
      ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
      ...(result.total === undefined ? {} : { total: result.total }),
    }
  }
}
