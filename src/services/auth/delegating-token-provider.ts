import type { AuthTokenProvider } from "~/api/client/contracts"

/** Mutable delegation breaks the API-client/auth-service construction cycle cleanly. */
export class DelegatingAuthTokenProvider implements AuthTokenProvider {
  private delegate: AuthTokenProvider | null = null

  setDelegate(delegate: AuthTokenProvider): void {
    this.delegate = delegate
  }

  getAccessToken(): Promise<string | null> {
    return this.delegate?.getAccessToken() ?? Promise.resolve(null)
  }

  refreshAccessToken(): Promise<string | null> {
    return this.delegate?.refreshAccessToken() ?? Promise.resolve(null)
  }
}
