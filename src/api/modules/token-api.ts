import type { TypedApiClient } from "~/api/client/contracts"
import {
  tokenDebitRequestSchema,
  tokenReminderRequestSchema,
  tokenWalletSchema,
  type TokenReminderRequest,
  type TokenWallet,
} from "~/schemas/billing"

/** Token balance and debit operations are separate from payment-provider concerns. */
export interface TokenApi {
  getBalance(): Promise<TokenWallet>
  debitPrompt(promptId: string, attempt: number, idempotencyKey: string): Promise<TokenWallet>
  updateReminder(request: TokenReminderRequest, idempotencyKey: string): Promise<TokenWallet>
}

export class TokenApiClient implements TokenApi {
  constructor(private readonly client: TypedApiClient) {}

  getBalance(): Promise<TokenWallet> {
    return this.client.request({ method: "GET", path: "/tokens/balance" }, tokenWalletSchema)
  }

  debitPrompt(promptId: string, attempt: number, idempotencyKey: string): Promise<TokenWallet> {
    const body = tokenDebitRequestSchema.parse({ promptId, attempt })
    return this.client.request(
      { method: "POST", path: "/tokens/debit", body, idempotencyKey, retry: "safe" },
      tokenWalletSchema,
    )
  }

  updateReminder(request: TokenReminderRequest, idempotencyKey: string): Promise<TokenWallet> {
    const body = tokenReminderRequestSchema.parse(request)
    return this.client.request(
      { method: "PATCH", path: "/tokens/reminder", body, idempotencyKey, retry: "safe" },
      tokenWalletSchema,
    )
  }
}
