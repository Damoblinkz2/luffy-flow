import { CURRENT_STORAGE_SCHEMA_VERSION } from "~/constants"
import { queueStateSchema, type QueueState, type SequenceCounter } from "~/schemas"
import type { KeyValueStore } from "~/storage/contracts"
import { openAutoflowDatabase } from "~/storage/indexed-db/database"
import { IndexedDbOutputRepository } from "~/storage/repositories/IndexedDbOutputRepository"
import { IndexedDbPromptRepository } from "~/storage/repositories/IndexedDbPromptRepository"
import { LocalQueueRepository } from "~/storage/repositories/LocalQueueRepository"
import {
  LocalSequenceRepository,
  sequenceCounterCollectionSchema,
} from "~/storage/repositories/LocalSequenceRepository"
import { STORAGE_KEYS } from "~/storage/storage-keys"
import { VersionedStorageNamespace } from "~/storage/VersionedStorageNamespace"
import type { Clock } from "~/utils/time"
import { systemClock } from "~/utils/time"

/** Repository construction keeps large records in IndexedDB and coordination in extension storage. */
export const createLocalRepositories = (
  keyValueStore: KeyValueStore,
  clock: Clock = systemClock,
  databaseName?: string,
) => {
  const database = openAutoflowDatabase(databaseName)
  const queueNamespace = new VersionedStorageNamespace<QueueState>({
    key: STORAGE_KEYS.queueState,
    currentVersion: CURRENT_STORAGE_SCHEMA_VERSION,
    schema: queueStateSchema,
    store: keyValueStore,
    now: () => clock.now(),
  })
  const sequenceNamespace = new VersionedStorageNamespace<SequenceCounter[]>({
    key: STORAGE_KEYS.sequenceCounters,
    currentVersion: CURRENT_STORAGE_SCHEMA_VERSION,
    schema: sequenceCounterCollectionSchema,
    store: keyValueStore,
    now: () => clock.now(),
  })

  return {
    database,
    prompts: new IndexedDbPromptRepository(database, () => clock.now()),
    outputs: new IndexedDbOutputRepository(database, () => clock.now()),
    queue: new LocalQueueRepository(queueNamespace, clock),
    sequences: new LocalSequenceRepository(sequenceNamespace, clock),
    close: () => void database.then((connection) => connection.close()),
  }
}
