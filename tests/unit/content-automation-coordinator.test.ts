import { describe, expect, it, vi } from "vitest"

import type { PlatformAdapter } from "~/adapters/contracts"
import { PlatformAdapterRegistry } from "~/adapters/registry"
import { ContentAutomationCoordinator } from "~/content-runtime/ContentAutomationCoordinator"
import { createMessage } from "~/messaging/envelope"

import { ids } from "../helpers/fixtures"

/** Exercises safe same-platform URL changes that occur while Gemini creates a new conversation. */
describe("ContentAutomationCoordinator", () => {
  it("does not cancel Gemini when its supported conversation route changes during generation", async () => {
    let generationSignal: AbortSignal | undefined
    type GenerationStartResult = Awaited<ReturnType<PlatformAdapter["waitForGenerationStart"]>>
    let resolveGenerationStart: ((result: GenerationStartResult) => void) | undefined
    const completedOutput = {
      type: "text" as const,
      textContent: "Completed response",
      metadata: {},
      fingerprintSource: "completed-response-fingerprint",
      detectedAt: new Date().toISOString(),
    }
    const adapter: PlatformAdapter = {
      id: "gemini",
      displayName: "Google Gemini",
      version: "test-gemini-v2",
      allowsGenerationRouteChange: true,
      // JSDOM owns the initial luffyflow.test document; the second half mirrors Gemini's
      // supported new-conversation route that would be observed in a real browser tab.
      isSupportedUrl: (url) =>
        url.hostname === "luffyflow.test" ||
        (url.hostname === "gemini.google.com" && url.pathname.startsWith("/app")),
      detectPageState: () =>
        Promise.resolve({
          ok: true as const,
          value: {
            readiness: "ready" as const,
            url: "https://gemini.google.com/app",
            routeKey: "gemini.google.com/app",
            generationInProgress: false,
            detectedAt: new Date().toISOString(),
          },
        }),
      findPromptInput: () =>
        Promise.resolve({ ok: true as const, value: document.createElement("div") }),
      setPromptText: () => Promise.resolve({ ok: true as const, value: undefined }),
      submitPrompt: () => Promise.resolve({ ok: true as const, value: undefined }),
      waitForGenerationStart: (_context, signal) =>
        new Promise<GenerationStartResult>((resolve) => {
          generationSignal = signal
          resolveGenerationStart = resolve
        }),
      waitForGenerationComplete: () =>
        Promise.resolve({ ok: true as const, value: completedOutput }),
      extractLatestOutput: () => Promise.resolve({ ok: true as const, value: completedOutput }),
      getHealth: () =>
        Promise.resolve({
          adapterId: "gemini" as const,
          adapterVersion: "test-gemini-v2",
          status: "healthy" as const,
          checkedAt: new Date().toISOString(),
          selectorChecks: [],
          warnings: [],
        }),
      dispose: vi.fn(),
    }
    const registry = new PlatformAdapterRegistry()
    registry.register(adapter)
    const coordinator = new ContentAutomationCoordinator(registry)
    const submission = coordinator.submit(
      createMessage({
        kind: "prompt/submit",
        source: "background",
        target: "content",
        payload: {
          queueId: ids.queue,
          promptId: ids.prompt,
          commandId: "10000000-0000-4000-8000-000000000006",
          promptText: "Create a completed response",
          adapterId: "gemini",
          adapterVersion: "test-gemini-v2",
          tabId: 1,
          leaseGeneration: 1,
          previousOutputFingerprints: [],
          generationStartTimeoutMs: 30_000,
          generationCompleteTimeoutMs: 600_000,
        },
      }),
    )

    await vi.waitFor(() => expect(generationSignal).toBeDefined())
    coordinator.handleNavigation(new URL("https://gemini.google.com/app/conversation-123"))
    expect(generationSignal?.aborted).toBe(false)

    resolveGenerationStart?.({ ok: true, value: undefined })
    await expect(submission).resolves.toEqual(completedOutput)
    coordinator.dispose()
  })
})
