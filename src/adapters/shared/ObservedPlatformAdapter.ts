import type {
  AdapterResult,
  AdapterSelectorConfig,
  AdapterTextSignals,
  PlatformAdapter,
  SubmitPromptContext,
} from "~/adapters/contracts"
import { clickVisibleControl, setVisiblePromptValue } from "~/adapters/shared/dom-events"
import { queryAll, queryFirst, waitForCondition, waitForElement } from "~/adapters/shared/dom-query"
import { waitForDomStability } from "~/adapters/shared/dom-stability"
import type {
  AdapterErrorCode,
  AdapterHealth,
  DetectedOutput,
  PageReadiness,
  PageState,
  SupportedPlatform,
} from "~/schemas"

interface OutputMatch {
  element: HTMLElement
  detected: DetectedOutput
}

interface AdapterFaultOptions {
  code: AdapterErrorCode
  message: string
  recoverable?: boolean
  retryAfterMs?: number
  selectorKey?: string
}

// A completed response must remain quiet for this window before a queue can advance.
// This prevents a newly-created streaming response node from being captured as final output.
const GENERATION_COMPLETION_QUIET_MS = 2_500

/** Internal faults retain typed adapter codes without leaking raw DOM or prompt content. */
class AdapterFault extends Error {
  readonly code: AdapterErrorCode
  readonly recoverable: boolean
  readonly retryAfterMs?: number
  readonly selectorKey?: string

  /** Stores a machine-readable fault while retaining safe diagnostics for health reporting. */
  constructor(options: AdapterFaultOptions) {
    super(options.message)
    this.name = "AdapterFault"
    this.code = options.code
    this.recoverable = options.recoverable ?? true
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs
    if (options.selectorKey !== undefined) this.selectorKey = options.selectorKey
  }
}

/** Shared behavior observes only the visible authenticated UI; platforms supply URLs, selectors, and extraction. */
export abstract class ObservedPlatformAdapter implements PlatformAdapter {
  abstract readonly id: SupportedPlatform
  abstract readonly displayName: string
  abstract readonly version: string
  /** Individual adapters opt in only for documented, same-platform conversation URL changes. */
  readonly allowsGenerationRouteChange: boolean = false
  protected abstract readonly selectors: AdapterSelectorConfig
  protected abstract readonly textSignals: AdapterTextSignals

  private readonly lifecycleController = new AbortController()
  private baselineOutputSources = new Set<string>()
  private submissionRouteKey: string | null = null
  private statusTextCache: { checkedAt: number; value: string } | null = null

  /** Lets each platform define the exact safe routes where its DOM assumptions apply. */
  abstract isSupportedUrl(url: URL): boolean

  /** Lets each platform translate one response node into the shared output contract. */
  protected abstract detectOutput(element: HTMLElement): DetectedOutput | null

  /** Inspects authentication, throttling, generation, and input signals without changing the page. */
  detectPageState(signal: AbortSignal): Promise<AdapterResult<PageState>> {
    return this.run(
      signal,
      "page_not_ready",
      "The platform page state could not be detected.",
      () => {
        const url = this.currentUrl()
        const generationInProgress = this.hasActiveGenerationIndicator()
        const readiness = this.readiness(url, generationInProgress)
        return {
          readiness,
          url: url.href,
          routeKey: routeKey(url),
          generationInProgress,
          detectedAt: new Date().toISOString(),
        }
      },
    )
  }

  /** Waits for the first visible prompt editor and reports selector diagnostics on failure. */
  findPromptInput(signal: AbortSignal): Promise<AdapterResult<HTMLElement>> {
    return this.run(
      signal,
      "selector_not_found",
      "The platform prompt input was not found.",
      async (linked) => {
        this.assertSupportedRoute()
        const match = await waitForElement<HTMLElement>({
          root: document,
          candidates: this.selectors.promptInput,
          timeoutMs: 10_000,
          signal: linked,
          predicate: isVisible,
        })
        return match.element
      },
      "promptInput",
    )
  }

  /** Updates the host editor through browser events so its framework notices the change. */
  setPromptText(
    input: HTMLElement,
    prompt: string,
    signal: AbortSignal,
  ): Promise<AdapterResult<void>> {
    return this.run(
      signal,
      "input_unavailable",
      "The platform prompt input is unavailable.",
      () => {
        this.assertSupportedRoute()
        if (prompt.trim().length === 0) {
          throw new AdapterFault({
            code: "input_unavailable",
            message: "An empty prompt cannot be submitted.",
            recoverable: false,
          })
        }
        setVisiblePromptValue(input, prompt)
      },
      "promptInput",
    )
  }

  /** Clicks an enabled submit control only after confirming route and blocking states. */
  submitPrompt(signal: AbortSignal): Promise<AdapterResult<void>> {
    return this.run(
      signal,
      "submission_failed",
      "The platform prompt could not be submitted.",
      async (linked) => {
        const url = this.assertSupportedRoute()
        this.assertNoBlockingStatus()
        if (this.hasActiveGenerationIndicator()) {
          throw new AdapterFault({
            code: "generation_in_progress",
            message: "A platform generation is already in progress.",
          })
        }

        // Capture the pre-submit output identity so an existing response cannot be mistaken for a new one.
        this.baselineOutputSources = new Set(
          this.outputMatches().map(({ detected }) => detected.fingerprintSource),
        )
        this.submissionRouteKey = routeKey(url)
        const match = await waitForElement<HTMLElement>({
          root: document,
          candidates: this.selectors.submitButton,
          timeoutMs: 10_000,
          signal: linked,
          predicate: isVisibleAndEnabled,
        })
        clickVisibleControl(match.element)
      },
      "submitButton",
    )
  }

  /** Observes busy and output signals until the platform proves generation has begun. */
  waitForGenerationStart(
    context: SubmitPromptContext,
    signal: AbortSignal,
  ): Promise<AdapterResult<void>> {
    return this.run(
      signal,
      "generation_start_timeout",
      "The platform did not begin generating within the configured timeout.",
      async (linked) => {
        await waitForCondition({
          root: document,
          timeoutMs: context.generationStartTimeoutMs,
          signal: linked,
          evaluate: () => {
            this.assertSubmissionRoute()
            this.assertNoBlockingStatus()
            if (this.hasActiveGenerationIndicator()) return true
            return this.latestNewOutput() === null ? null : true
          },
        })
      },
    )
  }

  /** Waits for busy indicators to settle and an unchanged, previously unseen output to appear. */
  waitForGenerationComplete(
    context: SubmitPromptContext,
    signal: AbortSignal,
  ): Promise<AdapterResult<DetectedOutput>> {
    return this.run(
      signal,
      "generation_complete_timeout",
      "The platform generation did not complete within the configured timeout.",
      async (linked) => {
        const deadline = Date.now() + context.generationCompleteTimeoutMs
        while (true) {
          const completed = await waitForCondition<OutputMatch>({
            root: document,
            timeoutMs: remainingGenerationTime(deadline),
            signal: linked,
            evaluate: () => {
              this.assertSubmissionRoute()
              this.assertNoBlockingStatus()
              if (this.hasActiveGenerationIndicator()) return null
              return this.latestNewOutput()
            },
          })

          // Streaming UIs often create an answer node before its content is finished. Do not
          // ignore an unstable DOM: stay with this command until the response is quiet, or fail
          // safely at the configured timeout so the queue cannot submit the next prompt early.
          await waitForDomStability(
            completed.element,
            GENERATION_COMPLETION_QUIET_MS,
            remainingGenerationTime(deadline),
            linked,
          )
          this.assertSubmissionRoute()
          this.assertNoBlockingStatus()
          if (this.hasActiveGenerationIndicator()) continue
          const latest = this.latestNewOutput()
          if (latest?.element === completed.element) return latest.detected
        }
      },
    )
  }

  /** Reads the newest currently detectable output without initiating generation. */
  extractLatestOutput(
    context: SubmitPromptContext,
    signal: AbortSignal,
  ): Promise<AdapterResult<DetectedOutput>> {
    void context
    return this.run(
      signal,
      "output_not_found",
      "No supported platform output was found.",
      () => {
        this.assertSupportedRoute()
        const output = this.latestNewOutput() ?? this.latestOutput()
        if (output === null) {
          throw new AdapterFault({
            code: "output_not_found",
            message: "No supported platform output was found.",
            selectorKey: "outputContainer",
          })
        }
        return output.detected
      },
      "outputContainer",
    )
  }

  /** Uses the host's stop control when available and reports unsupported cancellation safely. */
  cancelGeneration(signal: AbortSignal): Promise<AdapterResult<void>> {
    return this.run(
      signal,
      "submission_failed",
      "The active platform generation could not be cancelled.",
      async (linked) => {
        this.assertSupportedRoute()
        const match = await waitForElement<HTMLElement>({
          root: document,
          candidates: this.selectors.stopButton,
          timeoutMs: 2_500,
          signal: linked,
          predicate: isVisibleAndEnabled,
        })
        clickVisibleControl(match.element)
      },
      "stopButton",
    )
  }

  /** Returns selector presence and confidence diagnostics without including page content. */
  getHealth(signal: AbortSignal): Promise<AdapterHealth> {
    const linked = linkSignals(signal, this.lifecycleController.signal)
    try {
      throwIfAborted(linked.signal)
      const selectorChecks = selectorEntries(this.selectors).map(([key, candidates]) => {
        const match = queryFirst(document, candidates)
        return {
          key,
          found: match !== null,
          ...(match === null || match.candidateIndex === 0
            ? {}
            : { matchedFallbackIndex: match.candidateIndex }),
        }
      })
      const essential = new Set(["promptInput", "submitButton", "outputContainer"])
      const missingEssential = selectorChecks.filter(
        ({ key, found }) => essential.has(key) && !found,
      )
      const supported = this.isSupportedUrl(this.currentUrl())
      const warnings = this.selectorWarnings()
      if (!supported) warnings.push("The current URL is outside this adapter's strict allowlist.")
      for (const check of missingEssential) warnings.push(`No candidate matched ${check.key}.`)
      return Promise.resolve({
        adapterId: this.id,
        adapterVersion: this.version,
        status: !supported ? "unavailable" : missingEssential.length === 0 ? "healthy" : "degraded",
        checkedAt: new Date().toISOString(),
        selectorChecks,
        warnings,
      })
    } finally {
      linked.dispose()
    }
  }

  /** Disconnects lifecycle observation and invalidates subsequent work on this instance. */
  dispose(): void {
    this.lifecycleController.abort(
      new DOMException("The platform adapter was disposed.", "AbortError"),
    )
    this.baselineOutputSources.clear()
    this.submissionRouteKey = null
    this.statusTextCache = null
  }

  /** Reduces visible page signals to one readiness state ordered by operational priority. */
  private readiness(url: URL, generationInProgress: boolean): PageReadiness {
    if (!this.isSupportedUrl(url)) return "unsupported"
    if (this.hasStatus(this.selectors.rateLimitIndicator, this.textSignals.rateLimited)) {
      return "rate_limited"
    }
    if (
      this.hasStatus(
        this.selectors.serviceUnavailableIndicator,
        this.textSignals.serviceUnavailable,
      )
    ) {
      return "service_unavailable"
    }
    if (
      this.hasStatus(
        this.selectors.authenticationRequiredIndicator,
        this.textSignals.authenticationRequired,
      )
    ) {
      return "authentication_required"
    }
    if (generationInProgress) return "generation_in_progress"
    if (document.readyState === "loading" || document.body === null) return "loading"
    // Modern Flow workspaces render their editable prompt region after the shell becomes
    // interactive. The actual submit path waits for that control for up to ten seconds, so an
    // initially unfamiliar selector must not be misreported as a page that is still loading.
    return "ready"
  }

  /** Extracts normalized outputs from candidate containers and drops false-positive nodes. */
  private outputMatches(): OutputMatch[] {
    const matches = queryAll<HTMLElement>(document, this.selectors.outputContainer)
      .filter(({ element }) => isVisible(element))
      .map(({ element }) => ({ element, detected: this.detectOutput(element) }))
      .filter((match): match is OutputMatch => match.detected !== null)
    return matches.sort(({ element: left }, { element: right }) => {
      const relation = left.compareDocumentPosition(right)
      return relation & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    })
  }

  /** Returns the newest matching response according to document order. */
  private latestOutput(): OutputMatch | null {
    return this.outputMatches().at(-1) ?? null
  }

  /** Excludes sources captured before submission to avoid returning an older response. */
  private latestNewOutput(): OutputMatch | null {
    const outputs = this.outputMatches()
    return (
      outputs
        .filter(({ detected }) => !this.baselineOutputSources.has(detected.fingerprintSource))
        .at(-1) ?? null
    )
  }

  /** Tests whether any selector candidate resolves to a currently visible element. */
  private hasVisible(candidates: AdapterSelectorConfig[keyof AdapterSelectorConfig]): boolean {
    return queryAll<HTMLElement>(document, candidates).some(({ element }) => isVisible(element))
  }

  /** Treats visible but disabled historic Stop controls as inactive so later prompts can finish. */
  private hasActiveGenerationIndicator(): boolean {
    return queryAll<HTMLElement>(document, this.selectors.generationBusyIndicator).some(
      ({ element }) => isVisibleAndEnabled(element),
    )
  }

  /** Matches normalized visible status text against platform-specific phrases. */
  private hasStatus(
    candidates: AdapterSelectorConfig[keyof AdapterSelectorConfig],
    phrases: readonly string[],
  ): boolean {
    if (this.hasVisible(candidates)) return true
    const pageText = this.pageStatusText()
    return phrases.some((phrase) => pageText.includes(phrase.toLocaleLowerCase()))
  }

  /** Collects bounded status-region text used only for readiness classification. */
  private pageStatusText(): string {
    const now = Date.now()
    if (this.statusTextCache !== null && now - this.statusTextCache.checkedAt < 750) {
      return this.statusTextCache.value
    }
    const value = (document.body?.innerText ?? "").toLocaleLowerCase().slice(0, 200_000)
    this.statusTextCache = { checkedAt: now, value }
    return value
  }

  /** Converts host authentication and throttling signals into actionable adapter faults. */
  private assertNoBlockingStatus(): void {
    if (this.hasStatus(this.selectors.rateLimitIndicator, this.textSignals.rateLimited)) {
      throw new AdapterFault({
        code: "rate_limited",
        message: "The platform is rate limiting requests. LuffyFlow paused safely.",
        retryAfterMs: 60_000,
      })
    }
    if (
      this.hasStatus(
        this.selectors.serviceUnavailableIndicator,
        this.textSignals.serviceUnavailable,
      )
    ) {
      throw new AdapterFault({
        code: "service_unavailable",
        message: "The platform service is currently unavailable.",
      })
    }
  }

  /** Stops work if SPA navigation moved outside the adapter's allowed routes. */
  private assertSupportedRoute(): URL {
    const url = this.currentUrl()
    if (!this.isSupportedUrl(url)) {
      throw new AdapterFault({
        code: "navigation_changed",
        message: "The page navigated outside this adapter's supported routes.",
      })
    }
    return url
  }

  /** Ensures a multi-step submission remains on the exact route where it started. */
  private assertSubmissionRoute(): void {
    const url = this.assertSupportedRoute()
    if (this.submissionRouteKey !== null && routeKey(url) !== this.submissionRouteKey) {
      if (this.allowsGenerationRouteChange) {
        this.submissionRouteKey = routeKey(url)
        return
      }
      throw new AdapterFault({
        code: "navigation_changed",
        message: "The platform route changed while generation was active.",
      })
    }
  }

  /** Reads the live document URL rather than relying on a stale cached value. */
  private currentUrl(): URL {
    return new URL(globalThis.location.href)
  }

  /** Summarizes provisional and fallback selector use for troubleshooting. */
  private selectorWarnings(): string[] {
    const candidates = selectorEntries(this.selectors).flatMap(([, group]) => group)
    const warnings = [
      "Authenticated platform DOM is undocumented; every Stage 6 selector remains unverified.",
    ]
    for (const candidate of candidates) {
      if (candidate.confidence === "verified") {
        warnings.push(`Selector unexpectedly claims verified status: ${candidate.query}`)
      }
    }
    return warnings
  }

  /** Provides one result/error boundary for every operation and records health failures. */
  private async run<T>(
    signal: AbortSignal,
    timeoutCode: AdapterErrorCode,
    fallbackMessage: string,
    action: (linkedSignal: AbortSignal) => Promise<T> | T,
    selectorKey?: string,
  ): Promise<AdapterResult<T>> {
    const linked = linkSignals(signal, this.lifecycleController.signal)
    try {
      throwIfAborted(linked.signal)
      return { ok: true, value: await action(linked.signal) }
    } catch (error) {
      return this.failure(error, timeoutCode, fallbackMessage, selectorKey)
    } finally {
      linked.dispose()
    }
  }

  /** Sanitizes unknown DOM exceptions into the adapter's stable public failure shape. */
  private failure<T>(
    error: unknown,
    timeoutCode: AdapterErrorCode,
    fallbackMessage: string,
    selectorKey?: string,
  ): AdapterResult<T> {
    if (error instanceof AdapterFault) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          recoverable: error.recoverable,
          ...(error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs }),
          ...(error.selectorKey === undefined ? {} : { selectorKey: error.selectorKey }),
        },
      }
    }
    const errorName = error instanceof DOMException ? error.name : "Error"
    const code: AdapterErrorCode =
      errorName === "AbortError"
        ? "aborted"
        : errorName === "TimeoutError"
          ? timeoutCode
          : timeoutCode
    return {
      ok: false,
      error: {
        code,
        message: code === "aborted" ? "The platform operation was cancelled." : fallbackMessage,
        recoverable: true,
        ...(selectorKey === undefined ? {} : { selectorKey }),
        diagnostics: { adapterId: this.id, adapterVersion: this.version, errorName },
      },
    }
  }
}

/** Tracks SPA route changes without treating harmless query-string updates as navigation. */
const routeKey = (url: URL): string => `${url.hostname}${url.pathname}${url.hash}`

/** Bounds every completion wait by the user's configured generation-complete timeout. */
const remainingGenerationTime = (deadline: number): number => {
  const remaining = deadline - Date.now()
  if (remaining > 0) return remaining
  throw new DOMException("The platform generation did not complete in time.", "TimeoutError")
}

/** Iterates selector groups without losing their precise configuration key types. */
const selectorEntries = (config: AdapterSelectorConfig) =>
  (Object.keys(config) as (keyof AdapterSelectorConfig)[]).map((key) => [key, config[key]] as const)

/** Applies the minimum visibility checks required before reading or interacting with a node. */
const isVisible = (element: HTMLElement): boolean =>
  element.isConnected &&
  element.getClientRects().length > 0 &&
  element.getAttribute("aria-hidden") !== "true"

/** Extends visibility checks with native and ARIA disabled-state handling. */
const isVisibleAndEnabled = (element: HTMLElement): boolean =>
  isVisible(element) &&
  !(element instanceof HTMLButtonElement && element.disabled) &&
  element.getAttribute("aria-disabled") !== "true"

/** Stops multi-step platform operations promptly and preserves the caller's abort reason. */
const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("The platform operation was cancelled.", "AbortError")
  }
}

/** Linked abort controllers let caller cancellation and adapter disposal stop observers immediately. */
const linkSignals = (
  caller: AbortSignal,
  lifecycle: AbortSignal,
): { signal: AbortSignal; dispose: () => void } => {
  const controller = new AbortController()
  const abortFrom = (source: AbortSignal): void => {
    if (!controller.signal.aborted) {
      controller.abort(source.reason ?? new DOMException("Operation cancelled.", "AbortError"))
    }
  }
  const fromCaller = (): void => abortFrom(caller)
  const fromLifecycle = (): void => abortFrom(lifecycle)
  caller.addEventListener("abort", fromCaller, { once: true })
  lifecycle.addEventListener("abort", fromLifecycle, { once: true })
  if (caller.aborted) abortFrom(caller)
  if (lifecycle.aborted) abortFrom(lifecycle)
  return {
    signal: controller.signal,
    dispose: () => {
      caller.removeEventListener("abort", fromCaller)
      lifecycle.removeEventListener("abort", fromLifecycle)
    },
  }
}
