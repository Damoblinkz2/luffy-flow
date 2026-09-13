import { Link, useNavigate } from "react-router-dom"

import { SignupForm } from "~/components/auth/SignupForm"
import { BrandLogo } from "~/components/common"

/** Sign-up page clearly scopes account persistence. */
export const SignupPage = () => {
  const navigate = useNavigate()

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-6">
      <section className="w-full rounded-2xl border border-border bg-surface p-6 shadow-panel">
        <BrandLogo className="mb-6 text-xl text-primary" />
        <h1 className="text-2xl font-semibold">Create your LuffyFlow account</h1>
        <p className="mb-6 mt-2 text-sm text-foreground/70">
          Create an account, then verify your email address before logging in.
        </p>
        <SignupForm onSuccess={() => navigate("/login", { replace: true })} />
        <p className="mt-6 text-center text-sm">
          Already registered?{" "}
          <Link className="text-primary underline" to="/login">
            Log in
          </Link>
        </p>
      </section>
    </main>
  )
}
