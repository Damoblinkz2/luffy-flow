import type { BillingApi } from "~/api/modules/billing-api"
import type { UsageApi } from "~/api/modules/usage-api"
import type {
  CheckoutResult,
  InvoicePlaceholder,
  PlanId,
  Subscription,
  Usage,
} from "~/schemas/billing"
import type { PageResult } from "~/schemas/common"

/** A single snapshot prevents subscription screens from coordinating three API modules. */
export interface SubscriptionSnapshot {
  subscription: Subscription
  usage: Usage
  invoices: PageResult<InvoicePlaceholder>
}

/** Billing service presents one provider-neutral workflow to stores and pages. */
export class SubscriptionService {
  /** Combines billing and usage clients behind one store-facing service. */
  constructor(
    private readonly billingApi: BillingApi,
    private readonly usageApi: UsageApi,
  ) {}

  /** Loads subscription, usage, and invoices concurrently as one consistent screen snapshot. */
  async load(): Promise<SubscriptionSnapshot> {
    const [subscription, usage, invoices] = await Promise.all([
      this.billingApi.getSubscription(),
      this.usageApi.getUsage(),
      this.billingApi.listInvoices({ limit: 25 }),
    ])
    return { subscription, usage, invoices }
  }

  /** Starts hosted checkout for a paid plan and passes through its redirect result. */
  checkout(planId: Exclude<PlanId, "free">, returnUrl: string): Promise<CheckoutResult> {
    return this.billingApi.checkout({ planId, returnUrl })
  }

  /** Requests a provider-neutral plan transition. */
  changePlan(planId: PlanId): Promise<Subscription> {
    return this.billingApi.changePlan(planId)
  }

  /** Schedules or applies cancellation according to the billing API policy. */
  cancel(): Promise<Subscription> {
    return this.billingApi.cancel()
  }

  /** Records one metered action with retry-safe idempotency. */
  incrementUsage(idempotencyKey: string): Promise<Usage> {
    return this.usageApi.increment(idempotencyKey)
  }
}
