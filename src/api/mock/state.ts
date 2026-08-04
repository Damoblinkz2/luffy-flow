import { z } from "zod"

import { DEMO_ACCOUNT, MOCK_PLAN_LIMITS } from "~/constants"
import { subscriptionSchema, usageSchema, invoicePlaceholderSchema } from "~/schemas/billing"
import { isoDateTimeSchema } from "~/schemas/common"
import { userSchema } from "~/schemas/auth"
import type { VersionedNamespace } from "~/storage/contracts"
import type { Clock } from "~/utils/time"
import { systemClock } from "~/utils/time"

import { createMockSalt, hashMockPassword } from "./crypto"

const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001"
const DEMO_SUBSCRIPTION_ID = "00000000-0000-4000-8000-000000000002"

/** Credentials contain only a salted hash; submitted passwords never enter persisted state. */
export const mockAccountSchema = z.object({
  user: userSchema,
  passwordSalt: z.string().length(32),
  passwordHash: z.string().length(64),
})

/** Mock sessions persist token hashes so storage never contains server-side bearer values. */
export const mockSessionSchema = z.object({
  userId: z.string().uuid(),
  accessTokenHash: z.string().length(64),
  refreshTokenHash: z.string().length(64),
  accessExpiresAt: isoDateTimeSchema,
  refreshExpiresAt: isoDateTimeSchema,
})

/** Mock invoice ownership stays server-side and is not exposed in billing response records. */
export const mockInvoiceSchema = z.object({
  userId: z.string().uuid(),
  invoice: invoicePlaceholderSchema,
})

export const mockApiStateSchema = z.object({
  accounts: z.array(mockAccountSchema).max(10_000),
  sessions: z.array(mockSessionSchema).max(10_000),
  subscriptions: z.array(subscriptionSchema).max(10_000),
  usage: z.array(usageSchema).max(10_000),
  invoices: z.array(mockInvoiceSchema).max(10_000),
  usageIdempotencyKeys: z.array(z.string().min(1).max(512)).max(10_000),
})

export type MockAccount = z.infer<typeof mockAccountSchema>
export type MockSession = z.infer<typeof mockSessionSchema>
export type MockApiState = z.infer<typeof mockApiStateSchema>

export interface StateMutationResult<TResult> {
  state: MockApiState
  result: TResult
}

/** Serialized state access prevents lost updates when several mock endpoints run concurrently. */
export class MockApiStateRepository {
  private operation: Promise<void> = Promise.resolve()
  private readonly clock: Clock

  constructor(
    private readonly namespace: VersionedNamespace<MockApiState>,
    clock: Clock = systemClock,
  ) {
    this.clock = clock
  }

  read(): Promise<MockApiState> {
    return this.runExclusive(() => this.readOrSeed())
  }

  update<TResult>(
    mutator: (
      state: MockApiState,
    ) => Promise<StateMutationResult<TResult>> | StateMutationResult<TResult>,
  ): Promise<TResult> {
    return this.runExclusive(async () => {
      const current = await this.readOrSeed()
      const mutation = await mutator(current)
      const validated = mockApiStateSchema.parse(mutation.state)
      await this.namespace.set(validated)
      return mutation.result
    })
  }

  private async readOrSeed(): Promise<MockApiState> {
    const existing = await this.namespace.get()
    if (existing !== null) return mockApiStateSchema.parse(existing)

    const seeded = await this.createSeedState()
    await this.namespace.set(seeded)
    return seeded
  }

  private async createSeedState(): Promise<MockApiState> {
    const now = this.clock.now()
    const periodEnd = new Date(now)
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1)
    const salt = createMockSalt()

    return mockApiStateSchema.parse({
      accounts: [
        {
          user: {
            id: DEMO_USER_ID,
            email: DEMO_ACCOUNT.email,
            displayName: "AutoFlow Demo",
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          passwordSalt: salt,
          passwordHash: await hashMockPassword(DEMO_ACCOUNT.password, salt),
        },
      ],
      sessions: [],
      subscriptions: [
        {
          id: DEMO_SUBSCRIPTION_ID,
          userId: DEMO_USER_ID,
          planId: "free",
          billingStatus: "active",
          monthlyLimit: MOCK_PLAN_LIMITS.free,
          currentPeriodStart: now.toISOString(),
          currentPeriodEnd: periodEnd.toISOString(),
          cancelAtPeriodEnd: false,
          provider: "mock",
          updatedAt: now.toISOString(),
        },
      ],
      usage: [
        {
          userId: DEMO_USER_ID,
          periodStart: now.toISOString(),
          periodEnd: periodEnd.toISOString(),
          used: 0,
          limit: MOCK_PLAN_LIMITS.free,
          remaining: MOCK_PLAN_LIMITS.free,
          updatedAt: now.toISOString(),
        },
      ],
      invoices: [],
      usageIdempotencyKeys: [],
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
