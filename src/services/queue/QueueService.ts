import { LuffyflowError } from "~/errors/luffyflow-error"
import {
  promptTextSchema,
  queueLeaseSchema,
  queueStateSchema,
  type PromptRecord,
  type PromptStatus,
  type QueueState,
  type SupportedPlatform,
} from "~/schemas"
import type { PromptRepository, QueueRepository } from "~/storage/repositories/contracts"
import type { Clock } from "~/utils/time"
import { systemClock } from "~/utils/time"
import { createId } from "~/utils/ids"

import { QueueStateMachine } from "./QueueStateMachine"

const TERMINAL_QUEUE_STATUSES = new Set(["stopped", "completed", "failed"])
const MAXIMUM_GENERATION_LEASE_MS = 31 * 60_000

/** Queue creation receives authenticated ownership and an adapter version fixed for every prompt. */
export interface CreateQueueInput {
  userId: string
  platform: SupportedPlatform
  promptTexts: string[]
  delayMs: number
  adapterVersion: string
  sessionId?: string
}

/** Queue operations persist each transition so MV3 worker suspension loses no essential state. */
export class QueueService {
  private readonly stateMachine = new QueueStateMachine()

  constructor(
    private readonly queues: QueueRepository,
    private readonly prompts: PromptRepository,
    private readonly clock: Clock = systemClock,
  ) {}

  async create(input: CreateQueueInput): Promise<QueueState> {
    const current = await this.queues.getActive()
    if (current !== null && !TERMINAL_QUEUE_STATUSES.has(current.status)) {
      throw new LuffyflowError({
        code: "QUEUE_ACTIVE_EXISTS",
        category: "invalid_data",
        userMessage: "Finish or stop the current queue before creating another one.",
      })
    }
    const now = this.clock.now().toISOString()
    const sessionId = input.sessionId ?? createId()
    const promptRecords = input.promptTexts.map((text, index) =>
      createPromptRecord(input, promptTextSchema.parse(text), sessionId, index, now),
    )
    if (promptRecords.length === 0) {
      throw new LuffyflowError({
        code: "QUEUE_EMPTY",
        category: "invalid_data",
        userMessage: "Add at least one prompt before creating a queue.",
      })
    }

    await this.prompts.createMany(promptRecords)
    const queue = queueStateSchema.parse({
      id: createId(),
      userId: input.userId,
      sessionId,
      platform: input.platform,
      status: "idle",
      promptIds: promptRecords.map((prompt) => prompt.id),
      delayMs: input.delayMs,
      createdAt: now,
      updatedAt: now,
      revision: 0,
    })
    try {
      return await this.queues.save(queue)
    } catch (error) {
      await this.prompts.deleteMany(promptRecords.map((prompt) => prompt.id))
      throw error
    }
  }

  async start(
    queueId: string,
    expectedRevision: number,
    tabId: number,
    ownerId: string,
  ): Promise<QueueState> {
    const queue = await this.requireQueue(queueId, expectedRevision)
    const leased = await this.queues.acquireLease(
      queueId,
      createLease(queue, ownerId, this.clock.now()),
    )
    return this.queues.save(
      queueStateSchema.parse({
        ...this.stateMachine.transition(leased, "running"),
        targetTabId: tabId,
      }),
      leased.revision,
    )
  }

  async addPrompts(
    queueId: string,
    expectedRevision: number,
    promptTexts: string[],
    adapterVersion: string,
  ): Promise<QueueState> {
    const queue = await this.requireEditableQueue(queueId, expectedRevision)
    if (promptTexts.length === 0) {
      throw new LuffyflowError({
        code: "QUEUE_ADD_EMPTY",
        category: "invalid_data",
        userMessage: "Add at least one prompt.",
      })
    }
    const now = this.clock.now().toISOString()
    const records = promptTexts.map((text, index) =>
      createPromptRecord(
        {
          userId: queue.userId,
          platform: queue.platform,
          promptTexts,
          delayMs: queue.delayMs,
          adapterVersion,
          sessionId: queue.sessionId,
        },
        promptTextSchema.parse(text),
        queue.sessionId,
        queue.promptIds.length + index,
        now,
      ),
    )
    await this.prompts.createMany(records)
    try {
      return await this.queues.save(
        queueStateSchema.parse({
          ...queue,
          promptIds: [...queue.promptIds, ...records.map((record) => record.id)],
        }),
        queue.revision,
      )
    } catch (error) {
      await this.prompts.deleteMany(records.map((record) => record.id))
      throw error
    }
  }

  async editPrompt(promptId: string, text: string): Promise<PromptRecord> {
    const prompt = await this.requirePrompt(promptId)
    if (prompt.status !== "draft" && prompt.status !== "queued") throw promptLockedError()
    return this.prompts.update(prompt.id, prompt.revision, { text: promptTextSchema.parse(text) })
  }

  async removePrompt(
    queueId: string,
    expectedRevision: number,
    promptId: string,
  ): Promise<QueueState> {
    const queue = await this.requireEditableQueue(queueId, expectedRevision)
    const prompt = await this.requirePrompt(promptId)
    if (prompt.status !== "draft" && prompt.status !== "queued") throw promptLockedError()
    const promptIds = queue.promptIds.filter((id) => id !== promptId)
    if (promptIds.length === queue.promptIds.length) throw promptLockedError()
    const saved = await this.queues.save(
      queueStateSchema.parse({ ...queue, promptIds }),
      queue.revision,
    )
    await this.prompts.delete(promptId)
    await this.rewriteQueuePositions(promptIds)
    return saved
  }

  async reorderPrompts(
    queueId: string,
    expectedRevision: number,
    orderedPromptIds: string[],
  ): Promise<QueueState> {
    const queue = await this.requireEditableQueue(queueId, expectedRevision)
    if (
      orderedPromptIds.length !== queue.promptIds.length ||
      new Set(orderedPromptIds).size !== orderedPromptIds.length ||
      orderedPromptIds.some((id) => !queue.promptIds.includes(id))
    ) {
      throw new LuffyflowError({
        code: "QUEUE_REORDER_INVALID",
        category: "invalid_data",
        userMessage: "The reordered prompt list does not match this queue.",
      })
    }
    const saved = await this.queues.save(
      queueStateSchema.parse({ ...queue, promptIds: orderedPromptIds }),
      queue.revision,
    )
    await this.rewriteQueuePositions(orderedPromptIds)
    return saved
  }

  async pause(
    queueId: string,
    expectedRevision: number,
    ownerId: string,
    reason?: string,
  ): Promise<QueueState> {
    const queue = await this.requireQueue(queueId, expectedRevision)
    const safeQueue = await this.interruptCurrentPrompt(queue, "QUEUE_PAUSED")
    const paused = await this.queues.save(
      this.stateMachine.transition(safeQueue, "paused", reason),
      safeQueue.revision,
    )
    await this.queues.releaseLease(queueId, ownerId)
    return (await this.queues.getActive()) ?? paused
  }

  async resume(
    queueId: string,
    expectedRevision: number,
    tabId: number,
    ownerId: string,
  ): Promise<QueueState> {
    const queue = await this.requireQueue(queueId, expectedRevision)
    const leased = await this.queues.acquireLease(
      queueId,
      createLease(queue, ownerId, this.clock.now()),
    )
    return this.queues.save(
      queueStateSchema.parse({
        ...this.stateMachine.transition(leased, "running"),
        targetTabId: tabId,
      }),
      leased.revision,
    )
  }

  async stop(queueId: string, expectedRevision: number, ownerId: string): Promise<QueueState> {
    const queue = await this.requireQueue(queueId, expectedRevision)
    if (
      queue.lease !== undefined &&
      queue.lease.ownerId !== ownerId &&
      Date.parse(queue.lease.expiresAt) > this.clock.now().getTime()
    ) {
      throw new LuffyflowError({
        code: "QUEUE_LEASE_OWNER_MISMATCH",
        category: "authorization",
        userMessage: "A stale worker cannot stop this queue.",
      })
    }
    const stopping = await this.queues.save(
      this.stateMachine.transition(queue, queue.status === "idle" ? "stopped" : "stopping"),
      queue.revision,
    )
    await this.cancelUnfinishedPrompts(stopping)
    const latest = (await this.queues.getActive()) ?? stopping
    const stopped =
      latest.status === "stopped"
        ? latest
        : await this.queues.save(this.stateMachine.transition(latest, "stopped"), latest.revision)
    return (await this.queues.getActive()) ?? stopped
  }

  /** Worker recovery pauses unsafe in-flight work instead of risking duplicate submission. */
  async recoverAfterWorkerRestart(): Promise<QueueState | null> {
    const queue = await this.queues.getActive()
    if (queue === null || (queue.status !== "running" && queue.status !== "stopping")) return queue
    if (queue.status === "stopping") {
      await this.cancelUnfinishedPrompts(queue)
      return this.queues.save(this.stateMachine.transition(queue, "stopped"), queue.revision)
    }
    if (queue.currentPromptId !== undefined) {
      const prompt = await this.prompts.getById(queue.currentPromptId)
      if (
        prompt !== null &&
        (prompt.status === "sending" || prompt.status === "waiting_for_output")
      ) {
        await this.prompts.update(prompt.id, prompt.revision, {
          status: "failed",
          errorCode: "WORKER_RESTARTED",
          errorMessage: "The extension worker restarted while this prompt was in progress.",
        })
      }
    }
    const recoveredCandidate: Record<string, unknown> = {
      ...this.stateMachine.transition(
        queue,
        "paused_recovery",
        "Review the interrupted prompt before resuming.",
      ),
      ...(queue.lease === undefined
        ? {}
        : { lease: { ...queue.lease, expiresAt: this.clock.now().toISOString() } }),
    }
    delete recoveredCandidate.currentPromptId
    delete recoveredCandidate.activeCommandId
    return this.queues.save(queueStateSchema.parse(recoveredCandidate), queue.revision)
  }

  async claimNext(
    queueId: string,
    ownerId: string,
    generation: number,
  ): Promise<PromptRecord | null> {
    const queue = await this.requireRunningLease(queueId, ownerId, generation)
    if (queue.currentPromptId !== undefined) {
      return this.prompts.getById(queue.currentPromptId)
    }
    const prompt = await this.findFirstPrompt(queue, ["queued"])
    if (prompt === null) {
      const failed = await this.findFirstPrompt(queue, ["failed"])
      const settled = await this.queues.save(
        failed === null
          ? this.stateMachine.transition(queue, "completed")
          : this.stateMachine.transition(
              queue,
              "paused",
              "Review failed prompts before continuing.",
            ),
        queue.revision,
      )
      if (settled.status === "paused" && settled.lease !== undefined) {
        await this.queues.releaseLease(settled.id, settled.lease.ownerId)
      }
      return null
    }
    const claimed = await this.queues.save(
      queueStateSchema.parse({ ...queue, currentPromptId: prompt.id }),
      queue.revision,
    )
    try {
      return await this.prompts.update(prompt.id, prompt.revision, {
        status: "sending",
        submittedAt: this.clock.now().toISOString(),
        errorCode: null,
        errorMessage: null,
      })
    } catch (error) {
      const rollback: Record<string, unknown> = { ...claimed }
      delete rollback.currentPromptId
      await this.queues.save(queueStateSchema.parse(rollback), claimed.revision)
      throw error
    }
  }

  async markWaiting(promptId: string): Promise<PromptRecord> {
    const prompt = await this.requirePrompt(promptId)
    return this.prompts.update(prompt.id, prompt.revision, { status: "waiting_for_output" })
  }

  async completePrompt(promptId: string, outputId: string): Promise<QueueState> {
    const prompt = await this.requirePrompt(promptId)
    await this.prompts.update(prompt.id, prompt.revision, {
      status: "completed",
      completedAt: this.clock.now().toISOString(),
      outputIds: [...new Set([...prompt.outputIds, outputId])],
      errorCode: null,
      errorMessage: null,
    })
    return this.finishCurrentPrompt(prompt.sessionId)
  }

  async failPrompt(
    promptId: string,
    code: string,
    message: string,
    shouldPause: boolean,
  ): Promise<QueueState> {
    const prompt = await this.requirePrompt(promptId)
    await this.prompts.update(prompt.id, prompt.revision, {
      status: "failed",
      errorCode: code,
      errorMessage: message,
    })
    const queue = await this.requireQueueForSession(prompt.sessionId)
    const candidate: Record<string, unknown> = { ...queue }
    delete candidate.currentPromptId
    delete candidate.activeCommandId
    const cleared = queueStateSchema.parse(candidate)
    const saved = await this.queues.save(
      shouldPause ? this.stateMachine.transition(cleared, "paused", message) : cleared,
      queue.revision,
    )
    if (saved.status === "paused" && saved.lease !== undefined) {
      await this.queues.releaseLease(saved.id, saved.lease.ownerId)
      return (await this.queues.getActive()) ?? saved
    }
    return saved
  }

  async retryPrompt(promptId: string, maximumRetryCount: number): Promise<PromptRecord> {
    const prompt = await this.requirePrompt(promptId)
    if (prompt.status !== "failed" || prompt.retryCount >= maximumRetryCount) {
      throw new LuffyflowError({
        code: "PROMPT_RETRY_NOT_ALLOWED",
        category: "invalid_data",
        userMessage: "This prompt cannot be retried again.",
      })
    }
    return this.prompts.update(prompt.id, prompt.revision, {
      status: "queued",
      retryCount: prompt.retryCount + 1,
      submittedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
    })
  }

  async skipPrompt(promptId: string): Promise<PromptRecord> {
    const prompt = await this.requirePrompt(promptId)
    if (prompt.status !== "queued" && prompt.status !== "failed") {
      throw new LuffyflowError({
        code: "PROMPT_SKIP_NOT_ALLOWED",
        category: "invalid_data",
        userMessage: "This prompt can no longer be skipped.",
      })
    }
    return this.prompts.update(prompt.id, prompt.revision, { status: "skipped" })
  }

  private async finishCurrentPrompt(sessionId: string): Promise<QueueState> {
    const queue = await this.requireQueueForSession(sessionId)
    const candidate: Record<string, unknown> = { ...queue }
    delete candidate.currentPromptId
    delete candidate.activeCommandId
    const cleared = queueStateSchema.parse(candidate)
    const next = await this.findFirstPrompt(cleared, ["queued"])
    const failed = next === null ? await this.findFirstPrompt(cleared, ["failed"]) : null
    const saved = await this.queues.save(
      next !== null
        ? cleared
        : failed === null
          ? this.stateMachine.transition(cleared, "completed")
          : this.stateMachine.transition(
              cleared,
              "paused",
              "Review failed prompts before continuing.",
            ),
      queue.revision,
    )
    if (saved.status === "paused" && saved.lease !== undefined) {
      await this.queues.releaseLease(saved.id, saved.lease.ownerId)
      return (await this.queues.getActive()) ?? saved
    }
    return saved
  }

  private async cancelUnfinishedPrompts(queue: QueueState): Promise<void> {
    for (const promptId of queue.promptIds) {
      const prompt = await this.prompts.getById(promptId)
      if (prompt !== null && isUnfinished(prompt.status)) {
        await this.prompts.update(prompt.id, prompt.revision, { status: "cancelled" })
      }
    }
  }

  private async interruptCurrentPrompt(queue: QueueState, code: string): Promise<QueueState> {
    if (queue.currentPromptId === undefined) return queue
    const prompt = await this.prompts.getById(queue.currentPromptId)
    if (
      prompt !== null &&
      (prompt.status === "sending" || prompt.status === "waiting_for_output")
    ) {
      await this.prompts.update(prompt.id, prompt.revision, {
        status: "failed",
        errorCode: code,
        errorMessage: "This prompt was interrupted and requires an explicit retry.",
      })
    }
    const candidate: Record<string, unknown> = { ...queue }
    delete candidate.currentPromptId
    delete candidate.activeCommandId
    return queueStateSchema.parse(candidate)
  }

  private async findFirstPrompt(
    queue: QueueState,
    statuses: PromptStatus[],
  ): Promise<PromptRecord | null> {
    for (const promptId of queue.promptIds) {
      const prompt = await this.prompts.getById(promptId)
      if (prompt !== null && statuses.includes(prompt.status)) return prompt
    }
    return null
  }

  private async requireRunningLease(
    queueId: string,
    ownerId: string,
    generation: number,
  ): Promise<QueueState> {
    const queue = await this.requireQueue(queueId)
    const lease = queue.lease
    if (
      queue.status !== "running" ||
      lease === undefined ||
      lease.ownerId !== ownerId ||
      lease.generation !== generation ||
      Date.parse(lease.expiresAt) <= this.clock.now().getTime()
    ) {
      throw new LuffyflowError({
        code: "QUEUE_LEASE_INVALID",
        category: "authorization",
        userMessage: "LuffyFlow rejected a stale queue command.",
      })
    }
    return queue
  }

  private async requireQueue(queueId: string, expectedRevision?: number): Promise<QueueState> {
    const queue = await this.queues.getActive()
    if (queue === null || queue.id !== queueId) {
      throw new LuffyflowError({
        code: "QUEUE_NOT_FOUND",
        category: "invalid_data",
        userMessage: "The requested queue no longer exists.",
      })
    }
    if (expectedRevision !== undefined && queue.revision !== expectedRevision) {
      throw new LuffyflowError({
        code: "QUEUE_REVISION_CONFLICT",
        category: "storage_failure",
        userMessage: "The queue changed in another LuffyFlow context. Refresh and try again.",
        recoverable: true,
      })
    }
    return queue
  }

  private async requireQueueForSession(sessionId: string): Promise<QueueState> {
    const queue = await this.queues.getActive()
    if (queue === null || queue.sessionId !== sessionId) {
      throw new LuffyflowError({
        code: "QUEUE_SESSION_MISSING",
        category: "storage_failure",
        userMessage: "LuffyFlow could not find the prompt's queue session.",
      })
    }
    return queue
  }

  private async requireEditableQueue(
    queueId: string,
    expectedRevision: number,
  ): Promise<QueueState> {
    const queue = await this.requireQueue(queueId, expectedRevision)
    if (
      queue.status !== "idle" &&
      queue.status !== "paused" &&
      queue.status !== "paused_recovery"
    ) {
      throw new LuffyflowError({
        code: "QUEUE_EDIT_LOCKED",
        category: "invalid_data",
        userMessage: "Pause the queue before changing its prompts.",
      })
    }
    return queue
  }

  private async rewriteQueuePositions(promptIds: string[]): Promise<void> {
    for (const [position, promptId] of promptIds.entries()) {
      const prompt = await this.prompts.getById(promptId)
      if (prompt !== null && prompt.queuePosition !== position) {
        await this.prompts.update(prompt.id, prompt.revision, { queuePosition: position })
      }
    }
  }

  private async requirePrompt(promptId: string): Promise<PromptRecord> {
    const prompt = await this.prompts.getById(promptId)
    if (prompt === null) {
      throw new LuffyflowError({
        code: "PROMPT_NOT_FOUND",
        category: "invalid_data",
        userMessage: "The requested prompt no longer exists.",
      })
    }
    return prompt
  }
}

const createPromptRecord = (
  input: CreateQueueInput,
  text: string,
  sessionId: string,
  position: number,
  now: string,
): PromptRecord => ({
  id: createId(),
  userId: input.userId,
  platform: input.platform,
  text,
  queuePosition: position,
  status: "queued",
  createdAt: now,
  updatedAt: now,
  retryCount: 0,
  outputIds: [],
  sessionId,
  adapterVersion: input.adapterVersion,
  revision: 0,
  syncStatus: "local_only",
})

const createLease = (queue: QueueState, ownerId: string, now: Date) =>
  queueLeaseSchema.parse({
    ownerId,
    generation: (queue.lease?.generation ?? -1) + 1,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + MAXIMUM_GENERATION_LEASE_MS + queue.delayMs).toISOString(),
  })

const isUnfinished = (status: PromptStatus): boolean =>
  status === "draft" ||
  status === "queued" ||
  status === "sending" ||
  status === "waiting_for_output" ||
  status === "failed"

const promptLockedError = () =>
  new LuffyflowError({
    code: "PROMPT_EDIT_LOCKED",
    category: "invalid_data",
    userMessage: "Only draft or queued prompts can be changed.",
  })
