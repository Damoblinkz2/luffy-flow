import { createStore, type StoreApi } from "zustand/vanilla"

import { LuffyflowError } from "~/errors/luffyflow-error"
import type {
  CheckoutResult,
  InvoicePlaceholder,
  PlanId,
  Subscription,
  Usage,
} from "~/schemas/billing"
import type { SubscriptionService } from "~/services/billing/subscription-service"

/** Billing UI state contains provider-neutral subscription, usage, and placeholder invoice data. */
export interface BillingStoreState {
  subscription: Subscription | null
  usage: Usage | null
  invoices: InvoicePlaceholder[]
  loading: boolean
  error: string | null
  checkoutResult: CheckoutResult | null
  load(): Promise<void>
  upgrade(planId: Exclude<PlanId, "free">, returnUrl: string): Promise<void>
  changePlan(planId: PlanId): Promise<void>
  cancel(): Promise<void>
  incrementUsage(idempotencyKey: string): Promise<void>
}

/** Billing store exposes provider-neutral actions and never handles payment details. */
export const createBillingStore = (service: SubscriptionService): StoreApi<BillingStoreState> =>
  createStore<BillingStoreState>()((set) => ({
    subscription: null,
    usage: null,
    invoices: [],
    loading: false,
    error: null,
    checkoutResult: null,
    load: async () => {
      set({ loading: true, error: null })
      try {
        const snapshot = await service.load()
        set({
          subscription: snapshot.subscription,
          usage: snapshot.usage,
          invoices: snapshot.invoices.items,
          loading: false,
        })
      } catch (error) {
        set({ loading: false, error: messageFromError(error) })
      }
    },
    upgrade: async (planId, returnUrl) => {
      set({ loading: true, error: null, checkoutResult: null })
      try {
        const checkoutResult = await service.checkout(planId, returnUrl)
        const subscription = await service.changePlan(planId)
        const snapshot = await service.load()
        set({
          checkoutResult,
          subscription,
          usage: snapshot.usage,
          invoices: snapshot.invoices.items,
          loading: false,
        })
      } catch (error) {
        set({ loading: false, error: messageFromError(error) })
        throw error
      }
    },
    changePlan: async (planId) => {
      set({ loading: true, error: null })
      try {
        const subscription = await service.changePlan(planId)
        const snapshot = await service.load()
        set({
          subscription,
          usage: snapshot.usage,
          invoices: snapshot.invoices.items,
          loading: false,
        })
      } catch (error) {
        set({ loading: false, error: messageFromError(error) })
        throw error
      }
    },
    cancel: async () => {
      set({ loading: true, error: null })
      try {
        set({ subscription: await service.cancel(), loading: false })
      } catch (error) {
        set({ loading: false, error: messageFromError(error) })
        throw error
      }
    },
    incrementUsage: async (idempotencyKey) => {
      try {
        set({ usage: await service.incrementUsage(idempotencyKey), error: null })
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
