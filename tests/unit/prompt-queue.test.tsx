import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { PromptQueue } from "~/components/prompts"
import type { QueueWorkspace } from "~/hooks/useQueueWorkspace"

/** The queue error offers a concrete login route rather than leaving the user at a dead end. */
describe("PromptQueue", () => {
  it("opens the login dashboard when queue automation requires authentication", async () => {
    const workspace: QueueWorkspace = {
      queue: null,
      prompts: [],
      loading: false,
      busy: false,
      error: "Log in to LuffyFlow before changing or starting a queue.",
      authenticationRequired: true,
      refresh: vi.fn(() => Promise.resolve()),
      addDrafts: vi.fn(() => Promise.resolve()),
      start: vi.fn(() => Promise.resolve()),
      pause: vi.fn(() => Promise.resolve()),
      resume: vi.fn(() => Promise.resolve()),
      stop: vi.fn(() => Promise.resolve()),
      editPrompt: vi.fn(() => Promise.resolve()),
      removePrompt: vi.fn(() => Promise.resolve()),
      movePrompt: vi.fn(() => Promise.resolve()),
      retryPrompt: vi.fn(() => Promise.resolve()),
      skipPrompt: vi.fn(() => Promise.resolve()),
      clearError: vi.fn(),
    }
    const user = userEvent.setup()

    render(
      <PromptQueue workspace={workspace} activePlatform={{ loading: false, supported: false }} />,
    )
    await user.click(screen.getByRole("button", { name: "Open login" }))

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://luffyflow-test-extension/tabs/dashboard.html#/login",
    })
  })
})
