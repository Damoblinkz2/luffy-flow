import * as z from "zod/v3"

import { DEFAULT_API_TIMEOUT_MS } from "~/constants"
import { appEnvironmentSchema } from "~/schemas/api"

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

const publicEnvironmentSchema = z
  .object({
    PLASMO_PUBLIC_API_BASE_URL: backendUrlSchema.default("http://localhost:8787/api/v1"),
    PLASMO_PUBLIC_APP_ENV: appEnvironmentSchema.default("development"),
    PLASMO_PUBLIC_API_TIMEOUT_MS: environmentNumberSchema
      .pipe(z.number().int().min(1_000).max(120_000))
      .default(DEFAULT_API_TIMEOUT_MS),
  })
  .superRefine((value, context) => {
    if (value.PLASMO_PUBLIC_APP_ENV !== "production") return
    const hostname = new URL(value.PLASMO_PUBLIC_API_BASE_URL).hostname
    if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
      context.addIssue({
        code: "custom",
        path: ["PLASMO_PUBLIC_API_BASE_URL"],
        message: "Production builds require a deployed HTTPS API URL.",
      })
    }
  })

export interface PublicAppConfig {
  apiBaseUrl: string
  appEnvironment: z.infer<typeof appEnvironmentSchema>
  apiTimeoutMs: number
}

/** Reading only named public variables prevents accidental secret exposure to the bundle. */
export const readPublicAppConfig = (
  environment: Record<string, string | undefined> = process.env,
): PublicAppConfig => {
  const parsed = publicEnvironmentSchema.parse({
    PLASMO_PUBLIC_API_BASE_URL: environment.PLASMO_PUBLIC_API_BASE_URL,
    PLASMO_PUBLIC_APP_ENV: environment.PLASMO_PUBLIC_APP_ENV,
    PLASMO_PUBLIC_API_TIMEOUT_MS: environment.PLASMO_PUBLIC_API_TIMEOUT_MS,
  })

  return {
    apiBaseUrl: parsed.PLASMO_PUBLIC_API_BASE_URL.replace(/\/+$/, ""),
    appEnvironment: parsed.PLASMO_PUBLIC_APP_ENV,
    apiTimeoutMs: parsed.PLASMO_PUBLIC_API_TIMEOUT_MS,
  }
}
