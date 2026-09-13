import { describe, expect, it, vi } from "vitest"

import type { BillingApi } from "~/api/modules/billing-api"
import type { TokenApi } from "~/api/modules/token-api"
import type { TokenReminderRequest, TokenWallet } from "~/schemas/billing"
import { TokenBillingService } from "~/services/billing/token-billing-service"

import { fixedNow, ids } from "../helpers/fixtures"

/** Builds deterministic API ports without shipping a development server in extension code. */
const createBillingFixture = () => {
  let wallet: TokenWallet = {
    userId: ids.user,
    balance: 10,
    lifetimePurchased: 0,
    lifetimeSpent: 0,
    lowBalanceReminder: { enabled: true, threshold: 5 },
    updatedAt: fixedNow.toISOString(),
  }
  const debitKeys = new Set<string>()
  const tokenApi: TokenApi = {
    getBalance: vi.fn(() => Promise.resolve(wallet)),
    debitPrompt: vi.fn((_promptId: string, _attempt: number, idempotencyKey: string) => {
      if (!debitKeys.has(idempotencyKey)) {
        debitKeys.add(idempotencyKey)
        wallet = { ...wallet, balance: wallet.balance - 1, lifetimeSpent: wallet.lifetimeSpent + 1 }
      }
      return Promise.resolve(wallet)
    }),
    updateReminder: vi.fn((request: TokenReminderRequest) => {
      wallet = { ...wallet, lowBalanceReminder: request }
      return Promise.resolve(wallet)
    }),
  }
  const billingApi: BillingApi = {
    listTokenPacks: vi.fn(() =>
      Promise.resolve([
        { id: "starter" as const, tokens: 100, priceNgnMinor: 500_000, priceUsd: 5 },
      ]),
    ),
    checkout: vi.fn(() =>
      Promise.resolve({
        provider: "paystack" as const,
        status: "pending" as const,
        paymentId: "550e8400-e29b-41d4-a716-446655440020",
        packId: "starter" as const,
        tokenAmount: 100,
        checkoutReference: "provider-reference",
        checkoutUrl: "https://checkout.example.com/payment",
      }),
    ),
    verifyPayment: vi.fn(() =>
      Promise.resolve({
        id: "550e8400-e29b-41d4-a716-446655440020",
        transactionId: "550e8400-e29b-41d4-a716-446655440020",
        packId: "starter" as const,
        tokenAmount: 100,
        provider: "paystack" as const,
        reference: "provider-reference",
        status: "paid" as const,
        amountMinor: 500_000,
        currency: "NGN",
        createdAt: fixedNow.toISOString(),
        paidAt: fixedNow.toISOString(),
      }),
    ),
    listPurchases: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
  }
  return { service: new TokenBillingService(billingApi, tokenApi), billingApi, tokenApi }
}

describe("prepaid token billing", () => {
  it("uses one stable debit key for each prompt attempt", async () => {
    const fixture = createBillingFixture()
    const promptId = "550e8400-e29b-41d4-a716-446655440010"

    expect((await fixture.service.debitPrompt(promptId, 0)).balance).toBe(9)
    expect((await fixture.service.debitPrompt(promptId, 0)).balance).toBe(9)
    expect((await fixture.service.debitPrompt(promptId, 1)).balance).toBe(8)
    expect(fixture.tokenApi.debitPrompt).toHaveBeenNthCalledWith(
      1,
      promptId,
      0,
      `prompt:${promptId}:attempt:0`,
    )
  })

  it("requests hosted checkout and persists reminder preferences through API ports", async () => {
    const fixture = createBillingFixture()
    const checkout = await fixture.service.checkout(
      "starter",
      "paystack",
      "https://luffyflow.example/complete",
      "checkout-key",
    )
    const wallet = await fixture.service.updateReminder(
      { enabled: true, threshold: 25 },
      "reminder-key",
    )

    expect(checkout).toMatchObject({ provider: "paystack", status: "pending", tokenAmount: 100 })
    expect(wallet.lowBalanceReminder).toEqual({ enabled: true, threshold: 25 })
    expect(fixture.billingApi.checkout).toHaveBeenCalledWith(
      {
        packId: "starter",
        gateway: "paystack",
        returnUrl: "https://luffyflow.example/complete",
      },
      "checkout-key",
    )
  })
})
