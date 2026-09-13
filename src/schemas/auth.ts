import * as z from "zod/v3"

import { entityIdSchema, isoDateTimeSchema } from "./common"

/** User records contain profile data only and never password material. */
export const userSchema = z.object({
  id: entityIdSchema,
  email: z.string().email().max(320),
  displayName: z.string().trim().min(1).max(100),
  role: z.enum(["owner", "admin", "support", "user"]),
  status: z.enum(["active", "suspended"]),
  emailVerified: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

/** Tokens are validated at the storage/API boundary and redacted from all logs. */
export const authTokensSchema = z.object({
  accessToken: z.string().min(1).max(16_384),
  refreshToken: z.string().min(1).max(16_384),
  expiresAt: isoDateTimeSchema,
})

/** A restored session records when local state was rehydrated for diagnostics. */
export const authSessionSchema = z.object({
  user: userSchema,
  tokens: authTokensSchema,
  restoredAt: isoDateTimeSchema.optional(),
})

/** Authentication forms enforce the same password policy as the production API. */
export const passwordSchema = z
  .string()
  .min(8)
  .max(256)
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[0-9]/, "Password must contain a number.")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character.")

/** Password-bearing request schemas are intentionally separate from persistent records. */
export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: passwordSchema,
})

export const signupRequestSchema = loginRequestSchema.extend({
  displayName: z.string().trim().min(1).max(100),
})

export const authResponseSchema = z.object({
  user: userSchema,
  tokens: authTokensSchema,
})

/** Signup creates an inactive account until the address link is opened. */
export const signupResponseSchema = z.object({
  verificationRequired: z.literal(true),
  email: z.string().email().max(320),
  developmentVerificationUrl: z.string().url().optional(),
})

export const refreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1).max(16_384),
})

export const forgotPasswordRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
})

export const forgotPasswordResponseSchema = z.object({ accepted: z.literal(true) })

export type User = z.infer<typeof userSchema>
export type AuthTokens = z.infer<typeof authTokensSchema>
export type AuthSession = z.infer<typeof authSessionSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>
export type SignupRequest = z.infer<typeof signupRequestSchema>
export type AuthResponse = z.infer<typeof authResponseSchema>
export type SignupResponse = z.infer<typeof signupResponseSchema>
export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>
