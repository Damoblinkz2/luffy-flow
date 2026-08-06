import { useState } from "react"

import { useAuthStore } from "~/components/auth/AuthProvider"
import { ApplicationProviders, Button, LoadingState } from "~/components/common"
import { openDashboard } from "~/utils/extension-navigation"

import { AutomationWorkspace } from "./AutomationWorkspace"

export interface InPagePanelFallbackProps {
  onClose?: (() => void) | undefined
}

/** This Shadow-DOM-ready root is the fallback renderer for browsers without Chrome Side Panel. */
export const InPagePanelFallback = ({ onClose }: InPagePanelFallbackProps) => (
  <ApplicationProviders>
    <InPagePanelBody onClose={onClose} />
  </ApplicationProviders>
)

/** Renders the isolated in-page controls while the error boundary owns crash recovery. */
const InPagePanelBody = ({ onClose }: InPagePanelFallbackProps) => {
  const [collapsed, setCollapsed] = useState(false)
  const status = useAuthStore((state) => state.status)
  if (collapsed) {
    return (
      <Button
        className="fixed bottom-4 right-4 z-[2147483647] shadow-panel"
        onClick={() => setCollapsed(false)}
      >
        Open LuffyFlow
      </Button>
    )
  }
  return (
    <aside
      className="fixed bottom-4 right-4 top-4 z-[2147483647] w-[min(420px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border bg-background p-3 text-foreground shadow-panel"
      aria-label="LuffyFlow in-page panel"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <strong className="text-primary">LuffyFlow</strong>
        <div className="flex gap-1">
          <Button variant="ghost" onClick={() => setCollapsed(true)}>
            Collapse
          </Button>
          {onClose === undefined ? null : (
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </header>
      {status === "idle" || status === "loading" ? (
        <LoadingState label="Restoring session…" />
      ) : status === "authenticated" ? (
        <AutomationWorkspace source="in_page_panel" compact />
      ) : (
        <section className="af-card text-center">
          <p className="af-muted mb-3">Log in before starting automation.</p>
          <Button onClick={() => void openDashboard("/login")}>Open login</Button>
        </section>
      )}
    </aside>
  )
}
