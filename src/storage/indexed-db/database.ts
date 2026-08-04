import { openDB, type DBSchema, type IDBPDatabase } from "idb"

import type { OutputRecord, PromptRecord } from "~/schemas"

const DATABASE_NAME = "autoflow-records"
const DATABASE_VERSION = 1

/** IndexedDB holds potentially large prompt/output text outside extension sync storage. */
export interface AutoflowDatabaseSchema extends DBSchema {
  prompts: {
    key: string
    value: PromptRecord
    indexes: {
      "by-created-at": string
      "by-session": string
    }
  }
  outputs: {
    key: string
    value: OutputRecord
    indexes: {
      "by-created-at": string
      "by-fingerprint": string
      "by-filename": string
      "by-session": string
    }
  }
}

export type AutoflowDatabase = IDBPDatabase<AutoflowDatabaseSchema>

/** Database creation is versioned and closes stale connections before a future migration. */
export const openAutoflowDatabase = (name = DATABASE_NAME): Promise<AutoflowDatabase> =>
  openDB<AutoflowDatabaseSchema>(name, DATABASE_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const prompts = database.createObjectStore("prompts", { keyPath: "id" })
        prompts.createIndex("by-created-at", "createdAt")
        prompts.createIndex("by-session", "sessionId")

        const outputs = database.createObjectStore("outputs", { keyPath: "id" })
        outputs.createIndex("by-created-at", "createdAt")
        outputs.createIndex("by-fingerprint", "fingerprint", { unique: true })
        outputs.createIndex("by-filename", "generatedFilename")
        outputs.createIndex("by-session", "sessionId")
      }
    },
    blocking(_currentVersion, _blockedVersion, _event) {
      // Closing lets another extension context complete a schema upgrade safely.
    },
  }).then((database) => {
    database.addEventListener("versionchange", () => database.close())
    return database
  })
