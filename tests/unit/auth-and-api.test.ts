import { z } from "zod"
import { describe, expect, it, vi } from "vitest"

import { ApiClient } from "~/api/client/ApiClient"
import type { ApiTransport } from "~/api/client/contracts"
import type { AuthApi } from "~/api/modules/auth-api"
import { LuffyflowError } from "~/errors/luffyflow-error"
import { Logger } from "~/logging/logger"
import { authSessionSchema } from "~/schemas"
import { AuthService } from "~/services/auth/auth-service"
import { VersionedStorageNamespace } from "~/storage/VersionedStorageNamespace"
import { createAuthStore } from "~/stores/auth-store"

import { fixedClock, fixedNow, ids } from "../helpers/fixtures"
import { MemoryKeyValueStore } from "../helpers/memory"

const logger = new Logger("test", {
  minimumLevel: "error",
  privacyMode: true,
  sink: { write: vi.fn() },
  clock: fixedClock,
})

describe("authentication and auth store", () => {
  it("keeps a new account signed out until its email is verified", async () => {
    const sessionStorage = new VersionedStorageNamespace({
      key: "test.signup-auth",
      currentVersion: 1,
      schema: authSessionSchema,
      store: new MemoryKeyValueStore(),
      now: fixedClock.now,
    })
    const api = {
      signup: vi.fn(() =>
        Promise.resolve({ verificationRequired: true as const, email: "new@example.com" }),
      ),
    } as unknown as AuthApi
    const store = createAuthStore(new AuthService(api, sessionStorage, logger, fixedClock))

    await store.getState().signup({
      email: "new@example.com",
      displayName: "New person",
      password: "Secure-Password1!",
    })

    expect(store.getState()).toMatchObject({ status: "unauthenticated", session: null })
    expect(store.getState().notice).toContain("verification link")
    expect(await sessionStorage.get()).toBeNull()
  })

  it("persists an API login response and updates UI state", async () => {
    const values = new MemoryKeyValueStore()
    const sessionStorage = new VersionedStorageNamespace({
      key: "test.auth",
      currentVersion: 1,
      schema: authSessionSchema,
      store: values,
      now: fixedClock.now,
    })
    const credentials = { email: "person@example.com", password: "Secure-Password1!" }
    const response = {
      user: {
        id: ids.user,
        email: credentials.email,
        displayName: "Person",
        role: "user" as const,
        status: "active" as const,
        emailVerified: true,
        createdAt: fixedNow.toISOString(),
        updatedAt: fixedNow.toISOString(),
      },
      tokens: {
        accessToken: "access-token-that-is-long-enough",
        refreshToken: "refresh-token-that-is-long-enough",
        expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
      },
    }
    const api = {
      login: vi.fn(() => Promise.resolve(response)),
      logout: vi.fn(() => Promise.resolve()),
    } as unknown as AuthApi
    const service = new AuthService(api, sessionStorage, logger, fixedClock)
    const store = createAuthStore(service)

    await store.getState().login(credentials)

    expect(store.getState().status).toBe("authenticated")
    expect(store.getState().session?.user.email).toBe(credentials.email)
    expect(await sessionStorage.get()).not.toBeNull()

    await store.getState().logout()
    expect(store.getState()).toMatchObject({ status: "unauthenticated", session: null })
    expect(await sessionStorage.get()).toBeNull()
    expect(api.logout).toHaveBeenCalledOnce()
  })

  it("reloads a session written by another extension document after an earlier signed-out read", async () => {
    const values = new MemoryKeyValueStore()
    const sessionStorage = new VersionedStorageNamespace({
      key: "test.shared-auth",
      currentVersion: 1,
      schema: authSessionSchema,
      store: values,
      now: fixedClock.now,
    })
    const session = {
      user: {
        id: ids.user,
        email: "person@example.com",
        displayName: "Person",
        role: "user" as const,
        status: "active" as const,
        emailVerified: true,
        createdAt: fixedNow.toISOString(),
        updatedAt: fixedNow.toISOString(),
      },
      tokens: {
        accessToken: "access-token-written-in-dashboard",
        refreshToken: "refresh-token-written-in-dashboard",
        expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
      },
    }
    const api = { me: vi.fn(() => Promise.resolve(session.user)) } as unknown as AuthApi
    const service = new AuthService(api, sessionStorage, logger, fixedClock)

    // This represents an open side panel or background worker before the dashboard login.
    await expect(service.restoreSession()).resolves.toBeNull()
    await sessionStorage.set(session)

    await expect(service.restoreSession({ reloadStorage: true })).resolves.toMatchObject({
      user: { email: "person@example.com" },
      tokens: { accessToken: "access-token-written-in-dashboard" },
    })
    expect(api.me).toHaveBeenCalledOnce()
  })

  it("surfaces safe login errors in the store", async () => {
    const error = new LuffyflowError({
      code: "AUTH_INVALID_CREDENTIALS",
      category: "authentication",
      userMessage: "The email or password is incorrect.",
    })
    const service = {
      login: vi.fn().mockRejectedValue(error),
    } as unknown as AuthService
    const store = createAuthStore(service)

    await expect(
      store.getState().login({ email: "person@example.com", password: "Incorrect123!" }),
    ).rejects.toBe(error)
    expect(store.getState()).toMatchObject({
      status: "error",
      session: null,
      error: "The email or password is incorrect.",
    })
  })
})

describe("API client error handling", () => {
  it("retries a safe GET and validates the eventual response", async () => {
    const execute = vi
      .fn<ApiTransport["execute"]>()
      .mockResolvedValueOnce({ status: 503, headers: {}, bodyText: "{}" })
      .mockResolvedValueOnce({ status: 200, headers: {}, bodyText: '{"value":"ready"}' })
    const client = new ApiClient({
      baseUrl: "https://api.luffyflow.test/api/v1",
      defaultTimeoutMs: 1_000,
      maximumSafeRetryCount: 1,
      retryBaseDelayMs: 0,
      transport: { execute },
      logger,
      random: () => 0,
    })

    await expect(
      client.request({ method: "GET", path: "/health" }, z.object({ value: z.string() })),
    ).resolves.toEqual({ value: "ready" })
    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ url: "https://api.luffyflow.test/api/v1/health" }),
    )
    const firstRequest = execute.mock.calls[0]?.[0]
    expect(firstRequest?.headers["X-Request-Id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it("does not retry an unsafe mutation and rejects invalid JSON", async () => {
    const execute = vi.fn<ApiTransport["execute"]>().mockResolvedValue({
      status: 200,
      headers: {},
      bodyText: "not-json",
    })
    const client = new ApiClient({
      baseUrl: "https://api.luffyflow.test",
      defaultTimeoutMs: 1_000,
      maximumSafeRetryCount: 3,
      retryBaseDelayMs: 0,
      transport: { execute },
      logger,
    })

    await expect(
      client.request({ method: "POST", path: "/unsafe", body: { value: 1 } }, z.object({})),
    ).rejects.toMatchObject({ code: "API_RESPONSE_NOT_JSON", category: "invalid_data" })
    expect(execute).toHaveBeenCalledOnce()
  })

  it("reads the production error envelope and classifies an empty token wallet", async () => {
    const execute = vi.fn<ApiTransport["execute"]>().mockResolvedValue({
      status: 402,
      headers: {},
      bodyText: JSON.stringify({
        error: { code: "usage_limit", message: "Your token balance is empty." },
      }),
    })
    const client = new ApiClient({
      baseUrl: "https://api.luffyflow.test",
      defaultTimeoutMs: 1_000,
      maximumSafeRetryCount: 2,
      retryBaseDelayMs: 0,
      transport: { execute },
      logger,
    })

    await expect(
      client.request({ method: "GET", path: "/tokens/balance" }, z.object({})),
    ).rejects.toMatchObject({
      code: "usage_limit",
      category: "usage_limit",
      userMessage: "Your token balance is empty.",
    })
    expect(execute).toHaveBeenCalledOnce()
  })
})
