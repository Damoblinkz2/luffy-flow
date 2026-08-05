import { useCallback, useEffect, useState } from "react"

import { createDefaultAdapterRegistry } from "~/adapters/create-default-registry"
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
