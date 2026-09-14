import { describe, expect, it, vi } from "vitest"

import type {
  AdapterSelectorConfig,
  AdapterTextSignals,
  PlatformAdapter,
} from "~/adapters/contracts"
import { GeminiAdapter } from "~/adapters/gemini/GeminiAdapter"
import { GoogleFlowAdapter } from "~/adapters/google-flow/GoogleFlowAdapter"
import { googleFlowSelectors } from "~/adapters/google-flow/selectors"
import { GrokAdapter } from "~/adapters/grok/GrokAdapter"
import { MetaAiAdapter } from "~/adapters/meta-ai/MetaAiAdapter"
import { PlatformAdapterRegistry } from "~/adapters/registry"
import { ObservedPlatformAdapter } from "~/adapters/shared/ObservedPlatformAdapter"
import { queryAll, queryFirst } from "~/adapters/shared/dom-query"
import { waitForDomStability } from "~/adapters/shared/dom-stability"
import { detectMediaOutput, detectTextOutput } from "~/adapters/shared/output-extraction"
import type { DetectedOutput } from "~/schemas"

describe("supported platform URLs", () => {
  it.each([
    [
      new GoogleFlowAdapter(),
      "https://flow.google.com/projects/example-session",
      "https://flow.google.com.evil.example/projects/example-session",
    ],
    [new GeminiAdapter(), "https://gemini.google.com/app/abc", "http://gemini.google.com/app"],
    [new GrokAdapter(), "https://x.com/i/grok", "https://x.com/home"],
    [new MetaAiAdapter(), "https://meta.ai/", "https://meta.ai.evil.example/"],
  ])("allows only explicit official routes", (adapter, allowed, denied) => {
    expect(adapter.isSupportedUrl(new URL(allowed))).toBe(true)
    expect(adapter.isSupportedUrl(new URL(denied))).toBe(false)
    adapter.dispose()
  })

  it("recognizes the current localized Google Labs Flow route", () => {
    const adapter = new GoogleFlowAdapter()
    expect(adapter.isSupportedUrl(new URL("https://flow.google/projects/legacy-session"))).toBe(
      true,
    )
    expect(adapter.isSupportedUrl(new URL("https://www.labs.google/fx/ko/tools/flow"))).toBe(true)
    expect(adapter.isSupportedUrl(new URL("https://www.labs.google/fx/ko/tools/other"))).toBe(false)
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
  it("treats an interactive workspace as ready while its prompt editor is still being discovered", async () => {
    const adapter = new ReadinessProbeAdapter()

    await expect(adapter.detectPageState(new AbortController().signal)).resolves.toMatchObject({
      ok: true,
      value: { readiness: "ready" },
    })
    adapter.dispose()
  })

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

  it("prioritizes Google Flow's standard generation prompt textarea", () => {
    document.body.innerHTML = '<textarea id="PINHOLE_TEXT_AREA_ELEMENT_ID"></textarea>'

    expect(queryFirst(document, googleFlowSelectors.promptInput)?.element).toBe(
      document.querySelector("#PINHOLE_TEXT_AREA_ELEMENT_ID"),
    )
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

    const signedAudioRoot = document.createElement("section")
    signedAudioRoot.innerHTML =
      '<audio src="https://cdn.example.test/generated?signature=short-lived"><source type="audio/wav"></audio>'
    expect(detectMediaOutput(signedAudioRoot)).toMatchObject({
      type: "audio",
      fileExtension: ".wav",
      mimeType: "audio/wav",
    })

    const generatedImageWithCaption = document.createElement("article")
    generatedImageWithCaption.innerHTML =
      '<p>Your image is ready.</p><img src="https://cdn.example.test/scene.webp" aria-label="Generated scene">'
    expect(detectTextOutput(generatedImageWithCaption)).toMatchObject({
      type: "image",
      sourceUrl: "https://cdn.example.test/scene.webp",
      fileExtension: ".webp",
    })

    const firstRepeatedAnswer = document.createElement("article")
    const secondRepeatedAnswer = document.createElement("article")
    firstRepeatedAnswer.textContent = "An identical generated answer"
    secondRepeatedAnswer.textContent = "An identical generated answer"
    expect(detectTextOutput(firstRepeatedAnswer)?.fingerprintSource).not.toBe(
      detectTextOutput(secondRepeatedAnswer)?.fingerprintSource,
    )
  })

  it("ignores ongoing response-control attribute changes while waiting for generated content", async () => {
    vi.useFakeTimers()
    try {
      const response = document.createElement("article")
      document.body.append(response)
      const wait = waitForDomStability(response, 500, 5_000, new AbortController().signal)

      // Gemini updates button ARIA attributes after a response is complete. Those controls are not
      // generated content and must not prevent the queue from recording the finished prompt.
      response.setAttribute("data-live-control-state", "updated")
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(500)

      await expect(wait).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})

/** A selector-free adapter isolates generic readiness behavior from live platform DOM changes. */
class ReadinessProbeAdapter extends ObservedPlatformAdapter {
  override readonly id = "gemini" as const
  override readonly displayName = "Readiness probe"
  override readonly version = "test"
  protected override readonly selectors: AdapterSelectorConfig = {
    promptInput: [],
    submitButton: [],
    stopButton: [],
    generationBusyIndicator: [],
    outputContainer: [],
    authenticationRequiredIndicator: [],
    rateLimitIndicator: [],
    serviceUnavailableIndicator: [],
  }
  protected override readonly textSignals: AdapterTextSignals = {
    authenticationRequired: [],
    rateLimited: [],
    serviceUnavailable: [],
  }

  override isSupportedUrl(): boolean {
    return true
  }

  protected override detectOutput(): DetectedOutput | null {
    return null
  }
}
