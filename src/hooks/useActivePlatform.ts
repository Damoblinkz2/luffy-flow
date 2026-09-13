import { useCallback, useEffect, useState } from "react"

import { createDefaultAdapterRegistry } from "~/adapters/create-default-registry"
import { TypedMessageClient } from "~/messaging/client"
import { RuntimeMessageTransport } from "~/messaging/runtime-transport"
import { platformStatusSnapshotSchema } from "~/schemas"
import type { SupportedPlatform } from "~/schemas"

export interface ActivePlatformSnapshot {
  loading: boolean
  supported: boolean
  tabId?: number
  url?: string
  platform?: SupportedPlatform
  displayName?: string
  adapterVersion?: string
  error?: string
}

/** Active-tab inspection uses the tabs permission without reading page content or query parameters. */
export const useActivePlatform = (): ActivePlatformSnapshot & { refresh(): void } => {
  const [snapshot, setSnapshot] = useState<ActivePlatformSnapshot>({
    loading: true,
    supported: false,
  })
  const [refreshIndex, setRefreshIndex] = useState(0)
  const refresh = useCallback(() => setRefreshIndex((value) => value + 1), [])

  useEffect(() => {
    let active = true
    const inspect = async (): Promise<void> => {
      try {
        // Content scripts cannot use chrome.tabs. Ask the background for the
        // sender tab instead, so the in-page drawer has the correct tab ID for
        // starting automation and never crashes after its launcher is clicked.
        if (globalThis.location.protocol !== "chrome-extension:") {
          const status = await new TypedMessageClient(
            "in_page_panel",
            new RuntimeMessageTransport(),
          ).send({
            kind: "platform/status/get",
            target: "background",
            payload: {},
            responseSchema: platformStatusSnapshotSchema,
          })
          if (!active) return
          const url = new URL(globalThis.location.href)
          setSnapshot({
            loading: false,
            supported: status.supported,
            tabId: status.tabId,
            url: `${url.origin}${url.pathname}`,
            ...(status.platform === undefined
              ? {}
              : {
                  platform: status.platform,
                  displayName: platformLabel(status.platform),
                }),
            ...(status.adapterHealth === undefined
              ? {}
              : { adapterVersion: status.adapterHealth.adapterVersion }),
          })
          return
        }
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!active) return
        if (tab?.id === undefined || tab.url === undefined) {
          setSnapshot({ loading: false, supported: false, error: "The active tab is unavailable." })
          return
        }
        const url = new URL(tab.url)
        const registry = createDefaultAdapterRegistry()
        const adapter = registry.detect(url)
        registry.dispose()
        const safeUrl = `${url.origin}${url.pathname}`
        setSnapshot(
          adapter === null
            ? { loading: false, supported: false, tabId: tab.id, url: safeUrl }
            : {
                loading: false,
                supported: true,
                tabId: tab.id,
                url: safeUrl,
                platform: adapter.id,
                displayName: adapter.displayName,
                adapterVersion: adapter.version,
              },
        )
      } catch {
        if (active) {
          setSnapshot({
            loading: false,
            supported: false,
            error: "LuffyFlow could not inspect the active tab.",
          })
        }
      }
    }
    void inspect()
    if (globalThis.location.protocol !== "chrome-extension:") {
      return () => {
        active = false
      }
    }
    const onActivated = (): void => void inspect()
    const onUpdated = (_tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo): void => {
      if (changeInfo.url !== undefined || changeInfo.status === "complete") void inspect()
    }
    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onUpdated)
    return () => {
      active = false
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
  }, [refreshIndex])

  return { ...snapshot, refresh }
}

/** Keep platform labels consistent when an in-page component receives background status. */
const platformLabel = (platform: SupportedPlatform): string =>
  ({
    "google-flow": "Google Flow",
    gemini: "Gemini",
    grok: "Grok",
    "meta-ai": "Meta AI",
  })[platform]
