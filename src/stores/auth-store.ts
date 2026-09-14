import { createStore, type StoreApi } from "zustand/vanilla"

import { LuffyflowError } from "~/errors/luffyflow-error"
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
  synchronize(): Promise<void>
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
    // Storage change events use this lightweight path so another extension document's login
    // is reflected here without issuing a second `/auth/me` request or rewriting the session.
    synchronize: async () => {
      set({ status: "loading", error: null })
      try {
        const session = await service.synchronizeSession()
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
        const result = await service.signup(request)
        set({
          status: "unauthenticated",
          session: null,
          error: null,
          notice: `We sent a verification link to ${result.email}. Verify your email before logging in.`,
        })
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
          notice: "If that account exists, the password-reset request has been accepted.",
        })
      } catch (error) {
        set({ status: "error", error: messageFromError(error) })
        throw error
      }
    },
    clearFeedback: () => set({ error: null, notice: null }),
  }))

/** Reduces authentication failures to safe messages suitable for persistent store state. */
const messageFromError = (error: unknown): string =>
  error instanceof LuffyflowError
    ? error.userMessage
    : error instanceof Error
      ? error.message
      : "An unexpected authentication error occurred."
