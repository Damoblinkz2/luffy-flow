import type { AuthTokenProvider } from "~/api/client/contracts"

/** Mutable delegation breaks the API-client/auth-service construction cycle cleanly. */
export class DelegatingAuthTokenProvider implements AuthTokenProvider {
  private delegate: AuthTokenProvider | null = null

  /** Completes the dependency cycle after the real auth service has been constructed. */
  setDelegate(delegate: AuthTokenProvider): void {
    this.delegate = delegate
  }

  /** Forwards access-token lookup or behaves as signed out before wiring is complete. */
  getAccessToken(): Promise<string | null> {
    return this.delegate?.getAccessToken() ?? Promise.resolve(null)
  }

  /** Forwards forced refresh or behaves as signed out before wiring is complete. */
  refreshAccessToken(): Promise<string | null> {
    return this.delegate?.refreshAccessToken() ?? Promise.resolve(null)
  }
}
