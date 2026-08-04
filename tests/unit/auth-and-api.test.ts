import { z } from "zod"
import { describe, expect, it, vi } from "vitest"

import { ApiClient } from "~/api/client/ApiClient"
import type { ApiTransport } from "~/api/client/contracts"
import { createMockApiRuntime } from "~/api/mock/create-mock-api"
import { AuthApiClient } from "~/api/modules/auth-api"
import { DEMO_ACCOUNT } from "~/constants"
import { AutoflowError } from "~/errors/autoflow-error"
import { Logger } from "~/logging/logger"
import { authSessionSchema } from "~/schemas"
import { AuthService } from "~/services/auth/auth-service"
import { DelegatingAuthTokenProvider } from "~/services/auth/delegating-token-provider"
import { VersionedStorageNamespace } from "~/storage/VersionedStorageNamespace"
import { createAuthStore } from "~/stores/auth-store"

import { fixedClock } from "../helpers/fixtures"
import { MemoryKeyValueStore } from "../helpers/memory"

const logger = new Logger("test", {
  minimumLevel: "error",
  privacyMode: true,
  sink: { write: vi.fn() },
  clock: fixedClock,
})

describe("mock authentication and auth store", () => {
  it("logs in through the persisted mock API and updates UI state", async () => {
    const values = new MemoryKeyValueStore()
    const mock = createMockApiRuntime(values, { latencyMs: 0, failureRate: 0 }, fixedClock)
    const sessionStorage = new VersionedStorageNamespace({
      key: "test.auth",
      currentVersion: 1,
      schema: authSessionSchema,
      store: values,
      now: fixedClock.now,
    })
    const tokenProvider = new DelegatingAuthTokenProvider()
    const client = new ApiClient({
      baseUrl: "https://mock.autoflow.test",
      defaultTimeoutMs: 5_000,
      maximumSafeRetryCount: 2,
      retryBaseDelayMs: 0,
      transport: mock.transport,
      tokenProvider,
      logger,
      random: () => 0,
    })
    const service = new AuthService(new AuthApiClient(client), sessionStorage, logger, fixedClock)
    tokenProvider.setDelegate(service)
    const store = createAuthStore(service)

    await store.getState().login(DEMO_ACCOUNT)

    expect(store.getState().status).toBe("authenticated")
    expect(store.getState().session?.user.email).toBe(DEMO_ACCOUNT.email)
    expect(await sessionStorage.get()).not.toBeNull()

    await store.getState().logout()
    expect(store.getState()).toMatchObject({ status: "unauthenticated", session: null })
    expect(await sessionStorage.get()).toBeNull()
    mock.dispose()
  })

  it("surfaces safe login errors in the store", async () => {
    const error = new AutoflowError({
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
      baseUrl: "https://api.autoflow.test",
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
  })

  it("does not retry an unsafe mutation and rejects invalid JSON", async () => {
    const execute = vi.fn<ApiTransport["execute"]>().mockResolvedValue({
      status: 200,
      headers: {},
      bodyText: "not-json",
    })
    const client = new ApiClient({
      baseUrl: "https://api.autoflow.test",
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
})
