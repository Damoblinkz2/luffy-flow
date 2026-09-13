import type { BillingApi } from "~/api/modules/billing-api"
import type { TokenApi } from "~/api/modules/token-api"
import type {
  CheckoutResult,
  PaymentGateway,
  PurchaseRecord,
  TokenPack,
  TokenPackId,
  TokenReminderRequest,
  TokenWallet,
} from "~/schemas/billing"
import type { PageResult } from "~/schemas/common"

/** One snapshot keeps wallet, pack catalog, and purchase history consistent for every UI surface. */
export interface TokenBillingSnapshot {
  wallet: TokenWallet
  packs: TokenPack[]
  purchases: PageResult<PurchaseRecord>
}

/** TokenBillingService coordinates provider-neutral purchases and one-token prompt debits. */
export class TokenBillingService {
  constructor(
    private readonly billingApi: BillingApi,
    private readonly tokenApi: TokenApi,
  ) {}

  async load(): Promise<TokenBillingSnapshot> {
    const [wallet, packs, purchases] = await Promise.all([
      this.tokenApi.getBalance(),
      this.billingApi.listTokenPacks(),
      this.billingApi.listPurchases({ limit: 25 }),
    ])
    return { wallet, packs, purchases }
  }

  /** Fetches only the authoritative balance for queue preflight checks. */
  getBalance(): Promise<TokenWallet> {
    return this.tokenApi.getBalance()
  }

  checkout(
    packId: TokenPackId,
    gateway: PaymentGateway,
    returnUrl: string,
    idempotencyKey: string,
    payCurrency?: string,
  ): Promise<CheckoutResult> {
    return this.billingApi.checkout(
      { packId, gateway, returnUrl, ...(payCurrency ? { payCurrency } : {}) },
      idempotencyKey,
    )
  }

  /** Re-verifies a provider return before refreshing wallet state. */
  verifyPayment(paymentId: string): Promise<PurchaseRecord> {
    return this.billingApi.verifyPayment(paymentId)
  }

  updateReminder(request: TokenReminderRequest, idempotencyKey: string): Promise<TokenWallet> {
    return this.tokenApi.updateReminder(request, idempotencyKey)
  }

  /** Charge one token after a specific prompt attempt is confirmed as submitted. */
  debitPrompt(promptId: string, attempt: number): Promise<TokenWallet> {
    return this.tokenApi.debitPrompt(promptId, attempt, `prompt:${promptId}:attempt:${attempt}`)
  }
}
