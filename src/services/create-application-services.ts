import { ApiClient } from "~/api/client/ApiClient"
import type { ApiTransport } from "~/api/client/contracts"
import { AuthApiClient } from "~/api/modules/auth-api"
import { BillingApiClient } from "~/api/modules/billing-api"
import { TokenApiClient } from "~/api/modules/token-api"
import { HttpTransport } from "~/api/transports/HttpTransport"
import { DEFAULT_API_RETRY_BASE_DELAY_MS, DEFAULT_API_RETRY_COUNT } from "~/constants"
import { readPublicAppConfig, type PublicAppConfig } from "~/config/env"
import { Logger } from "~/logging/logger"
import { AuthService } from "~/services/auth/auth-service"
import { createAuthSessionStorage } from "~/services/auth/create-auth-storage"
import { DelegatingAuthTokenProvider } from "~/services/auth/delegating-token-provider"
import { TokenBillingService } from "~/services/billing/token-billing-service"
import { OutputNamingService } from "~/services/naming/OutputNamingService"
import { OutputCaptureService } from "~/services/outputs/OutputCaptureService"
import { PromptImportService } from "~/services/prompts/PromptImportService"
import { QueueService } from "~/services/queue/QueueService"
import { createSettingsRepository } from "~/services/settings/create-settings-repository"
import type { KeyValueStore } from "~/storage/contracts"
import { PlasmoKeyValueStore } from "~/storage/PlasmoKeyValueStore"
import { createLocalRepositories } from "~/storage/repositories/create-local-repositories"
import { createAuthStore, type AuthStoreState } from "~/stores/auth-store"
import { createBillingStore, type BillingStoreState } from "~/stores/billing-store"
import type { StoreApi } from "zustand/vanilla"

/** UI surfaces receive stores while future background code can use the same services directly. */
export interface ApplicationServices {
  config: PublicAppConfig
  logger: Logger
  authService: AuthService
  tokenBillingService: TokenBillingService
  promptImportService: PromptImportService
  queueService: QueueService
  outputCaptureService: OutputCaptureService
  repositories: ReturnType<typeof createLocalRepositories>
  settingsRepository: ReturnType<typeof createSettingsRepository>
  authStore: StoreApi<AuthStoreState>
  billingStore: StoreApi<BillingStoreState>
  dispose(): void
}

/** Optional dependencies keep composition deterministic in later unit and integration tests. */
export interface ApplicationServiceOptions {
  config?: PublicAppConfig
  keyValueStore?: KeyValueStore
  transport?: ApiTransport
  logger?: Logger
}

/** One composition root wires every runtime surface to the configured HTTP API. */
export const createApplicationServices = (
  options: ApplicationServiceOptions = {},
): ApplicationServices => {
  const config = options.config ?? readPublicAppConfig()
  const keyValueStore = options.keyValueStore ?? new PlasmoKeyValueStore("local")
  const logger =
    options.logger ??
    new Logger("luffyflow", {
      minimumLevel: config.appEnvironment === "development" ? "debug" : "info",
      privacyMode: true,
    })

  // Tests may inject a deterministic transport; production always uses the real fetch boundary.
  const transport = options.transport ?? new HttpTransport()
  // Remove obsolete seeded-development state when an existing installation upgrades.
  void Promise.all([
    keyValueStore.remove("luffyflow:auth"),
    keyValueStore.remove("luffyflow:mock-api"),
    keyValueStore.remove("luffyflow:mock-api-v2"),
  ]).catch((error: unknown) => logger.warn("Legacy development state could not be removed.", error))
  const tokenProvider = new DelegatingAuthTokenProvider()
  const apiClient = new ApiClient({
    baseUrl: config.apiBaseUrl,
    defaultTimeoutMs: config.apiTimeoutMs,
    maximumSafeRetryCount: DEFAULT_API_RETRY_COUNT,
    retryBaseDelayMs: DEFAULT_API_RETRY_BASE_DELAY_MS,
    transport,
    logger: logger.child("api"),
    tokenProvider,
  })

  const authService = new AuthService(
    new AuthApiClient(apiClient),
    createAuthSessionStorage(keyValueStore),
    logger.child("auth"),
  )
  tokenProvider.setDelegate(authService)

  const tokenBillingService = new TokenBillingService(
    new BillingApiClient(apiClient),
    new TokenApiClient(apiClient),
  )
  const repositories = createLocalRepositories(keyValueStore)
  const settingsRepository = createSettingsRepository(keyValueStore, config)
  const queueService = new QueueService(repositories.queue, repositories.prompts)
  const namingService = new OutputNamingService(repositories.sequences, repositories.outputs)
  const outputCaptureService = new OutputCaptureService(
    repositories.prompts,
    repositories.outputs,
    namingService,
    queueService,
    async () => {
      const settings = await settingsRepository.get()
      return {
        outputNamingPattern: settings.outputNamingPattern,
        sequencePadding: settings.sequencePadding,
        sequenceScope: settings.sequenceScope,
        defaultOutputFileFormat: settings.defaultOutputFileFormat,
      }
    },
  )

  return {
    config,
    logger,
    authService,
    tokenBillingService,
    promptImportService: new PromptImportService(),
    queueService,
    outputCaptureService,
    repositories,
    settingsRepository,
    authStore: createAuthStore(authService),
    billingStore: createBillingStore(tokenBillingService),
    dispose: () => {
      repositories.close()
    },
  }
}
