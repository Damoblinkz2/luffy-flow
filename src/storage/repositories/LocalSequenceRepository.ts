import * as z from "zod/v3"

import { sequenceCounterSchema, type SequenceCounter } from "~/schemas"
import type { VersionedNamespace } from "~/storage/contracts"
import type { SequenceRepository } from "~/storage/repositories/contracts"
import type { Clock } from "~/utils/time"
import { systemClock } from "~/utils/time"

export const sequenceCounterCollectionSchema = z.array(sequenceCounterSchema).max(100_000)

/** Persistent allocation is serialized and owned by the background composition root. */
export class LocalSequenceRepository implements SequenceRepository {
  private operation: Promise<void> = Promise.resolve()

  constructor(
    private readonly namespace: VersionedNamespace<SequenceCounter[]>,
    private readonly clock: Clock = systemClock,
  ) {}

  allocate(scopeKey: string): Promise<number> {
    return this.runExclusive(async () => {
      const counters = (await this.namespace.get()) ?? []
      const existing = counters.find((counter) => counter.scopeKey === scopeKey)
      const value = (existing?.value ?? 0) + 1
      const updated: SequenceCounter = sequenceCounterSchema.parse({
        scopeKey,
        value,
        revision: (existing?.revision ?? -1) + 1,
        updatedAt: this.clock.now().toISOString(),
      })
      await this.namespace.set([
        ...counters.filter((counter) => counter.scopeKey !== scopeKey),
        updated,
      ])
      return value
    })
  }

  peek(scopeKey: string): Promise<number> {
    return this.runExclusive(async () => {
      const counters = (await this.namespace.get()) ?? []
      return counters.find((counter) => counter.scopeKey === scopeKey)?.value ?? 0
    })
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
