import { createContext, useContext, useEffect, type ReactNode } from "react"
import { useStore } from "zustand"
import type { StoreApi } from "zustand/vanilla"

import type { AuthStoreState } from "~/stores/auth-store"

const AuthStoreContext = createContext<StoreApi<AuthStoreState> | null>(null)

/** The provider accepts an injected vanilla store so every extension surface can share the pattern. */
export interface AuthProviderProps {
  store: StoreApi<AuthStoreState>
  children: ReactNode
}

/** Provider restores a persisted session once while keeping the store dependency injectable. */
export const AuthProvider = ({ store, children }: AuthProviderProps) => {
  useEffect(() => {
    if (store.getState().status === "idle") void store.getState().restore()
  }, [store])

  return <AuthStoreContext.Provider value={store}>{children}</AuthStoreContext.Provider>
}

/** Components select only the auth state they need and fail clearly outside the provider. */
export const useAuthStore = <T,>(selector: (state: AuthStoreState) => T): T => {
  const store = useContext(AuthStoreContext)
  if (store === null) throw new Error("useAuthStore must be used within AuthProvider.")
  return useStore(store, selector)
}
