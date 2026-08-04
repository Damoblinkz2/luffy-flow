import { AutoflowError, toAutoflowError } from "~/errors/autoflow-error"
import { storedEnvelopeSchema } from "~/schemas/storage"

import type { StorageMigration, VersionedNamespace, VersionedNamespaceOptions } from "./contracts"

/** A versioned namespace validates every read and applies only contiguous forward migrations. */
export class VersionedStorageNamespace<T> implements VersionedNamespace<T> {
  private readonly migrations: ReadonlyMap<number, StorageMigration>
  private readonly now: () => Date

  constructor(private readonly options: VersionedNamespaceOptions<T>) {
    this.now = options.now ?? (() => new Date())
    this.migrations = this.indexMigrations(options.migrations ?? [])
  }

  async get(): Promise<T | null> {
    try {
      const stored = await this.options.store.get(this.options.key)
      if (stored === undefined || stored === null) return null

      const envelope = storedEnvelopeSchema.parse(stored)
      if (envelope.schemaVersion > this.options.currentVersion) {
        throw new AutoflowError({
          code: "STORAGE_VERSION_NEWER",
          category: "storage_failure",
          userMessage: "This AutoFlow data was created by a newer extension version.",
          diagnosticMessage: `Stored version ${envelope.schemaVersion}; supported version ${this.options.currentVersion}.`,
          details: { key: this.options.key },
        })
      }

      const migratedValue = await this.migrate(envelope.value, envelope.schemaVersion)
      const parsedValue = this.options.schema.parse(migratedValue)
      if (envelope.schemaVersion < this.options.currentVersion) await this.set(parsedValue)
      return parsedValue
    } catch (error) {
      throw toAutoflowError(error, {
        code: "STORAGE_READ_FAILED",
        category: "storage_failure",
        userMessage: "AutoFlow could not read its saved data.",
        details: { key: this.options.key },
      })
    }
  }

  async set(value: T): Promise<T> {
    try {
      const parsedValue = this.options.schema.parse(value)
      await this.options.store.set(this.options.key, {
        schemaVersion: this.options.currentVersion,
        value: parsedValue,
        updatedAt: this.now().toISOString(),
      })
      return parsedValue
    } catch (error) {
      throw toAutoflowError(error, {
        code: "STORAGE_WRITE_FAILED",
        category: "storage_failure",
        userMessage: "AutoFlow could not save local data.",
        details: { key: this.options.key },
      })
    }
  }

  async remove(): Promise<void> {
    try {
      await this.options.store.remove(this.options.key)
    } catch (error) {
      throw toAutoflowError(error, {
        code: "STORAGE_REMOVE_FAILED",
        category: "storage_failure",
        userMessage: "AutoFlow could not remove local data.",
        details: { key: this.options.key },
      })
    }
  }

  private async migrate(value: unknown, startingVersion: number): Promise<unknown> {
    let currentValue = value
    let currentVersion = startingVersion
    while (currentVersion < this.options.currentVersion) {
      const migration = this.migrations.get(currentVersion)
      if (migration === undefined || migration.toVersion !== currentVersion + 1) {
        throw new AutoflowError({
          code: "STORAGE_MIGRATION_MISSING",
          category: "storage_failure",
          userMessage: "AutoFlow could not upgrade its saved data.",
          diagnosticMessage: `No contiguous migration from version ${currentVersion}.`,
          details: { key: this.options.key },
        })
      }
      currentValue = await migration.migrate(currentValue)
      currentVersion = migration.toVersion
    }
    return currentValue
  }

  private indexMigrations(
    migrations: readonly StorageMigration[],
  ): ReadonlyMap<number, StorageMigration> {
    const indexed = new Map<number, StorageMigration>()
    for (const migration of migrations) {
      if (migration.toVersion !== migration.fromVersion + 1 || indexed.has(migration.fromVersion)) {
        throw new AutoflowError({
          code: "STORAGE_MIGRATION_INVALID",
          category: "invalid_data",
          userMessage: "The AutoFlow storage migration configuration is invalid.",
        })
      }
      indexed.set(migration.fromVersion, migration)
    }
    return indexed
  }
}
