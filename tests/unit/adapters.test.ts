import { describe, expect, it, vi } from "vitest"

import type { PlatformAdapter } from "~/adapters/contracts"
import { GeminiAdapter } from "~/adapters/gemini/GeminiAdapter"
import { GoogleFlowAdapter } from "~/adapters/google-flow/GoogleFlowAdapter"
import { GrokAdapter } from "~/adapters/grok/GrokAdapter"
import { PlatformAdapterRegistry } from "~/adapters/registry"
import { queryAll, queryFirst } from "~/adapters/shared/dom-query"
import { detectMediaOutput, detectTextOutput } from "~/adapters/shared/output-extraction"

describe("supported platform URLs", () => {
  it.each([
    [new GoogleFlowAdapter(), "https://flow.google/", "https://flow.google.evil.example/"],
    [new GeminiAdapter(), "https://gemini.google.com/app/abc", "http://gemini.google.com/app"],
    [new GrokAdapter(), "https://x.com/i/grok", "https://x.com/home"],
  ])("allows only explicit official routes", (adapter, allowed, denied) => {
    expect(adapter.isSupportedUrl(new URL(allowed))).toBe(true)
    expect(adapter.isSupportedUrl(new URL(denied))).toBe(false)
    adapter.dispose()
  })

  it("detects registered adapters and disposes them exactly once", () => {
    const registry = new PlatformAdapterRegistry()
    const dispose = vi.fn()
    const adapter = {
      id: "gemini",
      displayName: "Gemini test",
      version: "1",
      isSupportedUrl: (url: URL) => url.hostname === "gemini.google.com",
      detectPageState: vi.fn(),
      findPromptInput: vi.fn(),
      setPromptText: vi.fn(),
      submitPrompt: vi.fn(),
      waitForGenerationStart: vi.fn(),
      waitForGenerationComplete: vi.fn(),
      extractLatestOutput: vi.fn(),
      getHealth: vi.fn(),
      dispose,
    } as unknown as PlatformAdapter
    const unregister = registry.register(adapter)

    expect(registry.detect(new URL("https://gemini.google.com/app"))).toBe(adapter)
    expect(() => registry.register(adapter)).toThrow(
      expect.objectContaining({ code: "ADAPTER_DUPLICATE" }),
    )
    unregister()
    expect(dispose).toHaveBeenCalledOnce()
  })
})

describe("adapter DOM utilities", () => {
  it("uses selector fallbacks and de-duplicates matching nodes", () => {
    document.body.innerHTML = '<div class="answer" data-testid="answer">Done</div>'
    const candidates = [
      { query: "[broken", kind: "css" as const, confidence: "fallback" as const, note: "invalid" },
      { query: ".answer", kind: "css" as const, confidence: "provisional" as const, note: "class" },
      {
        query: "[data-testid=answer]",
        kind: "css" as const,
        confidence: "fallback" as const,
        note: "test id",
      },
    ]

    expect(queryFirst(document, candidates)?.candidateIndex).toBe(1)
    expect(queryAll(document, candidates)).toHaveLength(1)
  })

  it("extracts bounded text and safe HTTP media metadata", () => {
    const textRoot = document.createElement("article")
    textRoot.dataset.messageId = "response-1"
    textRoot.textContent = "  A generated   response  "
    expect(detectTextOutput(textRoot)).toMatchObject({
      type: "text",
      textContent: "A generated response",
      platformOutputId: "response-1",
    })

    const mediaRoot = document.createElement("section")
    mediaRoot.innerHTML =
      '<img src="https://cdn.example.test/image.png" aria-label="Generated image">'
    expect(detectMediaOutput(mediaRoot)).toMatchObject({
      type: "image",
      sourceUrl: "https://cdn.example.test/image.png",
      fileExtension: ".png",
      mimeType: "image/png",
    })
  })
})
