import { LuffyflowError } from "~/errors/luffyflow-error"
import { queueStateSchema, type QueueLease, type QueueState } from "~/schemas"
import type { VersionedNamespace } from "~/storage/contracts"
import type { QueueRepository } from "~/storage/repositories/contracts"
import type { Clock } from "~/utils/time"
import { systemClock } from "~/utils/time"

import { recordMissingError, revisionConflictError } from "./repository-errors"

/** The background-owned queue repository serializes every durable lease and revision change. */
export class LocalQueueRepository implements QueueRepository {
  private operation: Promise<void> = Promise.resolve()

  constructor(
    private readonly namespace: VersionedNamespace<QueueState>,
    private readonly clock: Clock = systemClock,
  ) {}

  getActive(): Promise<QueueState | null> {
    return this.runExclusive(() => this.namespace.get())
  }

  save(queue: QueueState, expectedRevision?: number): Promise<QueueState> {
    return this.runExclusive(async () => {
      const current = await this.namespace.get()
      if (current === null) {
        if (expectedRevision !== undefined && expectedRevision !== 0) {
          throw revisionConflictError("queue", queue.id, expectedRevision, 0)
        }
        return this.namespace.set(queueStateSchema.parse({ ...queue, revision: 0 }))
      }
      if (current.id !== queue.id) {
        if (
          current.status === "stopped" ||
          current.status === "completed" ||
          current.status === "failed"
        ) {
          return this.namespace.set(queueStateSchema.parse({ ...queue, revision: 0 }))
        }
        throw new LuffyflowError({
          code: "QUEUE_ALREADY_EXISTS",
          category: "invalid_data",
          userMessage: "Another LuffyFlow queue already owns the durable queue slot.",
          recoverable: true,
        })
      }
      if (expectedRevision === undefined || current.revision !== expectedRevision) {
        throw revisionConflictError(
          "queue",
          queue.id,
          expectedRevision ?? queue.revision,
          current.revision,
        )
      }
      return this.namespace.set(
        queueStateSchema.parse({
          ...queue,
          revision: current.revision + 1,
          updatedAt: this.clock.now().toISOString(),
        }),
      )
    })
  }

  acquireLease(queueId: string, candidate: QueueLease): Promise<QueueState> {
    return this.runExclusive(async () => {
      const current = await this.requireQueue(queueId)
      const now = this.clock.now()
      if (Date.parse(candidate.expiresAt) <= now.getTime()) {
        throw new LuffyflowError({
          code: "QUEUE_LEASE_EXPIRED",
          category: "invalid_data",
          userMessage: "LuffyFlow could not acquire an already-expired queue lease.",
        })
      }
      if (
        current.lease !== undefined &&
        current.lease.ownerId !== candidate.ownerId &&
        Date.parse(current.lease.expiresAt) > now.getTime()
      ) {
        throw new LuffyflowError({
          code: "QUEUE_LEASE_HELD",
          category: "storage_failure",
          userMessage: "This queue is already running in another LuffyFlow worker.",
          recoverable: true,
        })
      }
      const minimumGeneration = (current.lease?.generation ?? -1) + 1
      if (candidate.generation < minimumGeneration) {
        throw new LuffyflowError({
          code: "QUEUE_LEASE_STALE",
          category: "authorization",
          userMessage: "LuffyFlow rejected a stale queue lease.",
        })
      }
      return this.namespace.set(
        queueStateSchema.parse({
          ...current,
          lease: candidate,
          revision: current.revision + 1,
          updatedAt: now.toISOString(),
        }),
      )
    })
  }

  releaseLease(queueId: string, ownerId: string): Promise<void> {
    return this.runExclusive(async () => {
      const current = await this.requireQueue(queueId)
      if (current.lease === undefined) return
      if (current.lease.ownerId !== ownerId) {
        throw new LuffyflowError({
          code: "QUEUE_LEASE_OWNER_MISMATCH",
          category: "authorization",
          userMessage: "LuffyFlow rejected a lease release from a stale worker.",
        })
      }
      await this.namespace.set(
        queueStateSchema.parse({
          ...current,
          lease: { ...current.lease, expiresAt: this.clock.now().toISOString() },
          revision: current.revision + 1,
          updatedAt: this.clock.now().toISOString(),
        }),
      )
    })
  }

  private async requireQueue(queueId: string): Promise<QueueState> {
    const queue = await this.namespace.get()
    if (queue === null || queue.id !== queueId) throw recordMissingError("queue", queueId)
    return queue
  }

  private runExclusive<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    const result = this.operation.then(operation, operation)
    this.operation = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
