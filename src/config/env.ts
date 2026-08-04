import { z } from "zod"

import { DEFAULT_API_TIMEOUT_MS } from "~/constants"
import { appEnvironmentSchema } from "~/schemas/api"

/** Environment booleans must use explicit text to avoid JavaScript truthiness surprises. */
const environmentBooleanSchema = z.preprocess((value) => {
  if (typeof value === "boolean") return value
  if (typeof value !== "string") return value
  if (value.toLowerCase() === "true") return true
  if (value.toLowerCase() === "false") return false
  return value
}, z.boolean())

/** Numeric public variables are parsed before range validation. */
const environmentNumberSchema = z.preprocess((value) => {
  if (typeof value === "number") return value
  if (typeof value === "string" && value.trim() !== "") return Number(value)
  return value
}, z.number())

/** Local HTTP is permitted for development; non-local API traffic must use TLS. */
const backendUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    } catch {
      return false
    }
  }, "The backend URL must use HTTPS unless it targets localhost.")

const publicEnvironmentSchema = z.object({
  PLASMO_PUBLIC_API_BASE_URL: backendUrlSchema.default("https://api.example.com"),
  PLASMO_PUBLIC_USE_MOCK_API: environmentBooleanSchema.default(true),
  PLASMO_PUBLIC_APP_ENV: appEnvironmentSchema.default("development"),
  PLASMO_PUBLIC_MOCK_API_LATENCY_MS: environmentNumberSchema
    .pipe(z.number().int().min(0).max(30_000))
    .default(500),
  PLASMO_PUBLIC_MOCK_API_FAILURE_RATE: environmentNumberSchema
    .pipe(z.number().min(0).max(1))
    .default(0),
  PLASMO_PUBLIC_API_TIMEOUT_MS: environmentNumberSchema
    .pipe(z.number().int().min(1_000).max(120_000))
    .default(DEFAULT_API_TIMEOUT_MS),
})

export interface PublicAppConfig {
  apiBaseUrl: string
  useMockApi: boolean
  appEnvironment: z.infer<typeof appEnvironmentSchema>
  mockApiLatencyMs: number
  mockApiFailureRate: number
  apiTimeoutMs: number
}

/** Reading only named public variables prevents accidental secret exposure to the bundle. */
export const readPublicAppConfig = (
  environment: Record<string, string | undefined> = process.env,
): PublicAppConfig => {
  const parsed = publicEnvironmentSchema.parse({
    PLASMO_PUBLIC_API_BASE_URL: environment.PLASMO_PUBLIC_API_BASE_URL,
    PLASMO_PUBLIC_USE_MOCK_API: environment.PLASMO_PUBLIC_USE_MOCK_API,
    PLASMO_PUBLIC_APP_ENV: environment.PLASMO_PUBLIC_APP_ENV,
    PLASMO_PUBLIC_MOCK_API_LATENCY_MS: environment.PLASMO_PUBLIC_MOCK_API_LATENCY_MS,
    PLASMO_PUBLIC_MOCK_API_FAILURE_RATE: environment.PLASMO_PUBLIC_MOCK_API_FAILURE_RATE,
    PLASMO_PUBLIC_API_TIMEOUT_MS: environment.PLASMO_PUBLIC_API_TIMEOUT_MS,
  })

  return {
    apiBaseUrl: parsed.PLASMO_PUBLIC_API_BASE_URL.replace(/\/+$/, ""),
    useMockApi: parsed.PLASMO_PUBLIC_USE_MOCK_API,
    appEnvironment: parsed.PLASMO_PUBLIC_APP_ENV,
    mockApiLatencyMs: parsed.PLASMO_PUBLIC_MOCK_API_LATENCY_MS,
    mockApiFailureRate: parsed.PLASMO_PUBLIC_MOCK_API_FAILURE_RATE,
    apiTimeoutMs: parsed.PLASMO_PUBLIC_API_TIMEOUT_MS,
  }
}
