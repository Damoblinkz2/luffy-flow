import { type z, ZodError } from "zod"

import type { MockRequestContext } from "~/api/mock/MockTransport"
import { type MockTransport } from "~/api/mock/MockTransport"
import { AutoflowError } from "~/errors/autoflow-error"
import {
  authResponseSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  refreshTokenRequestSchema,
  signupRequestSchema,
  type AuthResponse,
} from "~/schemas/auth"
import { changePlanRequestSchema, checkoutRequestSchema } from "~/schemas/billing"
import type { Clock } from "~/utils/time"
import { systemClock } from "~/utils/time"
import { createId } from "~/utils/ids"
import { MOCK_PLAN_LIMITS } from "~/constants"

import { createMockSalt, digestMockSecret, equalSecretHashes, hashMockPassword } from "./crypto"
import type { MockAccount, MockApiState, MockSession } from "./state"
import { type MockApiStateRepository } from "./state"

const ACCESS_TOKEN_LIFETIME_MS = 15 * 60_000
const REFRESH_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60_000

/** Registration returns one cleanup function so test suites cannot leak handlers. */
export const registerMockApiRoutes = (
  transport: MockTransport,
  repository: MockApiStateRepository,
  clock: Clock = systemClock,
): (() => void) => {
  const unregister = [
    transport.register("POST", "/auth/signup", (context) => {
      const request = parseBody(signupRequestSchema, context.body)
      return repository.update(async (state) => {
        if (state.accounts.some((account) => account.user.email === request.email)) {
          throw conflict("AUTH_EMAIL_EXISTS", "An account with this email already exists.")
        }

        const now = clock.now()
        const userId = createId()
        const salt = createMockSalt()
        const account: MockAccount = {
          user: {
            id: userId,
            email: request.email,
            displayName: request.displayName,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          passwordSalt: salt,
          passwordHash: await hashMockPassword(request.password, salt),
        }
        const periodEnd = addUtcMonths(now, 1)
        const issued = await issueTokens(userId, now)
        state.accounts.push(account)
        state.sessions.push(issued.session)
        state.subscriptions.push({
          id: createId(),
          userId,
          planId: "free",
          billingStatus: "active",
          monthlyLimit: MOCK_PLAN_LIMITS.free,
          currentPeriodStart: now.toISOString(),
          currentPeriodEnd: periodEnd.toISOString(),
          cancelAtPeriodEnd: false,
          provider: "mock",
          updatedAt: now.toISOString(),
        })
        state.usage.push({
          userId,
          periodStart: now.toISOString(),
          periodEnd: periodEnd.toISOString(),
          used: 0,
          limit: MOCK_PLAN_LIMITS.free,
          remaining: MOCK_PLAN_LIMITS.free,
          updatedAt: now.toISOString(),
        })
        return {
          state,
          result: { body: authResponseSchema.parse({ user: account.user, tokens: issued.tokens }) },
        }
      })
    }),
    transport.register("POST", "/auth/login", (context) => {
      const request = parseBody(loginRequestSchema, context.body)
      return repository.update(async (state) => {
        const account = state.accounts.find((candidate) => candidate.user.email === request.email)
        const passwordMatches =
          account !== undefined &&
          equalSecretHashes(
            await hashMockPassword(request.password, account.passwordSalt),
            account.passwordHash,
          )
        if (account === undefined || !passwordMatches) {
          throw unauthorized("AUTH_INVALID_CREDENTIALS", "The email or password is incorrect.")
        }

        const now = clock.now()
        const issued = await issueTokens(account.user.id, now)
        state.sessions = pruneExpiredSessions(state.sessions, now)
        state.sessions.push(issued.session)
        return { state, result: { body: { user: account.user, tokens: issued.tokens } } }
      })
    }),
    transport.register("POST", "/auth/logout", async (context) => {
      const accessToken = readBearerToken(context)
      const accessHash = await digestMockSecret(accessToken)
      return repository.update((state) => {
        const originalLength = state.sessions.length
        state.sessions = state.sessions.filter((session) => session.accessTokenHash !== accessHash)
        if (state.sessions.length === originalLength) {
          throw unauthorized("AUTH_SESSION_INVALID", "Your AutoFlow session is no longer valid.")
        }
        return { state, result: { status: 204 } }
      })
    }),
    transport.register("POST", "/auth/refresh", async (context) => {
      const request = parseBody(refreshTokenRequestSchema, context.body)
      const refreshHash = await digestMockSecret(request.refreshToken)
      return repository.update(async (state) => {
        const now = clock.now()
        const existing = state.sessions.find((session) => session.refreshTokenHash === refreshHash)
        if (existing === undefined || Date.parse(existing.refreshExpiresAt) <= now.getTime()) {
          throw unauthorized("AUTH_REFRESH_EXPIRED", "Your AutoFlow session has expired.")
        }
        const account = requireAccount(state, existing.userId)
        const issued = await issueTokens(account.user.id, now)
        state.sessions = state.sessions.filter((session) => session !== existing)
        state.sessions.push(issued.session)
        return { state, result: { body: { user: account.user, tokens: issued.tokens } } }
      })
    }),
    transport.register("POST", "/auth/forgot-password", (context) => {
      parseBody(forgotPasswordRequestSchema, context.body)
      return { body: { accepted: true } }
    }),
    transport.register("GET", "/auth/me", async (context) => {
      const authenticated = await authenticate(context, repository, clock)
      return { body: authenticated.account.user }
    }),
    transport.register("GET", "/billing/subscription", async (context) => {
      const authenticated = await authenticate(context, repository, clock)
      return { body: requireSubscription(authenticated.state, authenticated.account.user.id) }
    }),
    transport.register("POST", "/billing/checkout", async (context) => {
      parseBody(checkoutRequestSchema, context.body)
      await authenticate(context, repository, clock)
      return {
        body: { provider: "mock", status: "completed", checkoutReference: `mock_${createId()}` },
      }
    }),
    transport.register("POST", "/billing/change-plan", async (context) => {
      const request = parseBody(changePlanRequestSchema, context.body)
      const authenticated = await authenticate(context, repository, clock)
      return repository.update((state) => {
        const subscription = requireSubscription(state, authenticated.account.user.id)
        const usage = requireUsage(state, authenticated.account.user.id)
        const limit = MOCK_PLAN_LIMITS[request.planId]
        subscription.planId = request.planId
        subscription.monthlyLimit = limit
        subscription.billingStatus = "active"
        subscription.cancelAtPeriodEnd = false
        subscription.updatedAt = clock.now().toISOString()
        usage.limit = limit
        usage.remaining = Math.max(0, limit - usage.used)
        usage.updatedAt = clock.now().toISOString()
        return { state, result: { body: subscription } }
      })
    }),
    transport.register("POST", "/billing/cancel", async (context) => {
      const authenticated = await authenticate(context, repository, clock)
      return repository.update((state) => {
        const subscription = requireSubscription(state, authenticated.account.user.id)
        subscription.cancelAtPeriodEnd = true
        subscription.updatedAt = clock.now().toISOString()
        return { state, result: { body: subscription } }
      })
    }),
    transport.register("GET", "/billing/invoices", async (context) => {
      const authenticated = await authenticate(context, repository, clock)
      const limit = readLimit(context.query.get("limit"))
      const offset = readOffset(context.query.get("cursor"))
      const invoices = authenticated.state.invoices
        .filter((entry) => entry.userId === authenticated.account.user.id)
        .map((entry) => entry.invoice)
      const items = invoices.slice(offset, offset + limit)
      const nextOffset = offset + items.length
      return {
        body: {
          items,
          total: invoices.length,
          ...(nextOffset >= invoices.length ? {} : { nextCursor: String(nextOffset) }),
        },
      }
    }),
    transport.register("GET", "/usage", async (context) => {
      const authenticated = await authenticate(context, repository, clock)
      return { body: requireUsage(authenticated.state, authenticated.account.user.id) }
    }),
    transport.register("POST", "/usage/increment", async (context) => {
      const idempotencyKey = readIdempotencyKey(context)
      const authenticated = await authenticate(context, repository, clock)
      return repository.update((state) => {
        const usage = requireUsage(state, authenticated.account.user.id)
        const scopedKey = `${authenticated.account.user.id}:${idempotencyKey}`
        if (state.usageIdempotencyKeys.includes(scopedKey))
          return { state, result: { body: usage } }
        if (usage.used >= usage.limit) {
          throw new AutoflowError({
            code: "USAGE_LIMIT_REACHED",
            category: "usage_limit",
            userMessage: "Your monthly prompt limit has been reached.",
            recoverable: false,
          })
        }
        usage.used += 1
        usage.remaining = Math.max(0, usage.limit - usage.used)
        usage.updatedAt = clock.now().toISOString()
        state.usageIdempotencyKeys.push(scopedKey)
        if (state.usageIdempotencyKeys.length > 10_000) state.usageIdempotencyKeys.shift()
        return { state, result: { body: usage } }
      })
    }),
  ]

  return () => unregister.forEach((cleanup) => cleanup())
}

const parseBody = <T>(schema: z.ZodType<T>, body: unknown): T => {
  try {
    return schema.parse(body)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AutoflowError({
        code: "VALIDATION_FAILED",
        category: "invalid_data",
        userMessage: "The submitted information is invalid.",
        diagnosticMessage: error.message,
      })
    }
    throw error
  }
}

const issueTokens = async (
  userId: string,
  now: Date,
): Promise<{ session: MockSession; tokens: AuthResponse["tokens"] }> => {
  const accessToken = `mock_access_${createId()}_${createId()}`
  const refreshToken = `mock_refresh_${createId()}_${createId()}`
  const accessExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_LIFETIME_MS)
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS)
  return {
    session: {
      userId,
      accessTokenHash: await digestMockSecret(accessToken),
      refreshTokenHash: await digestMockSecret(refreshToken),
      accessExpiresAt: accessExpiresAt.toISOString(),
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    },
    tokens: { accessToken, refreshToken, expiresAt: accessExpiresAt.toISOString() },
  }
}

const authenticate = async (
  context: MockRequestContext,
  repository: MockApiStateRepository,
  clock: Clock,
): Promise<{ state: MockApiState; account: MockAccount }> => {
  const accessHash = await digestMockSecret(readBearerToken(context))
  const state = await repository.read()
  const session = state.sessions.find((candidate) => candidate.accessTokenHash === accessHash)
  if (session === undefined || Date.parse(session.accessExpiresAt) <= clock.now().getTime()) {
    throw unauthorized("AUTH_ACCESS_EXPIRED", "Your AutoFlow session has expired.")
  }
  return { state, account: requireAccount(state, session.userId) }
}

const readBearerToken = (context: MockRequestContext): string => {
  const authorization = Object.entries(context.headers).find(
    ([key]) => key.toLowerCase() === "authorization",
  )?.[1]
  if (!authorization?.startsWith("Bearer ")) {
    throw unauthorized("AUTH_REQUIRED", "Please log in to continue.")
  }
  return authorization.slice("Bearer ".length)
}

const readIdempotencyKey = (context: MockRequestContext): string => {
  const key = Object.entries(context.headers).find(
    ([header]) => header.toLowerCase() === "idempotency-key",
  )?.[1]
  if (key === undefined || key.length === 0 || key.length > 255) {
    throw new AutoflowError({
      code: "IDEMPOTENCY_KEY_REQUIRED",
      category: "invalid_data",
      userMessage: "A valid usage event identifier is required.",
    })
  }
  return key
}

const requireAccount = (state: MockApiState, userId: string): MockAccount => {
  const account = state.accounts.find((candidate) => candidate.user.id === userId)
  if (account === undefined)
    throw unauthorized("AUTH_USER_MISSING", "This account no longer exists.")
  return account
}

const requireSubscription = (state: MockApiState, userId: string) => {
  const subscription = state.subscriptions.find((candidate) => candidate.userId === userId)
  if (subscription === undefined) {
    throw new AutoflowError({
      code: "SUBSCRIPTION_MISSING",
      category: "subscription",
      userMessage: "AutoFlow could not find your subscription.",
    })
  }
  return subscription
}

const requireUsage = (state: MockApiState, userId: string) => {
  const usage = state.usage.find((candidate) => candidate.userId === userId)
  if (usage === undefined) {
    throw new AutoflowError({
      code: "USAGE_MISSING",
      category: "subscription",
      userMessage: "AutoFlow could not find your usage record.",
    })
  }
  return usage
}

const unauthorized = (code: string, userMessage: string): AutoflowError =>
  new AutoflowError({ code, category: "authentication", userMessage, recoverable: false })

const conflict = (code: string, userMessage: string): AutoflowError =>
  new AutoflowError({ code, category: "invalid_data", userMessage, recoverable: false })

const pruneExpiredSessions = (sessions: MockSession[], now: Date): MockSession[] =>
  sessions.filter((session) => Date.parse(session.refreshExpiresAt) > now.getTime())

const addUtcMonths = (date: Date, months: number): Date => {
  const result = new Date(date)
  result.setUTCMonth(result.getUTCMonth() + months)
  return result
}

const readLimit = (value: string | null): number => {
  const parsed = Number(value ?? 25)
  return Number.isInteger(parsed) ? Math.min(100, Math.max(1, parsed)) : 25
}

const readOffset = (value: string | null): number => {
  const parsed = Number(value ?? 0)
  return Number.isInteger(parsed) ? Math.max(0, parsed) : 0
}
