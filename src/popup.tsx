import { useEffect, useState } from "react"
import { useStore } from "zustand"

import "~/styles/base.css"
import { useAuthStore } from "~/components/auth/AuthProvider"
import {
  ApplicationProviders,
  Badge,
  BrandLogo,
  Button,
  EmptyState,
  ErrorBoundary,
  LoadingState,
} from "~/components/common"
import { useApplicationServices } from "~/components/common/ApplicationProviders"
import { useActivePlatform } from "~/hooks/useActivePlatform"
import { openDashboard, openSidePanelOrDashboard } from "~/utils/extension-navigation"

/** Popup summary reads durable counts without becoming an automation owner. */
const PopupBody = () => {
  const services = useApplicationServices()
  const status = useAuthStore((state) => state.status)
  const session = useAuthStore((state) => state.session)
  const logout = useAuthStore((state) => state.logout)
  const billing = useStore(services.billingStore, (state) => state)
  const platform = useActivePlatform()
  const [counts, setCounts] = useState({ promptsSent: 0, outputs: 0 })

  useEffect(() => {
    if (status !== "authenticated" || session === null) return
    if (services.billingStore.getState().wallet === null)
      void services.billingStore.getState().load()
    let active = true
    void services.repositories.queue
      .getActive()
      .then(async (queue) => {
        if (!active || queue === null || queue.userId !== session.user.id) return
        const [prompts, outputs] = await Promise.all([
          services.repositories.prompts.list(
            { limit: 1 },
            {
              sessionId: queue.sessionId,
              status: [
                "sending",
                "waiting_for_output",
                "completed",
                "failed",
                "skipped",
                "cancelled",
              ],
            },
          ),
          services.repositories.outputs.list({ limit: 1 }, { sessionId: queue.sessionId }),
        ])
        if (active) {
          setCounts({
            promptsSent: prompts.total ?? prompts.items.length,
            outputs: outputs.total ?? outputs.items.length,
          })
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [services, session, status])

  if (status === "idle" || status === "loading") return <LoadingState label="Restoring session…" />
  if (status !== "authenticated" || session === null) {
    return (
      <EmptyState
        title="Welcome to LuffyFlow"
        description="Log in to queue prompts and organize generated outputs."
        action={<Button onClick={() => void openDashboard("/login")}>Log in</Button>}
      />
    )
  }
  return (
    <div className="space-y-4">
      <section className="af-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{session.user.displayName}</p>
            <p className="truncate text-xs text-foreground/60">{session.user.email}</p>
          </div>
          <Badge tone="success">Logged in</Badge>
        </div>
        <Button className="mt-3" variant="ghost" onClick={() => void logout()}>
          Log out
        </Button>
      </section>
      <section className="af-card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Active tab</h2>
          {platform.supported ? (
            <Badge tone="success">Supported</Badge>
          ) : (
            <Badge tone="warning">Unsupported</Badge>
          )}
        </div>
        <p className="af-muted mt-2">
          {platform.displayName ?? "Open Google Flow, Gemini, Grok, or Meta AI."}
        </p>
        {platform.supported ? (
          <Button className="mt-3 w-full" onClick={() => void openSidePanelOrDashboard()}>
            Open workspace
          </Button>
        ) : null}
      </section>
      <section className="grid grid-cols-2 gap-3">
        <article className="af-card">
          <p className="af-muted">Prompts sent</p>
          <p className="text-xl font-semibold">{counts.promptsSent}</p>
        </article>
        <article className="af-card">
          <p className="af-muted">Outputs saved</p>
          <p className="text-xl font-semibold">{counts.outputs}</p>
        </article>
      </section>
      <section className="af-card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Token balance</h2>
          <Badge>{billing.wallet?.balance.toLocaleString() ?? "loading"}</Badge>
        </div>
        <p className="af-muted">One token is charged for each prompt sent.</p>
      </section>
      <nav className="grid grid-cols-2 gap-2" aria-label="Quick links">
        <Button variant="secondary" onClick={() => void openDashboard("/")}>
          Dashboard
        </Button>
        <Button variant="secondary" onClick={() => void openDashboard("/history")}>
          Prompt history
        </Button>
        <Button variant="secondary" onClick={() => void openDashboard("/outputs")}>
          Output library
        </Button>
        <Button variant="secondary" onClick={() => void openDashboard("/tokens")}>
          Buy tokens
        </Button>
        <Button variant="secondary" onClick={() => void openDashboard("/settings")}>
          Settings
        </Button>
      </nav>
    </div>
  )
}

/** Plasmo registers the default export as the toolbar popup. */
const Popup = () => (
  <ErrorBoundary surface="Popup">
    <ApplicationProviders>
      <main className="w-[380px] p-4">
        <header className="mb-4">
          <h1>
            <BrandLogo className="text-xl text-primary" />
          </h1>
          <p className="text-xs text-foreground/60">Queue prompts. Track outputs.</p>
        </header>
        <PopupBody />
      </main>
    </ApplicationProviders>
  </ErrorBoundary>
)

export default Popup
