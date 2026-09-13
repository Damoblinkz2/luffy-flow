import { createRoot } from "react-dom/client"
import styleText from "data-text:~/styles/base.css"

import { InPagePanelFallback } from "~/components/automation"
import { ErrorBoundary } from "~/components/common"

const FALLBACK_HOST_ID = "luffyflow-in-page-panel-host"

/** Mount the in-page launcher inside an isolated Shadow DOM on every supported AI page. */
export const mountInPagePanelFallback = (): (() => void) => {
  const existing = document.getElementById(FALLBACK_HOST_ID)
  if (existing !== null) return () => existing.remove()
  const host = document.createElement("div")
  host.id = FALLBACK_HOST_ID
  // Keep the host itself above the page. The controls also have inline positioning
  // as a final safeguard against a supported AI site's global stylesheet.
  host.style.setProperty("display", "block", "important")
  host.style.setProperty("position", "fixed", "important")
  host.style.setProperty("z-index", "2147483647", "important")
  host.style.setProperty("pointer-events", "auto", "important")
  // Shadow DOM prevents page CSS from styling the panel, while this listener
  // prevents page-level click handlers from dismissing it after a launcher click.
  const stopPageClick = (event: Event): void => event.stopPropagation()
  host.addEventListener("click", stopPageClick)
  host.addEventListener("pointerdown", stopPageClick)
  // An open root stays isolated from the AI page's CSS while keeping the extension
  // accessible to browser accessibility tooling and end-to-end UI tests.
  const shadow = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = styleText
  const container = document.createElement("div")
  shadow.append(style, container)
  document.documentElement.append(host)
  const root = createRoot(container)
  const unmount = (): void => {
    root.unmount()
    host.removeEventListener("click", stopPageClick)
    host.removeEventListener("pointerdown", stopPageClick)
    host.remove()
  }
  root.render(
    <ErrorBoundary surface="In-page fallback">
      <InPagePanelFallback />
    </ErrorBoundary>,
  )
  return unmount
}
