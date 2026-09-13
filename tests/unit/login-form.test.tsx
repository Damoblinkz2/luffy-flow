import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AuthProvider } from "~/components/auth/AuthProvider"
import { LoginForm } from "~/components/auth/LoginForm"
import type { AuthSession } from "~/schemas"
import type { AuthService } from "~/services/auth/auth-service"
import { createAuthStore } from "~/stores/auth-store"

import { fixedNow, ids } from "../helpers/fixtures"

describe("LoginForm", () => {
  it("submits user-entered credentials through the auth store", async () => {
    const credentials = { email: "person@example.com", password: "Secure-Password1!" }
    const session: AuthSession = {
      user: {
        id: ids.user,
        email: credentials.email,
        displayName: "Person",
        role: "user",
        status: "active",
        emailVerified: true,
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
    await user.type(screen.getByLabelText("Email address"), credentials.email)
    await user.type(screen.getByLabelText("Password"), credentials.password)
    await user.click(screen.getByRole("button", { name: "Log in" }))

    expect(login).toHaveBeenCalledWith(credentials)
    expect(onSuccess).toHaveBeenCalledOnce()
  })
})
