import type { z } from "zod"

/** The smallest storage port keeps application services independent from Plasmo and IndexedDB. */
export interface KeyValueStore {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

export interface StorageMigration {
  fromVersion: number
  toVersion: number
  migrate(value: unknown): unknown
}

export interface VersionedNamespaceOptions<T> {
  key: string
  currentVersion: number
  schema: z.ZodType<T>
  store: KeyValueStore
  migrations?: readonly StorageMigration[]
  now?: () => Date
}

export interface VersionedNamespace<T> {
  get(): Promise<T | null>
  set(value: T): Promise<T>
  remove(): Promise<void>
}
