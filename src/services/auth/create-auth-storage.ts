import { CURRENT_STORAGE_SCHEMA_VERSION } from "~/constants"
import { authSessionSchema, type AuthSession } from "~/schemas/auth"
import type { KeyValueStore } from "~/storage/contracts"
import { STORAGE_KEYS } from "~/storage/storage-keys"
import { VersionedStorageNamespace } from "~/storage/VersionedStorageNamespace"
import type { Clock } from "~/utils/time"
import { systemClock } from "~/utils/time"

/** Auth persistence uses its own namespace so logout never clears unrelated user data. */
export const createAuthSessionStorage = (
  store: KeyValueStore,
  clock: Clock = systemClock,
): VersionedStorageNamespace<AuthSession> =>
  new VersionedStorageNamespace({
    key: STORAGE_KEYS.authentication,
    currentVersion: CURRENT_STORAGE_SCHEMA_VERSION,
    schema: authSessionSchema,
    store,
    now: () => clock.now(),
  })
