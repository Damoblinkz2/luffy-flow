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
  type User,
  userSchema,
} from "~/schemas/auth"

/** Auth contract isolates session workflows from both HTTP and mock transports. */
export interface AuthApi {
  signup(request: SignupRequest): Promise<AuthResponse>
  login(request: LoginRequest): Promise<AuthResponse>
  logout(): Promise<void>
  refresh(request: RefreshTokenRequest): Promise<AuthResponse>
  forgotPassword(request: ForgotPasswordRequest): Promise<{ accepted: true }>
  me(): Promise<User>
}

/** Typed auth endpoints contain no persistence or UI behavior. */
export class AuthApiClient implements AuthApi {
  constructor(private readonly client: TypedApiClient) {}

  signup(request: SignupRequest): Promise<AuthResponse> {
    return this.client.request(
      { method: "POST", path: "/auth/signup", body: request, authentication: "omit" },
      authResponseSchema,
    )
  }

  login(request: LoginRequest): Promise<AuthResponse> {
    return this.client.request(
      { method: "POST", path: "/auth/login", body: request, authentication: "omit" },
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
