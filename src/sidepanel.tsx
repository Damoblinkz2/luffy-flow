import "~/styles/base.css"
import { useAuthStore } from "~/components/auth/AuthProvider"
import { AutomationWorkspace } from "~/components/automation"
import { ApplicationProviders, Button, ErrorBoundary, LoadingState } from "~/components/common"
import { openDashboard } from "~/utils/extension-navigation"

/** Side-panel body gates automation on the persisted AutoFlow account session. */
const SidePanelBody = () => {
  const status = useAuthStore((state) => state.status)
  const session = useAuthStore((state) => state.session)
  if (status === "idle" || status === "loading")
    return <LoadingState label="Restoring your session…" />
  if (status !== "authenticated" || session === null) {
    return (
      <section className="af-card text-center">
        <h1 className="text-xl font-semibold">Log in to AutoFlow</h1>
        <p className="af-muted my-3">
          Authentication is required before creating or starting a queue.
        </p>
        <Button onClick={() => void openDashboard("/login")}>Open login</Button>
      </section>
    )
  }
  return <AutomationWorkspace source="sidepanel" compact />
}

/** Plasmo registers this entry as the Chromium side-panel document. */
const SidePanel = () => (
  <ErrorBoundary surface="Side panel">
    <ApplicationProviders>
      <main className="min-h-screen min-w-[320px] p-3">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary">AutoFlow</h1>
            <p className="text-xs text-foreground/60">Platform workspace</p>
          </div>
          <Button variant="ghost" onClick={() => void openDashboard("/")}>
            Dashboard
          </Button>
        </header>
        <SidePanelBody />
      </main>
    </ApplicationProviders>
  </ErrorBoundary>
)

export default SidePanel
