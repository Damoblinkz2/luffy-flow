import type {
  AutoflowSettings,
  EntityId,
  OutputFilters,
  OutputRecord,
  PageRequest,
  PageResult,
  PromptFilters,
  PromptRecord,
  QueueLease,
  QueueState,
} from "~/schemas"

/** Repository patches cannot rewrite ownership, identity, creation time, or revision fields. */
type PromptMutableFields = Omit<
  PromptRecord,
  | "id"
  | "userId"
  | "createdAt"
  | "revision"
  | "submittedAt"
  | "completedAt"
  | "errorCode"
  | "errorMessage"
>
export type PromptRecordPatch = Partial<PromptMutableFields> & {
  submittedAt?: PromptRecord["submittedAt"] | null
  completedAt?: PromptRecord["completedAt"] | null
  errorCode?: PromptRecord["errorCode"] | null
  errorMessage?: PromptRecord["errorMessage"] | null
}

type OutputMutableFields = Omit<
  OutputRecord,
  | "id"
  | "userId"
  | "promptId"
  | "createdAt"
  | "revision"
  | "userDefinedName"
  | "downloadedAt"
  | "error"
>
export type OutputRecordPatch = Partial<OutputMutableFields> & {
  userDefinedName?: OutputRecord["userDefinedName"] | null
  downloadedAt?: OutputRecord["downloadedAt"] | null
  error?: OutputRecord["error"] | null
}

/** Prompt persistence supports optimistic revisions and bulk history operations. */
export interface PromptRepository {
  create(record: PromptRecord): Promise<PromptRecord>
  createMany(records: PromptRecord[]): Promise<PromptRecord[]>
  getById(id: EntityId): Promise<PromptRecord | null>
  list(page: PageRequest, filters?: PromptFilters): Promise<PageResult<PromptRecord>>
  update(id: EntityId, expectedRevision: number, patch: PromptRecordPatch): Promise<PromptRecord>
  delete(id: EntityId): Promise<void>
  deleteMany(ids: EntityId[]): Promise<void>
}

/** Output creation is idempotent on the fingerprint enforced by each implementation. */
export interface OutputRepository {
  createIfAbsent(record: OutputRecord): Promise<{ record: OutputRecord; created: boolean }>
  getById(id: EntityId): Promise<OutputRecord | null>
  getByFingerprint(fingerprint: string): Promise<OutputRecord | null>
  isFilenameTaken(filename: string, excludingId?: EntityId): Promise<boolean>
  list(page: PageRequest, filters?: OutputFilters): Promise<PageResult<OutputRecord>>
  update(id: EntityId, expectedRevision: number, patch: OutputRecordPatch): Promise<OutputRecord>
  delete(id: EntityId): Promise<void>
  deleteMany(ids: EntityId[]): Promise<void>
}

/** Queue repository lease methods are the durable single-run authority. */
export interface QueueRepository {
  getActive(): Promise<QueueState | null>
  save(queue: QueueState, expectedRevision?: number): Promise<QueueState>
  acquireLease(queueId: EntityId, candidate: QueueLease): Promise<QueueState>
  releaseLease(queueId: EntityId, ownerId: string): Promise<void>
}

/** Sequence allocation is serialized by the background-owned repository instance. */
export interface SequenceRepository {
  allocate(scopeKey: string): Promise<number>
  peek(scopeKey: string): Promise<number>
}

export interface SettingsRepository {
  get(): Promise<AutoflowSettings>
  save(settings: AutoflowSettings): Promise<AutoflowSettings>
}
