import { BackgroundQueueCoordinator } from "~/background/BackgroundQueueCoordinator"
import { LuffyflowError } from "~/errors/luffyflow-error"
import { createMessage } from "~/messaging/envelope"
import { listenForRuntimeMessages, TabMessageTransport } from "~/messaging/runtime-transport"
import { TypedMessageClient } from "~/messaging/client"
import { TypedMessageRouter } from "~/messaging/router"
import type { QueueState } from "~/schemas"
import { platformStatusSnapshotSchema } from "~/schemas"
import { createApplicationServices } from "~/services/create-application-services"
import { DownloadService } from "~/services/downloads/DownloadService"

/** Runtime ownership exposes cleanup for development reloads and browser API tests. */
export interface BackgroundRuntime {
  coordinator: BackgroundQueueCoordinator
  dispose(): void
}

/** Background startup restores durable queue state and registers one validated message boundary. */
export const createBackgroundRuntime = (): BackgroundRuntime => {
  const services = createApplicationServices()
  const getAuthenticatedUserId = async (): Promise<string> => {
    const session = await services.authService.restoreSession()
    if (session === null) {
      throw new LuffyflowError({
        code: "AUTH_REQUIRED",
        category: "authentication",
        userMessage: "Log in to LuffyFlow before changing or starting a queue.",
      })
    }
    return session.user.id
  }
  const router = new TypedMessageRouter("background")
  const coordinator = new BackgroundQueueCoordinator({
    queueService: services.queueService,
    queues: services.repositories.queue,
    prompts: services.repositories.prompts,
    outputs: services.repositories.outputs,
    outputCapture: services.outputCaptureService,
    getAuthenticatedUserId,
    authorizeStart: async () => {
      const userId = await getAuthenticatedUserId()
      const snapshot = await services.subscriptionService.load()
      if (snapshot.usage.remaining <= 0) {
        throw new LuffyflowError({
          code: "USAGE_LIMIT_REACHED",
          category: "usage_limit",
          userMessage: "Your monthly prompt limit has been reached.",
        })
      }
      return userId
    },
    getSettings: () => services.settingsRepository.get(),
    createContentClient: (tabId) =>
      new TypedMessageClient("background", new TabMessageTransport(tabId)),
    publishQueue: publishQueueState,
    logger: services.logger.child("queue"),
  })
  const downloadService = new DownloadService({
    outputs: services.repositories.outputs,
    getAuthenticatedUserId,
  })
  const unregisterHandlers = coordinator.register(router)
  const unregisterDownloadHandlers = downloadService.register(router)
  const unregisterPlatformHandler = router.register(
    "platform/status/get",
    ["popup", "dashboard", "options", "sidepanel", "in_page_panel"],
    async (message) => {
      const tabId = message.payload.tabId ?? (await activeTabId())
      return new TypedMessageClient("background", new TabMessageTransport(tabId)).send({
        kind: "platform/status/get",
        target: "content",
        payload: { tabId },
        responseSchema: platformStatusSnapshotSchema,
      })
    },
  )
  const stopListening = listenForRuntimeMessages((message, sender) => router.route(message, sender))
  void coordinator.recover().catch((error: unknown) => {
    services.logger.error("Queue recovery failed during worker startup.", error)
  })

  return {
    coordinator,
    dispose: () => {
      stopListening()
      unregisterDownloadHandlers()
      unregisterPlatformHandler()
      unregisterHandlers()
      downloadService.dispose()
      services.dispose()
    },
  }
}

const activeTabId = async (): Promise<number> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id === undefined) {
    throw new LuffyflowError({
      code: "ACTIVE_TAB_UNAVAILABLE",
      category: "platform_unsupported",
      userMessage: "LuffyFlow could not find an active platform tab.",
      recoverable: true,
    })
  }
  return tab.id
}

/** Queue broadcasts are best-effort because extension pages may be closed or suspended. */
const publishQueueState = (queue: QueueState): Promise<void> => {
  const message = createMessage({
    kind: "queue/state/changed",
    source: "background",
    target: "ui",
    payload: { queue },
  })
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, () => {
      void chrome.runtime.lastError
      resolve()
    })
  })
}
