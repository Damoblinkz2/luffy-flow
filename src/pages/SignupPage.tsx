import { Link, useNavigate } from "react-router-dom"

import { SignupForm } from "~/components/auth/SignupForm"

/** Sign-up page clearly scopes account persistence to the development mock service. */
export const SignupPage = () => {
  const navigate = useNavigate()

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-6">
      <section className="w-full rounded-2xl border border-border bg-surface p-6 shadow-panel">
        <h1 className="text-2xl font-semibold">Create your AutoFlow account</h1>
        <p className="mb-6 mt-2 text-sm text-foreground/70">
          This account is stored by the development-only mock service.
        </p>
        <SignupForm onSuccess={() => navigate("/", { replace: true })} />
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
