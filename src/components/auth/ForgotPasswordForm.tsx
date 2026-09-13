import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { forgotPasswordRequestSchema, type ForgotPasswordRequest } from "~/schemas/auth"

import { useAuthStore } from "./AuthProvider"

/** The owning page controls returning from the password-recovery flow. */
export interface ForgotPasswordFormProps {
  onBack?: () => void
}

/** Recovery requests preserve the backend's account-enumeration-safe response. */
export const ForgotPasswordForm = ({ onBack }: ForgotPasswordFormProps) => {
  const forgotPassword = useAuthStore((state) => state.forgotPassword)
  const status = useAuthStore((state) => state.status)
  const error = useAuthStore((state) => state.error)
  const notice = useAuthStore((state) => state.notice)
  const { register, handleSubmit, formState } = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(forgotPasswordRequestSchema),
  })

  const submit = async (values: ForgotPasswordRequest): Promise<void> => {
    try {
      await forgotPassword(values.email)
    } catch {
      // User-safe error state is owned by the auth store.
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(submit)(event)} noValidate>
      <p className="text-sm">
        Enter your account email. If it exists, recovery instructions will be prepared securely.
      </p>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="forgot-email">
          Email address
        </label>
        <input
          id="forgot-email"
          type="email"
          autoComplete="email"
          aria-invalid={formState.errors.email !== undefined}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
          {...register("email")}
        />
        {formState.errors.email?.message === undefined ? null : (
          <p className="mt-1 text-sm text-danger" role="alert">
            {formState.errors.email.message}
          </p>
        )}
      </div>
      {error === null ? null : <p role="alert">{error}</p>}
      {notice === null ? null : <p role="status">{notice}</p>}
      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {status === "loading" ? "Submitting..." : "Request reset"}
      </button>
      <button type="button" className="w-full text-sm text-primary underline" onClick={onBack}>
        Back to login
      </button>
    </form>
  )
}
