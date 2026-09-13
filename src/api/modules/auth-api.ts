import * as z from "zod/v3"

import type { TypedApiClient } from "~/api/client/contracts"
import {
  authResponseSchema,
  forgotPasswordResponseSchema,
  type AuthResponse,
  type ForgotPasswordRequest,
  type LoginRequest,
  type RefreshTokenRequest,
  type SignupRequest,
  type SignupResponse,
  signupResponseSchema,
  type User,
  userSchema,
} from "~/schemas/auth"

// Password hashing and remote MongoDB transaction commits can legitimately
// exceed the shorter timeout used for ordinary reads on development networks.
const CREDENTIAL_OPERATION_TIMEOUT_MS = 60_000

/** Auth contract isolates session workflows from the concrete HTTP client. */
export interface AuthApi {
  signup(request: SignupRequest): Promise<SignupResponse>
  login(request: LoginRequest): Promise<AuthResponse>
  logout(): Promise<void>
  refresh(request: RefreshTokenRequest): Promise<AuthResponse>
  forgotPassword(request: ForgotPasswordRequest): Promise<{ accepted: true }>
  me(): Promise<User>
}

/** Typed auth endpoints contain no persistence or UI behavior. */
export class AuthApiClient implements AuthApi {
  constructor(private readonly client: TypedApiClient) {}

  signup(request: SignupRequest): Promise<SignupResponse> {
    return this.client.request(
      {
        method: "POST",
        path: "/auth/signup",
        body: request,
        authentication: "omit",
        timeoutMs: CREDENTIAL_OPERATION_TIMEOUT_MS,
      },
      signupResponseSchema,
    )
  }

  login(request: LoginRequest): Promise<AuthResponse> {
    return this.client.request(
      {
        method: "POST",
        path: "/auth/login",
        body: request,
        authentication: "omit",
        timeoutMs: CREDENTIAL_OPERATION_TIMEOUT_MS,
      },
      authResponseSchema,
    )
  }

  logout(): Promise<void> {
    return this.client.request({ method: "POST", path: "/auth/logout" }, z.void())
  }

  refresh(request: RefreshTokenRequest): Promise<AuthResponse> {
    return this.client.request(
      { method: "POST", path: "/auth/refresh", body: request, authentication: "omit" },
      authResponseSchema,
    )
  }

  forgotPassword(request: ForgotPasswordRequest): Promise<{ accepted: true }> {
    return this.client.request(
      {
        method: "POST",
        path: "/auth/forgot-password",
        body: request,
        authentication: "omit",
      },
      forgotPasswordResponseSchema,
    )
  }

  me(): Promise<User> {
    return this.client.request({ method: "GET", path: "/auth/me" }, userSchema)
  }
}
