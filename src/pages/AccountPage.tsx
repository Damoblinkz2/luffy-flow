import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { useAuthStore } from "~/components/auth/AuthProvider"
import { Badge, Button } from "~/components/common"

/** Account page identifies mock authentication clearly and keeps deletion as a non-destructive placeholder. */
export const AccountPage = () => {
  const session = useAuthStore((state) => state.session)
  const logout = useAuthStore((state) => state.logout)
  const [notice, setNotice] = useState<string | null>(null)
  const navigate = useNavigate()
  if (session === null) return null
  return (
    <section className="space-y-6" aria-labelledby="account-title">
      <div>
        <h1 id="account-title" className="text-2xl font-semibold">
          Account
        </h1>
        <p className="af-muted">Development mock identity and local session controls.</p>
      </div>
      <article className="af-card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Profile</h2>
          <Badge tone="warning">Mock account</Badge>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-foreground/60">Name</dt>
          <dd>{session.user.displayName}</dd>
          <dt className="text-foreground/60">Email</dt>
          <dd>{session.user.email}</dd>
          <dt className="text-foreground/60">User ID</dt>
          <dd className="break-all font-mono text-xs">{session.user.id}</dd>
          <dt className="text-foreground/60">Session expires</dt>
          <dd>{new Date(session.tokens.expiresAt).toLocaleString()}</dd>
        </dl>
      </article>
      <article className="af-card">
        <h2 className="text-lg font-semibold">Session</h2>
        <p className="af-muted my-2">
          Logging out removes local mock tokens but retains your local prompt and output records.
        </p>
        <Button onClick={() => void logout().then(() => navigate("/login"))}>Log out</Button>
      </article>
      <article className="af-card border-danger/40">
        <h2 className="text-lg font-semibold">Delete account</h2>
        <p className="af-muted my-2">
          A production backend would require reauthentication and server-side deletion. This mock
          placeholder does not pretend to delete a remote account.
        </p>
        <Button
          variant="danger"
          onClick={() =>
            setNotice(
              "Account deletion is a placeholder in mock mode. Use Settings → Clear all local data to remove browser data.",
            )
          }
        >
          Request account deletion
        </Button>
        {notice === null ? null : (
          <p className="mt-3 text-sm" role="status">
            {notice}
          </p>
        )}
      </article>
    </section>
  )
}
