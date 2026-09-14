import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AuthProvider, useAuthStore } from "~/components/auth/AuthProvider"
import type { AuthSession } from "~/schemas"
import type { AuthService } from "~/services/auth/auth-service"
import { STORAGE_KEYS } from "~/storage/storage-keys"
import { createAuthStore } from "~/stores/auth-store"

import { chromeControls } from "../helpers/chrome-mock"
import { fixedNow, ids } from "../helpers/fixtures"

/** Prints the current auth state so the provider's cross-document synchronization is observable. */
const AuthStatus = () => <output>{useAuthStore((state) => state.status)}</output>

describe("AuthProvider", () => {
  it("updates an open extension surface when another document writes the session", async () => {
    const session: AuthSession = {
      user: {
        id: ids.user,
        email: "person@example.com",
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
    const synchronizeSession = vi.fn(() => Promise.resolve(session))
    const service = {
      restoreSession: vi.fn(() => Promise.resolve(null)),
      synchronizeSession,
    } as unknown as AuthService

    render(
      <AuthProvider store={createAuthStore(service)}>
        <AuthStatus />
      </AuthProvider>,
    )
    await screen.findByText("unauthenticated")

    chromeControls().emitStorageChanged({
      [STORAGE_KEYS.authentication]: { newValue: { schemaVersion: 1 } },
    })

    await waitFor(() => expect(screen.getByText("authenticated")).toBeInTheDocument())
    expect(synchronizeSession).toHaveBeenCalledOnce()
  })
})
