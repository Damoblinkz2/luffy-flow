import { useNavigate } from "react-router-dom"

import { useAuthStore } from "~/components/auth/AuthProvider"
import { Badge, Button } from "~/components/common"

/** Account details come from the authenticated backend profile and expose local logout controls. */
export const AccountPage = () => {
  const session = useAuthStore((state) => state.session)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()
  if (session === null) return null

  return (
    <section className="space-y-6" aria-labelledby="account-title">
      <div>
        <h1 id="account-title" className="text-2xl font-semibold">
          Account
        </h1>
        <p className="af-muted">Your authenticated LuffyFlow API profile and session.</p>
      </div>
      <article className="af-card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Profile</h2>
          <Badge tone="success">Verified session</Badge>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-foreground/60">Name</dt>
          <dd>{session.user.displayName}</dd>
          <dt className="text-foreground/60">Email</dt>
          <dd>{session.user.email}</dd>
          <dt className="text-foreground/60">User ID</dt>
          <dd className="break-all font-mono text-xs">{session.user.id}</dd>
          <dt className="text-foreground/60">Access token expires</dt>
          <dd>{new Date(session.tokens.expiresAt).toLocaleString()}</dd>
        </dl>
      </article>
      <article className="af-card">
        <h2 className="text-lg font-semibold">Session</h2>
        <p className="af-muted my-2">
          Logging out revokes the backend refresh session and removes local authentication tokens.
          Your locally saved prompts and outputs remain available.
        </p>
        <Button onClick={() => void logout().then(() => navigate("/login"))}>Log out</Button>
      </article>
    </section>
  )
}
