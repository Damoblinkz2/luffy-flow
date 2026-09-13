import { NavLink, Outlet } from "react-router-dom"

import { useAuthStore } from "~/components/auth/AuthProvider"
import { BrandLogo, Button } from "~/components/common"

const NAVIGATION = [
  ["/", "Overview"],
  ["/history", "Prompt history"],
  ["/outputs", "Output library"],
  ["/tokens", "Tokens"],
  ["/settings", "Settings"],
  ["/account", "Account"],
] as const

/** Dashboard navigation remains hash-based so extension routes never require a web server. */
export const DashboardLayout = () => {
  const session = useAuthStore((state) => state.session)
  const logout = useAuthStore((state) => state.logout)
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b bg-surface p-4 md:min-h-screen md:border-b-0 md:border-r">
        <div className="mb-5">
          <BrandLogo className="text-xl text-primary" />
          <p className="text-xs text-foreground/60">Prompt automation workspace</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Dashboard sections">
          {NAVIGATION.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-foreground/5"}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-5 hidden border-t pt-4 md:block">
          <p className="truncate text-sm font-medium">{session?.user.displayName}</p>
          <p className="truncate text-xs text-foreground/60">{session?.user.email}</p>
          <Button className="mt-3 w-full" variant="secondary" onClick={() => void logout()}>
            Log out
          </Button>
        </div>
      </aside>
      <main className="min-w-0 p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
