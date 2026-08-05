import type { AuthTokenProvider } from "~/api/client/contracts"
import type { AuthApi } from "~/api/modules/auth-api"
import { LuffyflowError } from "~/errors/luffyflow-error"
import type { Logger } from "~/logging/logger"
import {
  authSessionSchema,
  type AuthSession,
  type LoginRequest,
  type SignupRequest,
} from "~/schemas/auth"
import type { VersionedNamespace } from "~/storage/contracts"
import type { Clock } from "~/utils/time"
import { systemClock } from "~/utils/time"

const TOKEN_REFRESH_SKEW_MS = 30_000

/** Auth service owns session persistence and coordinates a single refresh across callers. */
export class AuthService implements AuthTokenProvider {
  private session: AuthSession | null = null
  private hydrated = false
  private refreshOperation: Promise<AuthSession> | null = null
  private readonly clock: Clock

  constructor(
    private readonly api: AuthApi,
    private readonly sessionStorage: VersionedNamespace<AuthSession>,
    private readonly logger: Logger,
    clock: Clock = systemClock,
  ) {
    this.clock = clock
  }

  async signup(request: SignupRequest): Promise<AuthSession> {
    return this.persistResponse(await this.api.signup(request))
  }

  async login(request: LoginRequest): Promise<AuthSession> {
    return this.persistResponse(await this.api.login(request))
  }

  /** Local logout always succeeds even when the mock/remote endpoint is unavailable. */
  async logout(): Promise<void> {
    try {
      if ((await this.ensureHydrated()) !== null) await this.api.logout()
    } catch (error) {
      this.logger.warn("Remote logout failed; local session will still be cleared.", error)
    } finally {
      this.session = null
      this.hydrated = true
      await this.sessionStorage.remove()
    }
  }

  forgotPassword(email: string): Promise<{ accepted: true }> {
    return this.api.forgotPassword({ email })
  }

  /** Restoration verifies a valid cached session and refreshes expired access tokens. */
  async restoreSession(): Promise<AuthSession | null> {
    const session = await this.ensureHydrated()
    if (session === null) return null
    if (this.isExpiring(session)) return this.refreshSession()

    try {
      const user = await this.api.me()
      // The API client may have rotated tokens while replaying an initially unauthorized request.
      const verifiedSession = this.session ?? session
      const restoredSession = authSessionSchema.parse({
        ...verifiedSession,
        user,
        restoredAt: this.clock.now().toISOString(),
      })
      const persistedSession = await this.sessionStorage.set(restoredSession)
      this.session = persistedSession
      return persistedSession
    } catch (error) {
      if (error instanceof LuffyflowError && error.category === "authentication") {
        return this.refreshSession()
      }
      this.logger.warn(
        "Session verification was unavailable; using the unexpired local session.",
        error,
      )
      return session
    }
  }

  async getAccessToken(): Promise<string | null> {
    const session = await this.ensureHydrated()
    if (session === null) return null
    return (this.isExpiring(session) ? await this.refreshSession() : session).tokens.accessToken
  }

  async refreshAccessToken(): Promise<string | null> {
    const session = await this.ensureHydrated()
    if (session === null) return null
    return (await this.refreshSession()).tokens.accessToken
  }

  getCurrentSession(): AuthSession | null {
    return this.session
  }

  private async ensureHydrated(): Promise<AuthSession | null> {
    if (!this.hydrated) {
      this.session = await this.sessionStorage.get()
      this.hydrated = true
    }
    return this.session
  }

  private refreshSession(): Promise<AuthSession> {
    if (this.refreshOperation !== null) return this.refreshOperation

    this.refreshOperation = (async () => {
      const session = await this.ensureHydrated()
      if (session === null) {
        throw new LuffyflowError({
          code: "AUTH_SESSION_MISSING",
          category: "authentication",
          userMessage: "Please log in to continue.",
        })
      }
      try {
        return await this.persistResponse(
          await this.api.refresh({ refreshToken: session.tokens.refreshToken }),
        )
      } catch (error) {
        this.session = null
        await this.sessionStorage.remove()
        throw error
      } finally {
        this.refreshOperation = null
      }
    })()
    return this.refreshOperation
  }

  private async persistResponse(response: {
    user: AuthSession["user"]
    tokens: AuthSession["tokens"]
  }): Promise<AuthSession> {
    const session = authSessionSchema.parse({ user: response.user, tokens: response.tokens })
    const persistedSession = await this.sessionStorage.set(session)
    this.session = persistedSession
    this.hydrated = true
    return persistedSession
  }

  private isExpiring(session: AuthSession): boolean {
    return (
      Date.parse(session.tokens.expiresAt) <= this.clock.now().getTime() + TOKEN_REFRESH_SKEW_MS
    )
  }
}
