import { LuffyflowError } from "~/errors/luffyflow-error"
import type {
  OutputFilters,
  OutputRecord,
  PageRequest,
  PageResult,
  PromptFilters,
  PromptRecord,
} from "~/schemas"
import type {
  OutputRecordPatch,
  OutputRepository,
  PromptRecordPatch,
  PromptRepository,
} from "~/storage/repositories/contracts"
import { delay } from "~/utils/time"

/** Development-only transport controls mirror the mock API latency and failure knobs. */
export interface MockRemoteRepositoryOptions {
  latencyMs: number
  failureRate: number
  random?: () => number
}

/** Shared latency/failure behavior makes any isolated backing repository act as mock remote storage. */
class MockRemoteBoundary {
  private readonly random: () => number

  constructor(private readonly options: MockRemoteRepositoryOptions) {
    this.random = options.random ?? Math.random
  }

  async cross(): Promise<void> {
    await delay(this.options.latencyMs)
    if (this.random() < this.options.failureRate) {
      throw new LuffyflowError({
        code: "MOCK_REMOTE_RECORD_FAILURE",
        category: "network",
        userMessage: "The mock record service simulated a temporary failure.",
        recoverable: true,
      })
    }
  }
}

/** Mock prompt storage remains replaceable by decorating an independent repository implementation. */
export class MockRemotePromptRepository implements PromptRepository {
  private readonly boundary: MockRemoteBoundary

  constructor(
    private readonly backing: PromptRepository,
    options: MockRemoteRepositoryOptions,
  ) {
    this.boundary = new MockRemoteBoundary(options)
  }

  async create(record: PromptRecord): Promise<PromptRecord> {
    await this.boundary.cross()
    return this.backing.create(record)
  }
  async createMany(records: PromptRecord[]): Promise<PromptRecord[]> {
    await this.boundary.cross()
    return this.backing.createMany(records)
  }
  async getById(id: string): Promise<PromptRecord | null> {
    await this.boundary.cross()
    return this.backing.getById(id)
  }
  async list(page: PageRequest, filters?: PromptFilters): Promise<PageResult<PromptRecord>> {
    await this.boundary.cross()
    return this.backing.list(page, filters)
  }
  async update(id: string, revision: number, patch: PromptRecordPatch): Promise<PromptRecord> {
    await this.boundary.cross()
    return this.backing.update(id, revision, patch)
  }
  async delete(id: string): Promise<void> {
    await this.boundary.cross()
    return this.backing.delete(id)
  }
  async deleteMany(ids: string[]): Promise<void> {
    await this.boundary.cross()
    return this.backing.deleteMany(ids)
  }
}

/** Mock output storage preserves fingerprint idempotency supplied by its isolated backing store. */
export class MockRemoteOutputRepository implements OutputRepository {
  private readonly boundary: MockRemoteBoundary

  constructor(
    private readonly backing: OutputRepository,
    options: MockRemoteRepositoryOptions,
  ) {
    this.boundary = new MockRemoteBoundary(options)
  }

  async createIfAbsent(record: OutputRecord): Promise<{ record: OutputRecord; created: boolean }> {
    await this.boundary.cross()
    return this.backing.createIfAbsent(record)
  }
  async getById(id: string): Promise<OutputRecord | null> {
    await this.boundary.cross()
    return this.backing.getById(id)
  }
  async getByFingerprint(fingerprint: string): Promise<OutputRecord | null> {
    await this.boundary.cross()
    return this.backing.getByFingerprint(fingerprint)
  }
  async isFilenameTaken(filename: string, excludingId?: string): Promise<boolean> {
    await this.boundary.cross()
    return this.backing.isFilenameTaken(filename, excludingId)
  }
  async list(page: PageRequest, filters?: OutputFilters): Promise<PageResult<OutputRecord>> {
    await this.boundary.cross()
    return this.backing.list(page, filters)
  }
  async update(id: string, revision: number, patch: OutputRecordPatch): Promise<OutputRecord> {
    await this.boundary.cross()
    return this.backing.update(id, revision, patch)
  }
  async delete(id: string): Promise<void> {
    await this.boundary.cross()
    return this.backing.delete(id)
  }
  async deleteMany(ids: string[]): Promise<void> {
    await this.boundary.cross()
    return this.backing.deleteMany(ids)
  }
}
