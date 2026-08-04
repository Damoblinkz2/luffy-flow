import type { PlasmoCSConfig } from "plasmo"

import { createDefaultAdapterRegistry } from "~/adapters/create-default-registry"
import { observeUrlChanges } from "~/adapters/shared/url-observer"
import { readPublicAppConfig } from "~/config/env"
import { TypedMessageClient } from "~/messaging/client"
import { TypedMessageRouter } from "~/messaging/router"
import { listenForRuntimeMessages, RuntimeMessageTransport } from "~/messaging/runtime-transport"
import { createSettingsRepository } from "~/services/settings/create-settings-repository"
import { PlasmoKeyValueStore } from "~/storage/PlasmoKeyValueStore"

import { createContentCoordinator } from "./create-content-coordinator"
import { registerContentHandlers } from "./register-content-handlers"

/** Content injection stays limited to the three official platform origins and X's Grok route. */
export const config: PlasmoCSConfig = {
  matches: [
    "https://flow.google/*",
    "https://labs.google/fx/*",
    "https://www.labs.google/fx/*",
    "https://gemini.google.com/*",
    "https://grok.com/*",
    "https://www.grok.com/*",
    "https://x.com/i/grok*",
    "https://www.x.com/i/grok*",
  ],
  run_at: "document_idle",
}

let disposed = false
let unmountFallback: (() => void) | undefined
let disposeRuntime: (() => void) | undefined

/** Content startup loads validated adapter settings before exposing automation message handlers. */
const bootstrap = async (): Promise<void> => {
  const settingsRepository = createSettingsRepository(
    new PlasmoKeyValueStore("local"),
    readPublicAppConfig(),
  )
  const settings = await settingsRepository.get().catch(() => undefined)
  if (disposed) return
  const registry = createDefaultAdapterRegistry(settings?.platformAdapters)
  const router = new TypedMessageRouter("content")
  const backgroundClient = new TypedMessageClient("content", new RuntimeMessageTransport())
  const coordinator = createContentCoordinator(registry, backgroundClient)
  const unregisterHandlers = registerContentHandlers(router, coordinator)
  const stopListening = listenForRuntimeMessages((message, sender) => router.route(message, sender))
  const stopUrlObservation = observeUrlChanges((url) => coordinator.handleNavigation(url))
  disposeRuntime = () => {
    stopUrlObservation()
    stopListening()
    unregisterHandlers()
    coordinator.dispose()
  }
}

void bootstrap().catch(() => undefined)

// Browsers without Chrome's Side Panel API receive the Shadow-DOM in-page fallback.
if (chrome.sidePanel === undefined) {
  void import("~/sidepanel/mount-in-page-fallback").then(({ mountInPagePanelFallback }) => {
    if (!disposed) unmountFallback = mountInPagePanelFallback()
  })
}

const dispose = (): void => {
  if (disposed) return
  disposed = true
  unmountFallback?.()
  disposeRuntime?.()
}

globalThis.addEventListener("pagehide", dispose, { once: true })
