import { useEffect, useState } from "react"
import { useStore } from "zustand"
import type { StoreApi } from "zustand/vanilla"

import { MOCK_PLAN_LIMITS } from "~/constants"
import type { PlanId } from "~/schemas/billing"
import type { BillingStoreState } from "~/stores/billing-store"

export interface SubscriptionPageProps {
  store: StoreApi<BillingStoreState>
}

/** Plan labels and ranks keep provider-neutral identifiers out of UI branching details. */
const PLAN_LABELS: Record<PlanId, string> = { free: "Free", pro: "Pro", business: "Business" }
const PLAN_RANK: Record<PlanId, number> = { free: 0, pro: 1, business: 2 }

/** Subscription page labels every checkout control as a mock placeholder. */
export const SubscriptionPage = ({ store }: SubscriptionPageProps) => {
  const state = useStore(store, (value) => value)
  const [confirmCancel, setConfirmCancel] = useState(false)

  useEffect(() => {
    if (store.getState().subscription === null) void store.getState().load()
  }, [store])

  if (state.loading && state.subscription === null)
    return <p role="status">Loading subscription...</p>
  if (state.error !== null && state.subscription === null) return <p role="alert">{state.error}</p>
  if (state.subscription === null || state.usage === null)
    return <p>No subscription data is available.</p>
  const subscription = state.subscription
  const usage = state.usage

  const usagePercent = usage.limit === 0 ? 0 : Math.min(100, (usage.used / usage.limit) * 100)

  return (
    <main className="space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Subscription</h1>
        <p className="text-sm text-foreground/70">
          Payment integration is a placeholder. LuffyFlow never collects card details.
        </p>
      </header>

      {state.error === null ? null : (
        <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}

      {state.checkoutResult === null ? null : (
        <p className="rounded-lg border border-border p-3 text-sm" role="status">
          Mock checkout completed: {state.checkoutResult.checkoutReference}
        </p>
      )}

      <section
        className="rounded-xl border border-border bg-surface p-5"
        aria-labelledby="current-plan"
      >
        <h2 id="current-plan" className="text-lg font-semibold">
          Current plan
        </h2>
        <p className="mt-2 text-xl">{PLAN_LABELS[subscription.planId]}</p>
        <p className="text-sm">Billing status: {subscription.billingStatus}</p>
        <p className="text-sm">
          Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
        </p>
        {subscription.cancelAtPeriodEnd ? (
          <p className="mt-2 text-sm text-danger" role="status">
            Cancellation is scheduled for period end.
          </p>
        ) : null}
      </section>

      <section
        className="rounded-xl border border-border bg-surface p-5"
        aria-labelledby="monthly-usage"
      >
        <h2 id="monthly-usage" className="text-lg font-semibold">
          Monthly usage
        </h2>
        <p>
          {usage.used.toLocaleString()} of {usage.limit.toLocaleString()} prompts
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-border" aria-hidden="true">
          <div className="h-full bg-primary" style={{ width: `${usagePercent}%` }} />
        </div>
        <p className="mt-2 text-sm">{usage.remaining.toLocaleString()} remaining</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Available plans">
        {(Object.keys(PLAN_LABELS) as PlanId[]).map((planId) => (
          <article key={planId} className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold">{PLAN_LABELS[planId]}</h2>
            <p className="mb-4 text-sm">
              {MOCK_PLAN_LIMITS[planId].toLocaleString()} prompts/month
            </p>
            {planId === subscription.planId ? (
              <button type="button" disabled className="rounded-lg border px-4 py-2 opacity-50">
                Current plan
              </button>
            ) : PLAN_RANK[planId] < PLAN_RANK[subscription.planId] ? (
              <button
                type="button"
                disabled={state.loading}
                className="rounded-lg border border-border px-4 py-2"
                onClick={() => runBillingAction(() => state.changePlan(planId))}
              >
                Downgrade
              </button>
            ) : planId === "pro" || planId === "business" ? (
              <button
                type="button"
                disabled={state.loading}
                className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
                onClick={() =>
                  runBillingAction(() => state.upgrade(planId, globalThis.location.href))
                }
              >
                Mock upgrade
              </button>
            ) : null}
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Payment method</h2>
        <p className="text-sm">No payment method is collected in mock mode.</p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Billing history</h2>
        {state.invoices.length === 0 ? (
          <p className="text-sm">No mock invoices yet.</p>
        ) : (
          <ul>
            {state.invoices.map((invoice) => (
              <li key={invoice.id}>{invoice.description}</li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        disabled={state.loading || subscription.planId === "free" || subscription.cancelAtPeriodEnd}
        className="rounded-lg border border-danger px-4 py-2 text-danger disabled:opacity-50"
        onClick={() => setConfirmCancel(true)}
      >
        Cancel subscription
      </button>

      {confirmCancel ? (
        <div className="fixed inset-0 grid place-items-center bg-black/50 p-4" role="presentation">
          <div
            className="max-w-sm rounded-xl bg-surface p-5 shadow-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
          >
            <h2 id="cancel-title" className="text-lg font-semibold">
              Cancel at period end?
            </h2>
            <p className="my-4 text-sm">This changes mock subscription state only.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-2"
                onClick={() => setConfirmCancel(false)}
              >
                Keep plan
              </button>
              <button
                type="button"
                className="rounded-lg bg-danger px-3 py-2 text-danger-foreground"
                onClick={() => {
                  setConfirmCancel(false)
                  runBillingAction(() => state.cancel())
                }}
              >
                Confirm cancellation
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

/** Store actions already publish safe errors, so UI handlers only consume rejected promises. */
const runBillingAction = (action: () => Promise<void>): void => {
  void action().catch(() => undefined)
}
