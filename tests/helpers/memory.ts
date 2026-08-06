import type {
  OutputFilters,
  OutputRecord,
  PageRequest,
  PageResult,
  PromptFilters,
  PromptRecord,
} from "~/schemas"
import { outputRecordSchema, promptRecordSchema } from "~/schemas"
import type { KeyValueStore } from "~/storage/contracts"
import type {
  OutputRecordPatch,
  OutputRepository,
  PromptRecordPatch,
  PromptRepository,
} from "~/storage/repositories/contracts"

/** Minimal clone-on-write key/value storage isolates service tests from browser APIs. */
export class MemoryKeyValueStore implements KeyValueStore {
  readonly values = new Map<string, unknown>()

  get(key: string): Promise<unknown> {
    return Promise.resolve(this.values.get(key))
  }

  set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value))
    return Promise.resolve()
  }

  remove(key: string): Promise<void> {
    this.values.delete(key)
    return Promise.resolve()
  }
}

/** Schema-validating prompt repository provides deterministic test-only persistence. */
export class MemoryPromptRepository implements PromptRepository {
  readonly records = new Map<string, PromptRecord>()

  create(record: PromptRecord): Promise<PromptRecord> {
    const parsed = promptRecordSchema.parse(record)
    this.records.set(parsed.id, parsed)
    return Promise.resolve(parsed)
  }

  async createMany(records: PromptRecord[]): Promise<PromptRecord[]> {
    return Promise.all(records.map((record) => this.create(record)))
  }

  getById(id: string): Promise<PromptRecord | null> {
    return Promise.resolve(this.records.get(id) ?? null)
  }

  list(page: PageRequest, filters?: PromptFilters): Promise<PageResult<PromptRecord>> {
    const filtered = [...this.records.values()].filter((record) => {
      if (filters?.search !== undefined && !record.text.includes(filters.search)) return false
      if (filters?.platform !== undefined && !filters.platform.includes(record.platform))
        return false
      if (filters?.status !== undefined && !filters.status.includes(record.status)) return false
      return filters?.sessionId === undefined || filters.sessionId === record.sessionId
    })
    return Promise.resolve(pageResult(filtered, page))
  }

  update(id: string, expectedRevision: number, patch: PromptRecordPatch): Promise<PromptRecord> {
    const current = this.records.get(id)
    if (current?.revision !== expectedRevision) throw new Error("revision conflict")
    const candidate: Record<string, unknown> = {
      ...current,
      ...patch,
      revision: current.revision + 1,
    }
    if (candidate.submittedAt === null) delete candidate.submittedAt
    if (candidate.completedAt === null) delete candidate.completedAt
    if (candidate.errorCode === null) delete candidate.errorCode
    if (candidate.errorMessage === null) delete candidate.errorMessage
    const updated = promptRecordSchema.parse(candidate)
    this.records.set(id, updated)
    return Promise.resolve(updated)
  }

  delete(id: string): Promise<void> {
    this.records.delete(id)
    return Promise.resolve()
  }

  deleteMany(ids: string[]): Promise<void> {
    for (const id of ids) this.records.delete(id)
    return Promise.resolve()
  }
}

/** Schema-validating output repository models deduplication and optimistic revisions in memory. */
export class MemoryOutputRepository implements OutputRepository {
  readonly records = new Map<string, OutputRecord>()

  async createIfAbsent(record: OutputRecord): Promise<{ record: OutputRecord; created: boolean }> {
    const existing = await this.getByFingerprint(record.fingerprint)
    if (existing !== null) return { record: existing, created: false }
    const parsed = outputRecordSchema.parse(record)
    this.records.set(parsed.id, parsed)
    return { record: parsed, created: true }
  }

  getById(id: string): Promise<OutputRecord | null> {
    return Promise.resolve(this.records.get(id) ?? null)
  }

  getByFingerprint(fingerprint: string): Promise<OutputRecord | null> {
    return Promise.resolve(
      [...this.records.values()].find((record) => record.fingerprint === fingerprint) ?? null,
    )
  }

  isFilenameTaken(filename: string, excludingId?: string): Promise<boolean> {
    return Promise.resolve(
      [...this.records.values()].some(
        (record) =>
          record.id !== excludingId &&
          (record.userDefinedName ?? record.generatedFilename) === filename,
      ),
    )
  }

  list(page: PageRequest, filters?: OutputFilters): Promise<PageResult<OutputRecord>> {
    const filtered = [...this.records.values()].filter((record) => {
      if (filters?.platform !== undefined && !filters.platform.includes(record.platform))
        return false
      if (filters?.outputType !== undefined && !filters.outputType.includes(record.outputType))
        return false
      return filters?.sessionId === undefined || filters.sessionId === record.sessionId
    })
    return Promise.resolve(pageResult(filtered, page))
  }

  update(id: string, expectedRevision: number, patch: OutputRecordPatch): Promise<OutputRecord> {
    const current = this.records.get(id)
    if (current?.revision !== expectedRevision) throw new Error("revision conflict")
    const candidate: Record<string, unknown> = {
      ...current,
      ...patch,
      revision: current.revision + 1,
    }
    if (candidate.userDefinedName === null) delete candidate.userDefinedName
    if (candidate.downloadedAt === null) delete candidate.downloadedAt
    if (candidate.error === null) delete candidate.error
    const updated = outputRecordSchema.parse(candidate)
    this.records.set(id, updated)
    return Promise.resolve(updated)
  }

  delete(id: string): Promise<void> {
    this.records.delete(id)
    return Promise.resolve()
  }

  deleteMany(ids: string[]): Promise<void> {
    for (const id of ids) this.records.delete(id)
    return Promise.resolve()
  }
}

/** Applies the small first-page pagination behavior needed by unit-test repositories. */
const pageResult = <T>(items: T[], page: PageRequest): PageResult<T> => ({
  items: items.slice(0, page.limit),
  total: items.length,
  ...(items.length > page.limit ? { nextCursor: String(page.limit) } : {}),
})
