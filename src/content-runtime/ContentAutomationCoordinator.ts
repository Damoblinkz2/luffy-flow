import type { AdapterResult, PlatformAdapter, SubmitPromptContext } from "~/adapters/contracts"
import { type PlatformAdapterRegistry } from "~/adapters/registry"
import { LuffyflowError } from "~/errors/luffyflow-error"
import type { MessageOf } from "~/schemas/messages"
import type { DetectedOutput, ErrorCategory, PlatformStatusSnapshot } from "~/schemas"

interface ActiveCommand {
  commandId: string
  controller: AbortController
  routeKey: string
}

/** Content coordination rejects stale leases and delegates every page operation to one adapter. */
export class ContentAutomationCoordinator {
  private active: ActiveCommand | null = null
  private readonly latestGeneration = new Map<string, number>()
  private readonly completedCommands = new Set<string>()

  constructor(
    private readonly registry: PlatformAdapterRegistry,
    private readonly onPromptSubmitted?: (promptId: string) => Promise<void>,
  ) {}

  /** Executes one leased prompt end to end while rejecting duplicates and stale generations. */
  async submit(message: MessageOf<"prompt/submit">): Promise<DetectedOutput> {
    const payload = message.payload
    const commandKey = `${payload.queueId}:${payload.leaseGeneration}:${payload.promptId}`
    if (this.completedCommands.has(commandKey)) {
      throw new LuffyflowError({
        code: "CONTENT_COMMAND_DUPLICATE",
        category: "submission_failure",
        userMessage: "LuffyFlow rejected a duplicate prompt command.",
      })
    }
    const previousGeneration = this.latestGeneration.get(payload.queueId) ?? -1
    if (payload.leaseGeneration < previousGeneration) throw staleCommandError()
    if (payload.leaseGeneration > previousGeneration) {
      this.active?.controller.abort(
        new DOMException("A newer queue lease replaced this command.", "AbortError"),
      )
      this.latestGeneration.set(payload.queueId, payload.leaseGeneration)
    }
    if (this.active !== null) {
      throw new LuffyflowError({
        code: "CONTENT_COMMAND_ACTIVE",
        category: "submission_failure",
        userMessage: "Another LuffyFlow prompt command is still active on this page.",
        recoverable: true,
      })
    }

    const adapter = this.requireAdapter(payload.adapterId, payload.adapterVersion)
    const currentUrl = new URL(globalThis.location.href)
    if (!adapter.isSupportedUrl(currentUrl)) throw staleCommandError()
    const controller = new AbortController()
    this.active = {
      commandId: payload.commandId,
      controller,
      routeKey: contentRouteKey(currentUrl),
    }
    try {
      const context: SubmitPromptContext = {
        promptId: payload.promptId,
        text: payload.promptText,
        previousOutputFingerprints: payload.previousOutputFingerprints,
        generationStartTimeoutMs: payload.generationStartTimeoutMs,
        generationCompleteTimeoutMs: payload.generationCompleteTimeoutMs,
      }
      const pageState = unwrap(await adapter.detectPageState(controller.signal))
      if (pageState.readiness !== "ready") {
        throw new LuffyflowError({
          code: "PLATFORM_NOT_READY",
          category: "submission_failure",
          userMessage: readinessMessage(pageState.readiness),
          recoverable: true,
        })
      }
      const input = unwrap(await adapter.findPromptInput(controller.signal))
      unwrap(await adapter.setPromptText(input, payload.promptText, controller.signal))
      unwrap(await adapter.submitPrompt(controller.signal))
      const submissionReporter = this.onPromptSubmitted
      if (submissionReporter !== undefined) {
        // A successful submit action must not silently bypass the authoritative one-token debit.
        await submissionReporter(payload.promptId)
      }
      unwrap(await adapter.waitForGenerationStart(context, controller.signal))
      const detected = unwrap(await adapter.waitForGenerationComplete(context, controller.signal))
      this.completedCommands.add(commandKey)
      trimSet(this.completedCommands, 1_000)
      return detected
    } finally {
      this.active = null
    }
  }

  /** Cancels only the matching active command so delayed cancellation cannot stop newer work. */
  async cancel(commandId: string, reason: string): Promise<void> {
    if (this.active === null || this.active.commandId !== commandId) return
    const adapter = this.registry.detect(new URL(globalThis.location.href))
    this.active.controller.abort(new DOMException(reason, "AbortError"))
    if (adapter?.cancelGeneration !== undefined) {
      const cancellationController = new AbortController()
      unwrap(await adapter.cancelGeneration(cancellationController.signal))
    }
  }

  /** Health inspection returns presence checks only and never exposes prompt or output DOM content. */
  async getPlatformStatus(tabId: number): Promise<PlatformStatusSnapshot> {
    const adapter = this.registry.detect(new URL(globalThis.location.href))
    if (adapter === null) return { tabId, supported: false, ready: false }
    const controller = new AbortController()
    const [state, adapterHealth] = await Promise.all([
      adapter.detectPageState(controller.signal),
      adapter.getHealth(controller.signal),
    ])
    return {
      tabId,
      platform: adapter.id,
      supported: true,
      ready: state.ok && state.value.readiness === "ready",
      adapterHealth,
    }
  }

  /** SPA route changes cancel uncertain in-flight work instead of continuing on a stale DOM. */
  handleNavigation(url: URL): void {
    if (this.active === null || this.active.routeKey === contentRouteKey(url)) return
    this.active.controller.abort(
      new DOMException(
        "The platform navigated while an LuffyFlow command was active.",
        "AbortError",
      ),
    )
  }

  /** Aborts remaining DOM work and releases observers owned by the adapter registry. */
  dispose(): void {
    this.active?.controller.abort(new DOMException("Content coordinator disposed.", "AbortError"))
    this.active = null
    this.registry.dispose()
  }

  /** Pins commands to the expected adapter version to avoid running stale DOM assumptions. */
  private requireAdapter(
    id: MessageOf<"prompt/submit">["payload"]["adapterId"],
    version: string,
  ): PlatformAdapter {
    const adapter = this.registry.get(id)
    if (adapter === null || adapter.version !== version) {
      throw new LuffyflowError({
        code: "ADAPTER_VERSION_MISMATCH",
        category: "platform_unsupported",
        userMessage: "Reload this platform tab so LuffyFlow can use the current adapter version.",
        recoverable: true,
      })
    }
    return adapter
  }
}

/** Converts adapter-level result objects into the application's shared throwable error type. */
const unwrap = <T>(result: AdapterResult<T>): T => {
  if (result.ok) return result.value
  throw new LuffyflowError({
    code: result.error.code.toUpperCase(),
    category: categoryForAdapterError(result.error.code),
    userMessage: result.error.message,
    recoverable: result.error.recoverable,
    ...(result.error.retryAfterMs === undefined ? {} : { retryAfterMs: result.error.retryAfterMs }),
    ...(result.error.diagnostics === undefined ? {} : { details: result.error.diagnostics }),
  })
}

/** Maps low-level adapter codes to the categories used by retry and user-message policies. */
const categoryForAdapterError = (code: string): ErrorCategory => {
  if (code === "selector_not_found") return "selector_not_found"
  if (code === "input_unavailable") return "prompt_input_unavailable"
  if (code.includes("timeout")) return "generation_timeout"
  if (code === "output_not_found") return "output_detection_failure"
  if (code === "page_not_ready" || code === "navigation_changed") return "platform_unsupported"
  return "submission_failure"
}

/** Provides actionable guidance for each platform readiness state. */
const readinessMessage = (readiness: string): string => {
  if (readiness === "authentication_required")
    return "Log in to the AI platform before starting LuffyFlow."
  if (readiness === "rate_limited")
    return "The platform is rate limiting requests. LuffyFlow paused safely."
  if (readiness === "service_unavailable") return "The platform service is currently unavailable."
  if (readiness === "generation_in_progress")
    return "Wait for the current platform generation to finish."
  return "The platform page is not ready for prompt submission."
}

/** Creates the authorization error used when a command no longer owns the current lease or route. */
const staleCommandError = () =>
  new LuffyflowError({
    code: "CONTENT_COMMAND_STALE",
    category: "authorization",
    userMessage: "LuffyFlow rejected a stale content-script command.",
  })

/** Bounds the in-memory duplicate cache by evicting insertion-ordered oldest entries. */
const trimSet = (values: Set<string>, maximumSize: number): void => {
  while (values.size > maximumSize) {
    const oldest: string | undefined = values.values().next().value
    if (oldest === undefined) return
    values.delete(oldest)
  }
}

/** Identifies meaningful SPA navigation while ignoring query-only changes. */
const contentRouteKey = (url: URL): string => `${url.hostname}${url.pathname}${url.hash}`
