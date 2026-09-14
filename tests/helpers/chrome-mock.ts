import { vi } from "vitest"

export interface ChromeMockControls {
  downloadRequests: chrome.downloads.DownloadOptions[]
  emitDownloadChanged(delta: chrome.downloads.DownloadDelta): void
  emitStorageChanged(changes: Record<string, chrome.storage.StorageChange>, areaName?: string): void
  storedValues: Map<string, unknown>
}

export type ChromeMock = typeof chrome & { __controls: ChromeMockControls }

/** Creates an isolated Chrome API double with observable storage and download side effects. */
export const createChromeMock = (): ChromeMock => {
  const storedValues = new Map<string, unknown>()
  const downloadRequests: chrome.downloads.DownloadOptions[] = []
  const downloadListeners = new Set<(delta: chrome.downloads.DownloadDelta) => void>()
  const storageChangeListeners = new Set<
    (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void
  >()
  let nextDownloadId = 1

  const controls: ChromeMockControls = {
    downloadRequests,
    storedValues,
    emitDownloadChanged: (delta) => {
      for (const listener of downloadListeners) listener(delta)
    },
    // Tests can model a login occurring in a separate extension document without coupling the
    // mock's low-level storage writes to React's asynchronous update lifecycle.
    emitStorageChanged: (changes, areaName = "local") => {
      for (const listener of storageChangeListeners) listener(changes, areaName)
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
      onChanged: {
        addListener: vi.fn(
          (
            listener: (
              changes: Record<string, chrome.storage.StorageChange>,
              areaName: string,
            ) => void,
          ) => storageChangeListeners.add(listener),
        ),
        removeListener: vi.fn(
          (
            listener: (
              changes: Record<string, chrome.storage.StorageChange>,
              areaName: string,
            ) => void,
          ) => storageChangeListeners.delete(listener),
        ),
      },
      local: {
        get: vi.fn((key: string, callback?: (items: Record<string, unknown>) => void) => {
          const items = storedValues.has(key) ? { [key]: storedValues.get(key) } : {}
          callback?.(items)
          return callback === undefined ? Promise.resolve(items) : undefined
        }),
        set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
          for (const [key, value] of Object.entries(items)) storedValues.set(key, value)
          callback?.()
          return callback === undefined ? Promise.resolve() : undefined
        }),
        remove: vi.fn((key: string, callback?: () => void) => {
          storedValues.delete(key)
          callback?.()
          return callback === undefined ? Promise.resolve() : undefined
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

/** Exposes test-only controls attached to the currently installed global Chrome mock. */
export const chromeControls = (): ChromeMockControls => (globalThis.chrome as ChromeMock).__controls
