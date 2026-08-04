import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AuthProvider } from "~/components/auth/AuthProvider"
import { LoginForm } from "~/components/auth/LoginForm"
import { DEMO_ACCOUNT } from "~/constants"
import type { AuthSession } from "~/schemas"
import type { AuthService } from "~/services/auth/auth-service"
import { createAuthStore } from "~/stores/auth-store"

import { fixedNow, ids } from "../helpers/fixtures"

describe("LoginForm", () => {
  it("fills the demo credentials and submits them through the auth store", async () => {
    const session: AuthSession = {
      user: {
        id: ids.user,
        email: DEMO_ACCOUNT.email,
        displayName: "Demo",
        createdAt: fixedNow.toISOString(),
        updatedAt: fixedNow.toISOString(),
      },
      tokens: {
        accessToken: "access-token-that-is-long-enough",
        refreshToken: "refresh-token-that-is-long-enough",
        expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
      },
    }
    const login = vi.fn(() => Promise.resolve(session))
    const service = {
      restoreSession: vi.fn(() => Promise.resolve(null)),
      login,
    } as unknown as AuthService
    const onSuccess = vi.fn()
    const user = userEvent.setup()

    render(
      <AuthProvider store={createAuthStore(service)}>
        <LoginForm onSuccess={onSuccess} />
      </AuthProvider>,
    )
    await user.click(screen.getByRole("button", { name: "Use demo account" }))
    await user.click(screen.getByRole("button", { name: "Log in" }))

    expect(login).toHaveBeenCalledWith(DEMO_ACCOUNT)
    expect(onSuccess).toHaveBeenCalledOnce()
  })
})
