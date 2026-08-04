import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, type UseFormRegisterReturn } from "react-hook-form"

import { signupRequestSchema, type SignupRequest } from "~/schemas/auth"

import { useAuthStore } from "./AuthProvider"

/** Navigation after account creation stays outside the reusable form. */
export interface SignupFormProps {
  onSuccess?: () => void
}

/** Sign-up validation mirrors the API schema and discards password fields after submission. */
export const SignupForm = ({ onSuccess }: SignupFormProps) => {
  const signup = useAuthStore((state) => state.signup)
  const status = useAuthStore((state) => state.status)
  const serverError = useAuthStore((state) => state.error)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupRequest>({ resolver: zodResolver(signupRequestSchema) })

  const submit = async (values: SignupRequest): Promise<void> => {
    try {
      await signup(values)
      onSuccess?.()
    } catch {
      // Store feedback is rendered in the form without exposing diagnostic details.
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(submit)(event)} noValidate>
      <Field
        id="signup-name"
        label="Display name"
        autoComplete="name"
        error={errors.displayName?.message}
        inputProps={register("displayName")}
      />
      <Field
        id="signup-email"
        label="Email address"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        inputProps={register("email")}
      />
      <Field
        id="signup-password"
        label="Password"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        inputProps={register("password")}
      />

      <p className="text-xs text-foreground/70">
        Use at least eight characters with uppercase, lowercase, number, and special character.
      </p>

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
        {status === "loading" ? "Creating account..." : "Create account"}
      </button>
    </form>
  )
}

/** Field registration props preserve React Hook Form refs and event handlers. */
interface FieldProps {
  id: string
  label: string
  type?: "text" | "email" | "password"
  autoComplete: string
  error?: string | undefined
  inputProps: UseFormRegisterReturn
}

/** Compact field helper keeps labels and error descriptions consistently accessible. */
const Field = ({ id, label, type = "text", autoComplete, error, inputProps }: FieldProps) => (
  <div>
    <label className="mb-1 block text-sm font-medium" htmlFor={id}>
      {label}
    </label>
    <input
      id={id}
      type={type}
      autoComplete={autoComplete}
      aria-invalid={error !== undefined}
      aria-describedby={error === undefined ? undefined : `${id}-error`}
      className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
      {...inputProps}
    />
    {error === undefined ? null : (
      <p id={`${id}-error`} className="mt-1 text-sm text-danger" role="alert">
        {error}
      </p>
    )}
  </div>
)
