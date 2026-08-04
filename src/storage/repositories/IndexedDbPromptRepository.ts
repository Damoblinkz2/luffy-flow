import type { AutoflowDatabase } from "~/storage/indexed-db/database"
import {
  promptRecordSchema,
  type PageRequest,
  type PageResult,
  type PromptFilters,
  type PromptRecord,
} from "~/schemas"
import type { PromptRecordPatch, PromptRepository } from "~/storage/repositories/contracts"

import {
  duplicateRecordError,
  recordMissingError,
  revisionConflictError,
} from "./repository-errors"
import { paginateRecords } from "./pagination"

/** IndexedDB prompt persistence validates reads and uses optimistic revision updates. */
export class IndexedDbPromptRepository implements PromptRepository {
  constructor(
    private readonly database: Promise<AutoflowDatabase>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(record: PromptRecord): Promise<PromptRecord> {
    const parsed = promptRecordSchema.parse(record)
    try {
      await (await this.database).add("prompts", parsed)
      return parsed
    } catch (error) {
      if (isConstraintError(error)) throw duplicateRecordError("prompt")
      throw error
    }
  }

  async createMany(records: PromptRecord[]): Promise<PromptRecord[]> {
    const parsed = records.map((record) => promptRecordSchema.parse(record))
    if (new Set(parsed.map((record) => record.id)).size !== parsed.length) {
      throw duplicateRecordError("prompt")
    }

    const transaction = (await this.database).transaction("prompts", "readwrite")
    try {
      await Promise.all([
        ...parsed.map((record) => transaction.store.add(record)),
        transaction.done,
      ])
      return parsed
    } catch (error) {
      if (isConstraintError(error)) throw duplicateRecordError("prompt")
      throw error
    }
  }

  async getById(id: string): Promise<PromptRecord | null> {
    const record = await (await this.database).get("prompts", id)
    return record === undefined ? null : promptRecordSchema.parse(record)
  }

  async list(page: PageRequest, filters: PromptFilters = {}): Promise<PageResult<PromptRecord>> {
    const records = (await (await this.database).getAll("prompts")).map((record) =>
      promptRecordSchema.parse(record),
    )
    return paginateRecords(
      sortPrompts(
        records.filter((record) => matchesPrompt(record, filters)),
        filters,
      ),
      page,
    )
  }

  async update(
    id: string,
    expectedRevision: number,
    patch: PromptRecordPatch,
  ): Promise<PromptRecord> {
    const transaction = (await this.database).transaction("prompts", "readwrite")
    const current = await transaction.store.get(id)
    if (current === undefined) throw recordMissingError("prompt", id)
    if (current.revision !== expectedRevision) {
      throw revisionConflictError("prompt", id, expectedRevision, current.revision)
    }
    const updatedCandidate: Record<string, unknown> = {
      ...current,
      ...patch,
      id: current.id,
      userId: current.userId,
      createdAt: current.createdAt,
      revision: current.revision + 1,
      updatedAt: this.now().toISOString(),
    }
    removeNullPromptProperties(updatedCandidate)
    const updated = promptRecordSchema.parse(updatedCandidate)
    await transaction.store.put(updated)
    await transaction.done
    return updated
  }

  async delete(id: string): Promise<void> {
    await (await this.database).delete("prompts", id)
  }

  async deleteMany(ids: string[]): Promise<void> {
    const transaction = (await this.database).transaction("prompts", "readwrite")
    await Promise.all([...new Set(ids)].map((id) => transaction.store.delete(id)))
    await transaction.done
  }
}

const matchesPrompt = (record: PromptRecord, filters: PromptFilters): boolean => {
  const search = filters.search?.toLocaleLowerCase()
  return (
    (search === undefined || record.text.toLocaleLowerCase().includes(search)) &&
    (filters.platform === undefined || filters.platform.includes(record.platform)) &&
    (filters.status === undefined || filters.status.includes(record.status)) &&
    (filters.sessionId === undefined || record.sessionId === filters.sessionId) &&
    (filters.createdFrom === undefined || record.createdAt >= filters.createdFrom) &&
    (filters.createdTo === undefined || record.createdAt <= filters.createdTo)
  )
}

const sortPrompts = (records: PromptRecord[], filters: PromptFilters): PromptRecord[] =>
  records.sort((left, right) => {
    if (filters.sort === "created_asc") return left.createdAt.localeCompare(right.createdAt)
    if (filters.sort === "platform") return left.platform.localeCompare(right.platform)
    return right.createdAt.localeCompare(left.createdAt)
  })

const isConstraintError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "ConstraintError"

const removeNullPromptProperties = (record: Record<string, unknown>): void => {
  if (record.submittedAt === null) delete record.submittedAt
  if (record.completedAt === null) delete record.completedAt
  if (record.errorCode === null) delete record.errorCode
  if (record.errorMessage === null) delete record.errorMessage
}
