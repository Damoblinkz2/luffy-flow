import { createContext, useContext, useEffect, type ReactNode } from "react"
import { useStore } from "zustand"
import type { StoreApi } from "zustand/vanilla"

import type { AuthStoreState } from "~/stores/auth-store"
import { STORAGE_KEYS } from "~/storage/storage-keys"

const AuthStoreContext = createContext<StoreApi<AuthStoreState> | null>(null)

/** The provider accepts an injected vanilla store so every extension surface can share the pattern. */
export interface AuthProviderProps {
  store: StoreApi<AuthStoreState>
  children: ReactNode
}

/** Provider restores once, then follows shared authentication changes from other extension pages. */
export const AuthProvider = ({ store, children }: AuthProviderProps) => {
  useEffect(() => {
    if (store.getState().status === "idle") void store.getState().restore()
  }, [store])

  useEffect(() => {
    // Every extension document has its own service graph. Listening to the shared storage key
    // makes a login in the dashboard immediately update the open side panel and popup as well.
    const onStorageChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ): void => {
      if (areaName !== "local" || changes[STORAGE_KEYS.authentication] === undefined) return
      void store
        .getState()
        .synchronize()
        .catch(() => undefined)
    }
    chrome.storage.onChanged.addListener(onStorageChanged)
    return () => chrome.storage.onChanged.removeListener(onStorageChanged)
  }, [store])

  return <AuthStoreContext.Provider value={store}>{children}</AuthStoreContext.Provider>
}

/** Components select only the auth state they need and fail clearly outside the provider. */
export const useAuthStore = <T,>(selector: (state: AuthStoreState) => T): T => {
  const store = useContext(AuthStoreContext)
  if (store === null) throw new Error("useAuthStore must be used within AuthProvider.")
  return useStore(store, selector)
}
