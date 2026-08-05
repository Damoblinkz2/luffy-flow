import { vi } from "vitest"

export interface ChromeMockControls {
  downloadRequests: chrome.downloads.DownloadOptions[]
  emitDownloadChanged(delta: chrome.downloads.DownloadDelta): void
  storedValues: Map<string, unknown>
}

export type ChromeMock = typeof chrome & { __controls: ChromeMockControls }

export const createChromeMock = (): ChromeMock => {
  const storedValues = new Map<string, unknown>()
  const downloadRequests: chrome.downloads.DownloadOptions[] = []
  const downloadListeners = new Set<(delta: chrome.downloads.DownloadDelta) => void>()
  let nextDownloadId = 1

  const controls: ChromeMockControls = {
    downloadRequests,
    storedValues,
    emitDownloadChanged: (delta) => {
      for (const listener of downloadListeners) listener(delta)
    },
  }

  const chromeMock = {
    __controls: controls,
    runtime: {
      id: "luffyflow-test-extension",
      lastError: undefined,
      getURL: (path: string) => `chrome-extension://luffyflow-test-extension/${path}`,
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    storage: {
      local: {
        get: vi.fn((key: string, callback: (items: Record<string, unknown>) => void) =>
          callback(storedValues.has(key) ? { [key]: storedValues.get(key) } : {}),
        ),
        set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
          for (const [key, value] of Object.entries(items)) storedValues.set(key, value)
          callback?.()
        }),
        remove: vi.fn((key: string, callback?: () => void) => {
          storedValues.delete(key)
          callback?.()
        }),
      },
    },
    downloads: {
      download: vi.fn(
        (options: chrome.downloads.DownloadOptions, callback: (id: number) => void) => {
          downloadRequests.push(options)
          callback(nextDownloadId++)
        },
      ),
      onChanged: {
        addListener: vi.fn((listener: (delta: chrome.downloads.DownloadDelta) => void) =>
          downloadListeners.add(listener),
        ),
        removeListener: vi.fn((listener: (delta: chrome.downloads.DownloadDelta) => void) =>
          downloadListeners.delete(listener),
        ),
      },
    },
    tabs: {
      query: vi.fn(() => Promise.resolve([])),
      create: vi.fn(() => Promise.resolve(undefined)),
      sendMessage: vi.fn(),
      onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    windows: { getCurrent: vi.fn(() => Promise.resolve({ id: 1 })) },
    sidePanel: { open: vi.fn(() => Promise.resolve(undefined)) },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(() => Promise.resolve(true)),
      onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  }

  return chromeMock as unknown as ChromeMock
}

export const chromeControls = (): ChromeMockControls => (globalThis.chrome as ChromeMock).__controls
