import {
  outputRecordSchema,
  type OutputFilters,
  type OutputRecord,
  type PageRequest,
  type PageResult,
} from "~/schemas"
import type { LuffyflowDatabase } from "~/storage/indexed-db/database"
import type { OutputRecordPatch, OutputRepository } from "~/storage/repositories/contracts"

import {
  duplicateRecordError,
  recordMissingError,
  revisionConflictError,
} from "./repository-errors"
import { paginateRecords } from "./pagination"

/** Output fingerprints are enforced by a unique IndexedDB index for restart-safe idempotency. */
export class IndexedDbOutputRepository implements OutputRepository {
  constructor(
    private readonly database: Promise<LuffyflowDatabase>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createIfAbsent(record: OutputRecord): Promise<{ record: OutputRecord; created: boolean }> {
    const parsed = outputRecordSchema.parse(record)
    const transaction = (await this.database).transaction("outputs", "readwrite")
    const existing = await transaction.store.index("by-fingerprint").get(parsed.fingerprint)
    if (existing !== undefined) {
      await transaction.done
      return { record: outputRecordSchema.parse(existing), created: false }
    }
    try {
      await transaction.store.add(parsed)
      await transaction.done
      return { record: parsed, created: true }
    } catch (error) {
      if (!isConstraintError(error)) throw error
      const winner = await (
        await this.database
      ).getFromIndex("outputs", "by-fingerprint", parsed.fingerprint)
      if (winner === undefined) throw duplicateRecordError("output")
      return { record: outputRecordSchema.parse(winner), created: false }
    }
  }

  async getById(id: string): Promise<OutputRecord | null> {
    const record = await (await this.database).get("outputs", id)
    return record === undefined ? null : outputRecordSchema.parse(record)
  }

  async getByFingerprint(fingerprint: string): Promise<OutputRecord | null> {
    const record = await (
      await this.database
    ).getFromIndex("outputs", "by-fingerprint", fingerprint)
    return record === undefined ? null : outputRecordSchema.parse(record)
  }

  async isFilenameTaken(filename: string, excludingId?: string): Promise<boolean> {
    const records = await (await this.database).getAllFromIndex("outputs", "by-filename", filename)
    return records.some((record) => record.id !== excludingId)
  }

  async list(page: PageRequest, filters: OutputFilters = {}): Promise<PageResult<OutputRecord>> {
    const records = (await (await this.database).getAll("outputs")).map((record) =>
      outputRecordSchema.parse(record),
    )
    return paginateRecords(
      sortOutputs(
        records.filter((record) => matchesOutput(record, filters)),
        filters,
      ),
      page,
    )
  }

  async update(
    id: string,
    expectedRevision: number,
    patch: OutputRecordPatch,
  ): Promise<OutputRecord> {
    const transaction = (await this.database).transaction("outputs", "readwrite")
    const current = await transaction.store.get(id)
    if (current === undefined) throw recordMissingError("output", id)
    if (current.revision !== expectedRevision) {
      throw revisionConflictError("output", id, expectedRevision, current.revision)
    }
    const updatedCandidate: Record<string, unknown> = {
      ...current,
      ...patch,
      id: current.id,
      promptId: current.promptId,
      userId: current.userId,
      createdAt: current.createdAt,
      revision: current.revision + 1,
      updatedAt: this.now().toISOString(),
    }
    removeNullOutputProperties(updatedCandidate)
    const updated = outputRecordSchema.parse(updatedCandidate)
    await transaction.store.put(updated)
    await transaction.done
    return updated
  }

  async delete(id: string): Promise<void> {
    await (await this.database).delete("outputs", id)
  }

  async deleteMany(ids: string[]): Promise<void> {
    const transaction = (await this.database).transaction("outputs", "readwrite")
    await Promise.all([...new Set(ids)].map((id) => transaction.store.delete(id)))
    await transaction.done
  }
}

const matchesOutput = (record: OutputRecord, filters: OutputFilters): boolean => {
  const search = filters.search?.toLocaleLowerCase()
  const searchable =
    `${record.generatedFilename}\n${record.userDefinedName ?? ""}\n${record.textContent ?? ""}`.toLocaleLowerCase()
  return (
    (search === undefined || searchable.includes(search)) &&
    (filters.platform === undefined || filters.platform.includes(record.platform)) &&
    (filters.outputType === undefined || filters.outputType.includes(record.outputType)) &&
    (filters.sessionId === undefined || record.sessionId === filters.sessionId) &&
    (filters.createdFrom === undefined || record.createdAt >= filters.createdFrom) &&
    (filters.createdTo === undefined || record.createdAt <= filters.createdTo)
  )
}

const sortOutputs = (records: OutputRecord[], filters: OutputFilters): OutputRecord[] =>
  records.sort((left, right) => {
    if (filters.sort === "created_asc") return left.createdAt.localeCompare(right.createdAt)
    if (filters.sort === "platform") return left.platform.localeCompare(right.platform)
    if (filters.sort === "sequence") return left.sequenceNumber - right.sequenceNumber
    return right.createdAt.localeCompare(left.createdAt)
  })

const isConstraintError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "ConstraintError"

const removeNullOutputProperties = (record: Record<string, unknown>): void => {
  if (record.userDefinedName === null) delete record.userDefinedName
  if (record.downloadedAt === null) delete record.downloadedAt
  if (record.error === null) delete record.error
}
