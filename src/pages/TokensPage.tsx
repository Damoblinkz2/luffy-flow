import { useEffect, useState } from "react"
import { useStore } from "zustand"
import type { StoreApi } from "zustand/vanilla"

import type { PaymentGateway, TokenPackId } from "~/schemas/billing"
import type { BillingStoreState } from "~/stores/billing-store"

export interface TokensPageProps {
  store: StoreApi<BillingStoreState>
}

const PACK_LABELS: Record<TokenPackId, string> = {
  starter: "Starter",
  value: "Value",
  power: "Power",
}

/** Presents prepaid tokens without any recurring plan or renewal controls. */
export const TokensPage = ({ store }: TokensPageProps) => {
  const state = useStore(store, (value) => value)
  const [gateway, setGateway] = useState<PaymentGateway>("paystack")
  const [reminderEnabled, setReminderEnabled] = useState(true)
  const [threshold, setThreshold] = useState(5)

  useEffect(() => {
    if (store.getState().wallet === null) void store.getState().load()
    const paymentId = new URL(globalThis.location.href).searchParams.get("paymentId")
    if (paymentId !== null) {
      void store
        .getState()
        .completePayment(paymentId)
        .then(() => {
          const cleanUrl = new URL(globalThis.location.href)
          cleanUrl.searchParams.delete("paymentId")
          cleanUrl.searchParams.delete("paymentStatus")
          globalThis.history.replaceState(null, "", cleanUrl)
        })
        .catch(() => undefined)
    }
  }, [store])

  useEffect(() => {
    if (state.wallet === null) return
    setReminderEnabled(state.wallet.lowBalanceReminder.enabled)
    setThreshold(state.wallet.lowBalanceReminder.threshold)
  }, [state.wallet])

  if (state.loading && state.wallet === null) return <p role="status">Loading token wallet...</p>
  if (state.error !== null && state.wallet === null) return <p role="alert">{state.error}</p>
  if (state.wallet === null) return <p>No token wallet is available.</p>

  const runPurchase = async (packId: TokenPackId): Promise<void> => {
    try {
      await store.getState().buyTokens(packId, gateway, globalThis.location.href)
      const checkoutUrl = store.getState().checkoutResult?.checkoutUrl
      if (checkoutUrl !== undefined) await chrome.tabs.create({ url: checkoutUrl })
    } catch {
      // The store already exposes a safe error for the page alert.
    }
  }

  return (
    <main className="space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Tokens</h1>
        <p className="text-sm text-foreground/70">
          LuffyFlow charges one token whenever a prompt is sent. Tokens do not renew monthly.
        </p>
      </header>

      {state.error === null ? null : (
        <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}

      {state.checkoutResult === null ? null : (
        <p className="rounded-lg border border-border p-3 text-sm" role="status">
          Checkout opened. Your balance updates only after payment is verified.
        </p>
      )}

      <section className="rounded-xl border border-border bg-surface p-5" aria-labelledby="balance">
        <h2 id="balance" className="text-lg font-semibold">
          Token balance
        </h2>
        <p className="mt-2 text-4xl font-bold">{state.wallet.balance.toLocaleString()}</p>
        <p className="mt-2 text-sm text-foreground/70">
          {state.wallet.lifetimeSpent.toLocaleString()} used ·{" "}
          {state.wallet.lifetimePurchased.toLocaleString()} purchased
        </p>
      </section>

      <section className="space-y-4" aria-labelledby="buy-tokens">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="buy-tokens" className="text-lg font-semibold">
              Buy tokens
            </h2>
            <p className="text-sm text-foreground/70">
              Payment is completed on the provider's hosted checkout.
            </p>
          </div>
          <label className="text-sm">
            Payment gateway
            <select
              className="ml-2 rounded-lg border border-border bg-surface px-3 py-2"
              value={gateway}
              onChange={(event) => setGateway(event.target.value as PaymentGateway)}
            >
              <option value="paystack">Paystack</option>
              <option value="crypto">Crypto sandbox</option>
            </select>
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {state.packs.map((pack) => (
            <article key={pack.id} className="rounded-xl border border-border bg-surface p-5">
              <h3 className="text-lg font-semibold">{PACK_LABELS[pack.id]}</h3>
              <p className="mt-1 text-2xl font-bold">{pack.tokens.toLocaleString()} tokens</p>
              <p className="mb-4 text-sm text-foreground/70">
                {gateway === "paystack"
                  ? new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(
                      pack.priceNgnMinor / 100,
                    )
                  : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                      pack.priceUsd,
                    )}
              </p>
              <button
                type="button"
                disabled={state.loading}
                className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
                onClick={() => void runPurchase(pack.id)}
              >
                Buy tokens
              </button>
            </article>
          ))}
        </div>
      </section>

      <section
        className="rounded-xl border border-border bg-surface p-5"
        aria-labelledby="reminder"
      >
        <h2 id="reminder" className="text-lg font-semibold">
          Low-balance email reminder
        </h2>
        <p className="mb-4 text-sm text-foreground/70">
          The production API sends one reminder per recharge cycle when your balance reaches this
          threshold.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reminderEnabled}
              onChange={(event) => setReminderEnabled(event.target.checked)}
            />
            Email me when tokens are low
          </label>
          <label className="text-sm">
            Threshold
            <input
              type="number"
              min={0}
              max={1_000_000}
              step={1}
              value={threshold}
              disabled={!reminderEnabled}
              className="ml-2 w-28 rounded-lg border border-border bg-surface px-3 py-2"
              onChange={(event) => setThreshold(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            disabled={state.loading || !Number.isInteger(threshold) || threshold < 0}
            className="rounded-lg border border-border px-4 py-2 disabled:opacity-50"
            onClick={() => {
              void store
                .getState()
                .updateReminder(reminderEnabled, threshold)
                .catch(() => undefined)
            }}
          >
            Save reminder
          </button>
        </div>
        {state.wallet.lowBalanceReminder.lastSentAt === undefined ? null : (
          <p className="mt-3 text-xs text-foreground/60">
            Last reminder: {new Date(state.wallet.lowBalanceReminder.lastSentAt).toLocaleString()}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Purchase history</h2>
        {state.purchases.length === 0 ? (
          <p className="text-sm">No token purchases yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {state.purchases.map((purchase) => (
              <li
                key={purchase.id}
                className="flex justify-between gap-4 border-t border-border pt-2"
              >
                <span>
                  <small className="mb-1 block break-all font-mono text-xs text-foreground/60">
                    Transaction ID: {purchase.transactionId}
                  </small>
                  {PACK_LABELS[purchase.packId]} · {purchase.tokenAmount.toLocaleString()} tokens
                </span>
                <span>
                  {purchase.status} · {new Date(purchase.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
