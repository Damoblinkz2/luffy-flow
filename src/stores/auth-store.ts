import { createStore, type StoreApi } from "zustand/vanilla"

import { AutoflowError } from "~/errors/autoflow-error"
import type { AuthService } from "~/services/auth/auth-service"
import type { AuthSession, LoginRequest, SignupRequest } from "~/schemas/auth"

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated" | "error"

/** Auth UI state exposes commands without leaking API or storage implementation details. */
export interface AuthStoreState {
  status: AuthStatus
  session: AuthSession | null
  error: string | null
  notice: string | null
  restore(): Promise<void>
  login(request: LoginRequest): Promise<void>
  signup(request: SignupRequest): Promise<void>
  logout(): Promise<void>
  forgotPassword(email: string): Promise<void>
  clearFeedback(): void
}

/** The auth store keeps only UI state; durable session ownership remains in AuthService. */
export const createAuthStore = (service: AuthService): StoreApi<AuthStoreState> =>
  createStore<AuthStoreState>()((set) => ({
    status: "idle",
    session: null,
    error: null,
    notice: null,
    restore: async () => {
      set({ status: "loading", error: null })
      try {
        const session = await service.restoreSession()
        set({
          session,
          status: session === null ? "unauthenticated" : "authenticated",
          error: null,
        })
      } catch (error) {
        set({ status: "unauthenticated", session: null, error: messageFromError(error) })
      }
    },
    login: async (request) => {
      set({ status: "loading", error: null, notice: null })
      try {
        set({ status: "authenticated", session: await service.login(request), error: null })
      } catch (error) {
        set({ status: "error", session: null, error: messageFromError(error) })
        throw error
      }
    },
    signup: async (request) => {
      set({ status: "loading", error: null, notice: null })
      try {
        set({ status: "authenticated", session: await service.signup(request), error: null })
      } catch (error) {
        set({ status: "error", session: null, error: messageFromError(error) })
        throw error
      }
    },
    logout: async () => {
      set({ status: "loading", error: null, notice: null })
      await service.logout()
      set({ status: "unauthenticated", session: null, error: null })
    },
    forgotPassword: async (email) => {
      set({ status: "loading", error: null, notice: null })
      try {
        await service.forgotPassword(email)
        set({
          status: "unauthenticated",
          notice: "If that account exists, mock reset instructions have been accepted.",
        })
      } catch (error) {
        set({ status: "error", error: messageFromError(error) })
        throw error
      }
    },
    clearFeedback: () => set({ error: null, notice: null }),
  }))

const messageFromError = (error: unknown): string =>
  error instanceof AutoflowError
    ? error.userMessage
    : error instanceof Error
      ? error.message
      : "An unexpected authentication error occurred."
