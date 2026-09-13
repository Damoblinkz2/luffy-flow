import { createStore, type StoreApi } from "zustand/vanilla"

import { LuffyflowError } from "~/errors/luffyflow-error"
import type {
  CheckoutResult,
  PaymentGateway,
  PurchaseRecord,
  TokenPack,
  TokenPackId,
  TokenWallet,
} from "~/schemas/billing"
import type { TokenBillingService } from "~/services/billing/token-billing-service"
import { createId } from "~/utils/ids"

/** Billing UI state exposes prepaid tokens, purchases, and low-balance reminder preferences. */
export interface BillingStoreState {
  wallet: TokenWallet | null
  packs: TokenPack[]
  purchases: PurchaseRecord[]
  loading: boolean
  error: string | null
  checkoutResult: CheckoutResult | null
  load(): Promise<void>
  buyTokens(packId: TokenPackId, gateway: PaymentGateway, returnUrl: string): Promise<void>
  completePayment(paymentId: string): Promise<void>
  updateReminder(enabled: boolean, threshold: number): Promise<void>
  debitPrompt(promptId: string, attempt: number): Promise<void>
}

/** Billing store keeps payment details with hosted providers and accepts only catalog pack IDs. */
export const createBillingStore = (service: TokenBillingService): StoreApi<BillingStoreState> =>
  createStore<BillingStoreState>()((set) => ({
    wallet: null,
    packs: [],
    purchases: [],
    loading: false,
    error: null,
    checkoutResult: null,
    load: async () => {
      set({ loading: true, error: null })
      try {
        const snapshot = await service.load()
        set({
          wallet: snapshot.wallet,
          packs: snapshot.packs,
          purchases: snapshot.purchases.items,
          loading: false,
        })
      } catch (error) {
        set({ loading: false, error: messageFromError(error) })
      }
    },
    buyTokens: async (packId, gateway, returnUrl) => {
      set({ loading: true, error: null, checkoutResult: null })
      try {
        const checkoutResult = await service.checkout(packId, gateway, returnUrl, createId())
        set({ checkoutResult })
        // Hosted payments remain pending until the backend verifies the provider transaction.
        const snapshot = await service.load()
        set({
          wallet: snapshot.wallet,
          packs: snapshot.packs,
          purchases: snapshot.purchases.items,
          loading: false,
        })
      } catch (error) {
        set({ loading: false, error: messageFromError(error) })
        throw error
      }
    },
    completePayment: async (paymentId) => {
      set({ loading: true, error: null })
      try {
        await service.verifyPayment(paymentId)
        const snapshot = await service.load()
        set({
          wallet: snapshot.wallet,
          packs: snapshot.packs,
          purchases: snapshot.purchases.items,
          loading: false,
        })
      } catch (error) {
        set({ loading: false, error: messageFromError(error) })
        throw error
      }
    },
    updateReminder: async (enabled, threshold) => {
      set({ loading: true, error: null })
      try {
        const wallet = await service.updateReminder({ enabled, threshold }, createId())
        set({ wallet, loading: false })
      } catch (error) {
        set({ loading: false, error: messageFromError(error) })
        throw error
      }
    },
    debitPrompt: async (promptId, attempt) => {
      try {
        set({ wallet: await service.debitPrompt(promptId, attempt), error: null })
      } catch (error) {
        set({ error: messageFromError(error) })
        throw error
      }
    },
  }))

/** Reduces billing failures to safe messages suitable for persistent store state. */
const messageFromError = (error: unknown): string =>
  error instanceof LuffyflowError
    ? error.userMessage
    : error instanceof Error
      ? error.message
      : "An unexpected billing error occurred."
