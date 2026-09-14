import type { TypedMessageRouter } from "~/messaging/router"

import type { ContentAutomationCoordinator } from "./ContentAutomationCoordinator"
import { setNativeSidePanelVisible } from "./side-panel-visibility"

/** Content handlers accept privileged commands only from the validated background source. */
export const registerContentHandlers = (
  router: TypedMessageRouter,
  coordinator: ContentAutomationCoordinator,
): (() => void) => {
  const cleanup = [
    router.register("prompt/submit", ["background"], (message) => coordinator.submit(message)),
    router.register("command/cancel", ["background"], (message) =>
      coordinator.cancel(message.payload.commandId, message.payload.reason),
    ),
    router.register("sidepanel/visibility/changed", ["background"], (message) => {
      setNativeSidePanelVisible(message.payload.visible)
      return message.payload
    }),
    router.register("platform/status/get", ["background"], (message, sender) => {
      const tabId = sender.tab?.id ?? message.payload.tabId
      if (tabId === undefined) throw new Error("Platform status requires a target tab.")
      return coordinator.getPlatformStatus(tabId)
    }),
  ]
  return () => cleanup.forEach((dispose) => dispose())
}
