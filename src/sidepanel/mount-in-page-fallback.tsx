import { createRoot } from "react-dom/client"
import styleText from "data-text:~/styles/base.css"

import { InPagePanelFallback } from "~/components/automation"
import { ErrorBoundary } from "~/components/common"

const FALLBACK_HOST_ID = "autoflow-in-page-panel-host"

/** Unsupported side-panel browsers receive the same workspace inside an isolated Shadow DOM. */
export const mountInPagePanelFallback = (): (() => void) => {
  const existing = document.getElementById(FALLBACK_HOST_ID)
  if (existing !== null) return () => existing.remove()
  const host = document.createElement("div")
  host.id = FALLBACK_HOST_ID
  const shadow = host.attachShadow({ mode: "closed" })
  const style = document.createElement("style")
  style.textContent = styleText
  const container = document.createElement("div")
  shadow.append(style, container)
  document.documentElement.append(host)
  const root = createRoot(container)
  const unmount = (): void => {
    root.unmount()
    host.remove()
  }
  root.render(
    <ErrorBoundary surface="In-page fallback">
      <InPagePanelFallback onClose={unmount} />
    </ErrorBoundary>,
  )
  return unmount
}
