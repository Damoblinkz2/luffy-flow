import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import Popup from "~/popup"

vi.mock("~/storage/indexed-db/database", () => ({
  openLuffyflowDatabase: vi.fn(() => Promise.resolve({ close: vi.fn() })),
}))

describe("toolbar popup", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => true),
      })),
    )
  })

  it("renders a usable signed-out surface from the production entry point", async () => {
    render(<Popup />)

    expect(screen.getByRole("heading", { name: "LuffyFlow" })).toBeInTheDocument()
    expect(await screen.findByText("Welcome to LuffyFlow")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled()
    expect(screen.queryByText("Popup could not render")).not.toBeInTheDocument()
  })
})
