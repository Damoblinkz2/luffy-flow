import type { ReactNode } from "react"
import { Navigate, Outlet, useLocation } from "react-router-dom"

import { useAuthStore } from "~/components/auth/AuthProvider"

/** Nested and element-wrapping route styles are both supported. */
export interface ProtectedRouteProps {
  children?: ReactNode
}

/** Protected routes wait for restoration and preserve the requested route for login return. */
export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const status = useAuthStore((state) => state.status)
  const location = useLocation()

  if (status === "idle" || status === "loading") {
    return <p role="status">Restoring your AutoFlow session...</p>
  }
  if (status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children ?? <Outlet />
}
