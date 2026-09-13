import { useMemo, useState } from "react"

import { BrandLogo, Button } from "~/components/common"
import { LuffyflowError } from "~/errors/luffyflow-error"
import { TypedMessageClient } from "~/messaging/client"
import { RuntimeMessageTransport } from "~/messaging/runtime-transport"
import { sidePanelOpenResultSchema } from "~/schemas"

/** This Shadow-DOM launcher opens Chrome's native panel instead of covering the AI page. */
export const InPagePanelFallback = () => {
  const client = useMemo(
    () => new TypedMessageClient("in_page_panel", new RuntimeMessageTransport()),
    [],
  )
  const [opening, setOpening] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  /** Ask the background worker to open the browser-owned, resizeable side panel for this tab. */
  const openNativeSidePanel = async (): Promise<void> => {
    setOpening(true)
    setMessage(null)
    try {
      await client.send({
        kind: "sidepanel/open",
        target: "background",
        payload: {},
        responseSchema: sidePanelOpenResultSchema,
      })
      setMessage("LuffyFlow opened in the browser side panel. Drag its divider to resize it.")
    } catch (error) {
      setMessage(
        error instanceof LuffyflowError
          ? error.userMessage
          : "LuffyFlow could not open the browser side panel.",
      )
    } finally {
      setOpening(false)
    }
  }

  return (
    <div>
      <Button
        className="fixed bottom-4 right-4 z-[2147483647] shadow-panel"
        busy={opening}
        onClick={(event) => {
          // Supported AI apps frequently listen for document clicks. Keep this
          // extension-owned control from being interpreted as a page interaction.
          event.preventDefault()
          event.stopPropagation()
          void openNativeSidePanel()
        }}
        style={{
          position: "fixed",
          right: "16px",
          bottom: "16px",
          zIndex: 2_147_483_647,
          minHeight: "48px",
        }}
      >
        <BrandLogo showName={false} />
        <span>Open LuffyFlow</span>
      </Button>
      {message === null ? null : (
        <p
          className="fixed bottom-20 right-4 z-[2147483647] max-w-xs rounded-xl border bg-background p-3 text-sm text-foreground shadow-panel"
          role="status"
          style={{
            position: "fixed",
            right: "16px",
            bottom: "80px",
            zIndex: 2_147_483_647,
            maxWidth: "320px",
            background: "#ffffff",
            color: "#172033",
          }}
        >
          {message}
        </p>
      )}
    </div>
  )
}
