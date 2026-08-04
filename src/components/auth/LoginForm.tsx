import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { DEMO_ACCOUNT } from "~/constants"
import { loginRequestSchema, type LoginRequest } from "~/schemas/auth"

import { useAuthStore } from "./AuthProvider"

/** Navigation behavior is supplied by the owning extension surface. */
export interface LoginFormProps {
  onSuccess?: () => void
  onForgotPassword?: () => void
}

/** Login form sends password values directly to the auth service and never persists them. */
export const LoginForm = ({ onSuccess, onForgotPassword }: LoginFormProps) => {
  const login = useAuthStore((state) => state.login)
  const status = useAuthStore((state) => state.status)
  const serverError = useAuthStore((state) => state.error)
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginRequest>({ resolver: zodResolver(loginRequestSchema) })

  const submit = async (values: LoginRequest): Promise<void> => {
    try {
      await login(values)
      onSuccess?.()
    } catch {
      // The store exposes a redacted user-facing error above the submit action.
    }
  }

  const fillDemoAccount = (): void => {
    setValue("email", DEMO_ACCOUNT.email, { shouldValidate: true })
    setValue("password", DEMO_ACCOUNT.password, { shouldValidate: true })
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(submit)(event)} noValidate>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="login-email">
          Email address
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email !== undefined}
          aria-describedby={errors.email === undefined ? undefined : "login-email-error"}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
          {...register("email")}
        />
        {errors.email?.message === undefined ? null : (
          <p id="login-email-error" className="mt-1 text-sm text-danger" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="login-password">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password !== undefined}
          aria-describedby={errors.password === undefined ? undefined : "login-password-error"}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
          {...register("password")}
        />
        {errors.password?.message === undefined ? null : (
          <p id="login-password-error" className="mt-1 text-sm text-danger" role="alert">
            {errors.password.message}
          </p>
        )}
      </div>

      {serverError === null ? null : (
        <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger" role="alert">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
      >
        {status === "loading" ? "Logging in..." : "Log in"}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" className="text-primary underline" onClick={onForgotPassword}>
          Forgot password?
        </button>
        <button type="button" className="text-primary underline" onClick={fillDemoAccount}>
          Use demo account
        </button>
      </div>

      <p className="rounded-lg border border-border p-3 text-xs">
        Development-only demo: <strong>{DEMO_ACCOUNT.email}</strong> /{" "}
        <strong>{DEMO_ACCOUNT.password}</strong>
      </p>
    </form>
  )
}
