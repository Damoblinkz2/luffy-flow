import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"

import { ForgotPasswordForm } from "~/components/auth/ForgotPasswordForm"
import { LoginForm } from "~/components/auth/LoginForm"

/** Login page switches locally to the non-navigating forgot-password placeholder. */
export const LoginPage = () => {
  const [forgotMode, setForgotMode] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const returnPath = readReturnPath(location.state)

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-6">
      <section className="w-full rounded-2xl border border-border bg-surface p-6 shadow-panel">
        <h1 className="text-2xl font-semibold">Welcome to LuffyFlow</h1>
        <p className="mb-6 mt-2 text-sm text-foreground/70">
          Log in to manage prompt automation and saved outputs.
        </p>
        {forgotMode ? (
          <ForgotPasswordForm onBack={() => setForgotMode(false)} />
        ) : (
          <LoginForm
            onSuccess={() => navigate(returnPath, { replace: true })}
            onForgotPassword={() => setForgotMode(true)}
          />
        )}
        <p className="mt-6 text-center text-sm">
          Need an account?{" "}
          <Link className="text-primary underline" to="/signup">
            Sign up
          </Link>
        </p>
      </section>
    </main>
  )
}

/** Only internal absolute paths are accepted as post-login destinations. */
const readReturnPath = (state: unknown): string => {
  if (typeof state !== "object" || state === null || !("from" in state)) return "/"
  const from = state.from
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/"
}
