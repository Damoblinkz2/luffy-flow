import type { EntityId, SupportedPlatform } from "~/schemas/common"
import type { AdapterErrorCode, AdapterHealth, DetectedOutput, PageState } from "~/schemas/adapter"

/** Adapter failures stay typed and actionable without throwing page DOM details across runtimes. */
export type AdapterResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: {
        code: AdapterErrorCode
        message: string
        recoverable: boolean
        retryAfterMs?: number
        selectorKey?: string
        diagnostics?: Record<string, unknown>
      }
    }

/** Submission context makes output deduplication and timeouts explicit per queue item. */
export interface SubmitPromptContext {
  promptId: EntityId
  text: string
  previousOutputFingerprints: string[]
  generationStartTimeoutMs: number
  generationCompleteTimeoutMs: number
}

/** Platform adapters own all page-specific selectors and visible-interface automation. */
export interface PlatformAdapter {
  readonly id: SupportedPlatform
  readonly displayName: string
  readonly version: string
  /** True only when a platform creates a conversation URL while an accepted response streams. */
  readonly allowsGenerationRouteChange?: boolean

  isSupportedUrl(url: URL): boolean
  detectPageState(signal: AbortSignal): Promise<AdapterResult<PageState>>
  findPromptInput(signal: AbortSignal): Promise<AdapterResult<HTMLElement>>
  setPromptText(
    input: HTMLElement,
    prompt: string,
    signal: AbortSignal,
  ): Promise<AdapterResult<void>>
  submitPrompt(signal: AbortSignal): Promise<AdapterResult<void>>
  waitForGenerationStart(
    context: SubmitPromptContext,
    signal: AbortSignal,
  ): Promise<AdapterResult<void>>
  waitForGenerationComplete(
    context: SubmitPromptContext,
    signal: AbortSignal,
  ): Promise<AdapterResult<DetectedOutput>>
  extractLatestOutput(
    context: SubmitPromptContext,
    signal: AbortSignal,
  ): Promise<AdapterResult<DetectedOutput>>
  cancelGeneration?(signal: AbortSignal): Promise<AdapterResult<void>>
  getHealth(signal: AbortSignal): Promise<AdapterHealth>
  dispose(): void
}

/** Selector candidates carry confidence and maintenance notes alongside the query. */
export interface SelectorCandidate {
  query: string
  kind: "css"
  confidence: "verified" | "provisional" | "fallback"
  note: string
}

export interface AdapterSelectorConfig {
  promptInput: SelectorCandidate[]
  submitButton: SelectorCandidate[]
  stopButton: SelectorCandidate[]
  generationBusyIndicator: SelectorCandidate[]
  outputContainer: SelectorCandidate[]
  authenticationRequiredIndicator: SelectorCandidate[]
  rateLimitIndicator: SelectorCandidate[]
  serviceUnavailableIndicator: SelectorCandidate[]
}

/** Visible text signals supplement selectors when a platform exposes only a status message. */
export interface AdapterTextSignals {
  authenticationRequired: readonly string[]
  rateLimited: readonly string[]
  serviceUnavailable: readonly string[]
}
