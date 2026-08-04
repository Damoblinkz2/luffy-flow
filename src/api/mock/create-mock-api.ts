import { CURRENT_STORAGE_SCHEMA_VERSION } from "~/constants"
import { mockApiStateSchema, MockApiStateRepository } from "~/api/mock/state"
import { MockTransport, type MockTransportOptions } from "~/api/mock/MockTransport"
import { registerMockApiRoutes } from "~/api/mock/register-mock-routes"
import type { KeyValueStore } from "~/storage/contracts"
import { VersionedStorageNamespace } from "~/storage/VersionedStorageNamespace"
import { STORAGE_KEYS } from "~/storage/storage-keys"
import type { Clock } from "~/utils/time"
import { systemClock } from "~/utils/time"

/** Runtime ownership makes mock route cleanup explicit for tests and hot reloads. */
export interface MockApiRuntime {
  transport: MockTransport
  repository: MockApiStateRepository
  dispose(): void
}

/** The composition helper keeps mock persistence replaceable and lifecycle cleanup explicit. */
export const createMockApiRuntime = (
  store: KeyValueStore,
  transportOptions: MockTransportOptions,
  clock: Clock = systemClock,
): MockApiRuntime => {
  const namespace = new VersionedStorageNamespace({
    key: STORAGE_KEYS.mockApiState,
    currentVersion: CURRENT_STORAGE_SCHEMA_VERSION,
    schema: mockApiStateSchema,
    store,
    now: () => clock.now(),
  })
  const repository = new MockApiStateRepository(namespace, clock)
  const transport = new MockTransport(transportOptions)
  const dispose = registerMockApiRoutes(transport, repository, clock)

  return { transport, repository, dispose }
}
