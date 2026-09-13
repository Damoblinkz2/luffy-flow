import * as z from "zod/v3"

import { LuffyflowError, toLuffyflowError } from "~/errors/luffyflow-error"
import type { Logger } from "~/logging/logger"
import type { TypedMessageClient } from "~/messaging/client"
import type { TypedMessageRouter } from "~/messaging/router"
import {
  detectedOutputSchema,
  queueStateSchema,
  type LuffyflowSettings,
  type QueueState,
} from "~/schemas"
import type { OutputCaptureService } from "~/services/outputs/OutputCaptureService"
import type { QueueService } from "~/services/queue/QueueService"
import type {
  OutputRepository,
  PromptRepository,
  QueueRepository,
} from "~/storage/repositories/contracts"
import { createId } from "~/utils/ids"
import { delay } from "~/utils/time"

const UI_SOURCES = ["popup", "dashboard", "sidepanel", "in_page_panel"] as const

/** Dependencies are injected so Stage 8 can exercise coordination without live browser tabs. */
export interface BackgroundQueueCoordinatorOptions {
  queueService: QueueService
  queues: QueueRepository
  prompts: PromptRepository
  outputs: OutputRepository
  outputCapture: OutputCaptureService
  getAuthenticatedUserId(): Promise<string>
  authorizeStart(): Promise<string>
  /** Rechecks balance before claiming each prompt so an exhausted wallet pauses safely. */
  authorizePrompt(): Promise<void>
  /** Debits exactly one token after the page confirms a prompt was submitted. */
  debitPrompt(promptId: string, attempt: number): Promise<void>
  getSettings(): Promise<LuffyflowSettings>
  createContentClient(tabId: number): TypedMessageClient
  publishQueue(queue: QueueState): Promise<void>
  logger: Logger
}

/** Background coordination persists before messaging and runs at most one queue loop per worker. */
export class BackgroundQueueCoordinator {
  private readonly ownerId = createId()
  private running: Promise<void> | null = null
  private loopController: AbortController | null = null
  private activeCommand: { tabId: number; commandId: string } | null = null
  private haltRequested = false

  /** Receives all worker dependencies while assigning this service-worker instance a lease owner. */
  constructor(private readonly options: BackgroundQueueCoordinatorOptions) {}

  /** Registers queue, prompt, platform, and lifecycle message handlers as one disposable group. */
  register(router: TypedMessageRouter): () => void {
    const cleanup = [
      router.register("queue/create", UI_SOURCES, async (message) => {
        const queue = await this.options.queueService.create({
          userId: await this.options.getAuthenticatedUserId(),
          platform: message.payload.platform,
          promptTexts: message.payload.promptTexts,
          delayMs: message.payload.delayMs,
          adapterVersion: message.payload.adapterVersion,
        })
        await this.options.publishQueue(queue)
        return queue
      }),
      router.register("queue/prompts/add", UI_SOURCES, async (message) => {
        await this.assertQueueOwner(
          message.payload.queueId,
          await this.options.getAuthenticatedUserId(),
        )
        const queue = await this.options.queueService.addPrompts(
          message.payload.queueId,
          message.payload.expectedRevision,
          message.payload.promptTexts,
          message.payload.adapterVersion,
        )
        await this.options.publishQueue(queue)
        return queue
      }),
      router.register("queue/prompt/edit", UI_SOURCES, async (message) => {
        await this.assertPromptOwner(
          message.payload.promptId,
          await this.options.getAuthenticatedUserId(),
        )
        return this.options.queueService.editPrompt(message.payload.promptId, message.payload.text)
      }),
      router.register("queue/prompt/remove", UI_SOURCES, async (message) => {
        await this.assertQueueOwner(
          message.payload.queueId,
          await this.options.getAuthenticatedUserId(),
        )
        const queue = await this.options.queueService.removePrompt(
          message.payload.queueId,
          message.payload.expectedRevision,
          message.payload.promptId,
        )
        await this.options.publishQueue(queue)
        return queue
      }),
      router.register("queue/prompts/reorder", UI_SOURCES, async (message) => {
        await this.assertQueueOwner(
          message.payload.queueId,
          await this.options.getAuthenticatedUserId(),
        )
        const queue = await this.options.queueService.reorderPrompts(
          message.payload.queueId,
          message.payload.expectedRevision,
          message.payload.orderedPromptIds,
        )
        await this.options.publishQueue(queue)
        return queue
      }),
      router.register("queue/prompt/retry", UI_SOURCES, async (message) => {
        await this.assertPromptOwner(
          message.payload.promptId,
          await this.options.getAuthenticatedUserId(),
        )
        const settings = await this.options.getSettings()
        return this.options.queueService.retryPrompt(
          message.payload.promptId,
          settings.maximumRetryCount,
        )
      }),
      router.register("queue/prompt/skip", UI_SOURCES, async (message) => {
        await this.assertPromptOwner(
          message.payload.promptId,
          await this.options.getAuthenticatedUserId(),
        )
        return this.options.queueService.skipPrompt(message.payload.promptId)
      }),
      router.register("queue/start", UI_SOURCES, async (message) => {
        await this.assertQueueOwner(message.payload.queueId, await this.options.authorizeStart())
        const queue = await this.options.queueService.start(
          message.payload.queueId,
          message.payload.expectedRevision,
          message.payload.tabId,
          this.ownerId,
        )
        await this.options.publishQueue(queue)
        this.schedule()
        return queue
      }),
      router.register("queue/pause", UI_SOURCES, async (message) => {
        await this.assertQueueOwner(
          message.payload.queueId,
          await this.options.getAuthenticatedUserId(),
        )
        await this.assertExpectedQueue(message.payload.queueId, message.payload.expectedRevision)
        await this.haltLoop("Queue paused by the user.")
        const latest = await this.requireCurrentQueue(message.payload.queueId)
        if (latest.status !== "running") return latest
        const queue = await this.options.queueService.pause(
          message.payload.queueId,
          latest.revision,
          this.ownerId,
          message.payload.reason,
        )
        await this.options.publishQueue(queue)
        return queue
      }),
      router.register("queue/resume", UI_SOURCES, async (message) => {
        await this.assertQueueOwner(message.payload.queueId, await this.options.authorizeStart())
        const queue = await this.options.queueService.resume(
          message.payload.queueId,
          message.payload.expectedRevision,
          message.payload.tabId,
          this.ownerId,
        )
        await this.options.publishQueue(queue)
        this.schedule()
        return queue
      }),
      router.register("queue/stop", UI_SOURCES, async (message) => {
        await this.assertQueueOwner(
          message.payload.queueId,
          await this.options.getAuthenticatedUserId(),
        )
        await this.assertExpectedQueue(message.payload.queueId, message.payload.expectedRevision)
        await this.haltLoop("Queue stopped by the user.")
        const latest = await this.requireCurrentQueue(message.payload.queueId)
        if (
          latest.status === "stopped" ||
          latest.status === "completed" ||
          latest.status === "failed"
        ) {
          return latest
        }
        const queue = await this.options.queueService.stop(
          message.payload.queueId,
          latest.revision,
          this.ownerId,
        )
        await this.options.publishQueue(queue)
        return queue
      }),
      router.register("prompt/status/changed", ["content"], async (message, sender) => {
        await this.verifyContentSender(message.payload.promptId, sender)
        if (message.payload.status !== "waiting_for_output") {
          throw new LuffyflowError({
            code: "CONTENT_STATUS_FORBIDDEN",
            category: "authorization",
            userMessage: "The content script cannot apply that prompt status.",
          })
        }
        const prompt = await this.options.prompts.getById(message.payload.promptId)
        if (prompt === null) throw ownershipError()
        await this.options.debitPrompt(prompt.id, prompt.retryCount)
        return this.options.queueService.markWaiting(prompt.id)
      }),
      router.register("output/detected", ["content"], async (message, sender) => {
        await this.verifyContentSender(message.payload.promptId, sender)
        return this.options.outputCapture.capture(
          message.payload.promptId,
          message.payload.detectedOutput,
        )
      }),
      router.register(
        "output/rename",
        ["dashboard", "sidepanel", "in_page_panel"],
        async (message) => {
          const output = await this.options.outputs.getById(message.payload.outputId)
          const userId = await this.options.getAuthenticatedUserId()
          if (output === null || output.userId !== userId) throw ownershipError()
          return this.options.outputCapture.rename(
            message.payload.outputId,
            message.payload.expectedRevision,
            message.payload.requestedName,
          )
        },
      ),
    ]
    return () => cleanup.forEach((dispose) => dispose())
  }

  /** Reconciles persisted queue state after an MV3 worker restart and resumes eligible work. */
  async recover(): Promise<QueueState | null> {
    const interrupted = await this.options.queues.getActive()
    if (
      interrupted?.activeCommandId !== undefined &&
      interrupted.targetTabId !== undefined &&
      (interrupted.status === "running" || interrupted.status === "stopping")
    ) {
      try {
        await this.options.createContentClient(interrupted.targetTabId).send({
          kind: "command/cancel",
          target: "content",
          payload: {
            commandId: interrupted.activeCommandId,
            reason: "The LuffyFlow background worker restarted.",
          },
          responseSchema: z.void(),
        })
      } catch (error) {
        this.options.logger.warn("An interrupted page command could not be cancelled.", error)
      }
    }
    const queue = await this.options.queueService.recoverAfterWorkerRestart()
    if (queue !== null) await this.options.publishQueue(queue)
    return queue
  }

  /** Starts at most one processing loop and records unexpected terminal failures. */
  private schedule(): void {
    if (this.running !== null) return
    this.haltRequested = false
    const controller = new AbortController()
    this.loopController = controller
    this.running = this.run(controller.signal).finally(() => {
      this.running = null
      if (this.loopController === controller) this.loopController = null
    })
    void this.running.catch((error: unknown) => {
      this.options.logger.error("The background queue loop stopped unexpectedly.", error)
    })
  }

  /** Claims prompts, delegates page automation, captures outputs, and advances the queue. */
  private async run(signal: AbortSignal): Promise<void> {
    while (true) {
      if (signal.aborted) return
      const queue = await this.options.queues.getActive()
      if (
        queue === null ||
        queue.status !== "running" ||
        queue.targetTabId === undefined ||
        queue.lease === undefined ||
        queue.lease.ownerId !== this.ownerId
      ) {
        return
      }
      // Wallet state is authoritative and is checked immediately before each new send.
      try {
        await this.options.authorizePrompt()
      } catch (error) {
        const normalized = toLuffyflowError(error, {
          code: "TOKEN_BALANCE_EMPTY",
          category: "usage_limit",
          userMessage: "Your token balance is empty. Recharge to continue.",
          recoverable: true,
        })
        const paused = await this.options.queueService.pause(
          queue.id,
          queue.revision,
          this.ownerId,
          normalized.userMessage,
        )
        await this.options.publishQueue(paused)
        return
      }
      const prompt = await this.options.queueService.claimNext(
        queue.id,
        this.ownerId,
        queue.lease.generation,
      )
      if (prompt === null) {
        const latest = await this.options.queues.getActive()
        if (latest !== null) await this.options.publishQueue(latest)
        return
      }
      const claimedQueue = await this.options.queues.getActive()
      if (claimedQueue !== null) await this.options.publishQueue(claimedQueue)

      const commandId = createId()
      const beforeCommand = await this.requireCurrentQueue(queue.id)
      const commandQueue = await this.options.queues.save(
        queueStateSchema.parse({ ...beforeCommand, activeCommandId: commandId }),
        beforeCommand.revision,
      )
      await this.options.publishQueue(commandQueue)
      this.activeCommand = { tabId: commandQueue.targetTabId ?? queue.targetTabId, commandId }
      try {
        const settings = await this.options.getSettings()
        const adapterSettings = settings.platformAdapters[prompt.platform]
        if (!adapterSettings.enabled) {
          throw new LuffyflowError({
            code: "ADAPTER_DISABLED",
            category: "platform_unsupported",
            userMessage: "Enable this platform adapter in LuffyFlow settings before continuing.",
          })
        }
        const detected = await this.options.createContentClient(queue.targetTabId).send({
          kind: "prompt/submit",
          target: "content",
          payload: {
            queueId: queue.id,
            promptId: prompt.id,
            commandId,
            promptText: prompt.text,
            adapterId: prompt.platform,
            adapterVersion: prompt.adapterVersion,
            tabId: queue.targetTabId,
            leaseGeneration: queue.lease.generation,
            previousOutputFingerprints: await this.readSessionFingerprints(prompt.sessionId),
            generationStartTimeoutMs: adapterSettings.generationStartTimeoutMs,
            generationCompleteTimeoutMs: adapterSettings.generationCompleteTimeoutMs,
          },
          responseSchema: detectedOutputSchema,
        })
        await this.options.outputCapture.capture(prompt.id, detected)
      } catch (error) {
        const normalized = toLuffyflowError(error, {
          code: "PROMPT_AUTOMATION_FAILED",
          category: "submission_failure",
          userMessage: "LuffyFlow could not complete this prompt.",
          recoverable: true,
        })
        const shouldPause =
          normalized.code === "RATE_LIMITED" ||
          normalized.code === "SERVICE_UNAVAILABLE" ||
          normalized.category === "authorization" ||
          normalized.category === "platform_unsupported"
        const latestPromptQueue = await this.options.queues.getActive()
        if (!this.haltRequested && latestPromptQueue?.status === "running") {
          await this.options.queueService.failPrompt(
            prompt.id,
            normalized.code,
            normalized.userMessage,
            shouldPause,
          )
        }
      } finally {
        this.activeCommand = null
      }

      const latest = await this.options.queues.getActive()
      if (latest === null) return
      await this.options.publishQueue(latest)
      if (latest.status !== "running" || this.haltRequested) return
      try {
        await delay(latest.delayMs, signal)
      } catch (error) {
        if (signal.aborted) return
        throw error
      }
    }
  }

  /** Best-effort sends cancellation only to the tab and command currently being tracked. */
  private async cancelActive(reason: string): Promise<void> {
    const active = this.activeCommand
    if (active === null) return
    await this.options.createContentClient(active.tabId).send({
      kind: "command/cancel",
      target: "content",
      payload: { commandId: active.commandId, reason },
      responseSchema: z.void(),
    })
  }

  /** Requests loop shutdown, cancels page work, and waits for the worker to settle. */
  private async haltLoop(reason: string): Promise<void> {
    this.haltRequested = true
    this.loopController?.abort(new DOMException(reason, "AbortError"))
    try {
      await this.cancelActive(reason)
    } catch (error) {
      this.options.logger.warn("The active page command could not be cancelled cleanly.", error)
    }
    try {
      const running = this.running
      if (running !== null) await running
    } catch (error) {
      this.options.logger.warn("The queue loop ended while applying a control action.", error)
    }
  }

  /** Rejects dashboard commands based on a stale queue identity or revision. */
  private async assertExpectedQueue(queueId: string, expectedRevision: number): Promise<void> {
    const queue = await this.requireCurrentQueue(queueId)
    if (queue.revision !== expectedRevision) {
      throw new LuffyflowError({
        code: "QUEUE_REVISION_CONFLICT",
        category: "storage_failure",
        userMessage: "The queue changed in another LuffyFlow context. Refresh and try again.",
        recoverable: true,
      })
    }
  }

  /** Loads the active queue and verifies that it matches the requested identifier. */
  private async requireCurrentQueue(queueId: string): Promise<QueueState> {
    const queue = await this.options.queues.getActive()
    if (queue === null || queue.id !== queueId) {
      throw new LuffyflowError({
        code: "QUEUE_NOT_FOUND",
        category: "invalid_data",
        userMessage: "The requested queue no longer exists.",
      })
    }
    return queue
  }

  /** Enforces account ownership before exposing or mutating queue state. */
  private async assertQueueOwner(queueId: string, userId: string): Promise<void> {
    const queue = await this.requireCurrentQueue(queueId)
    if (queue.userId !== userId) throw ownershipError()
  }

  /** Enforces account ownership before exposing or mutating a prompt. */
  private async assertPromptOwner(promptId: string, userId: string): Promise<void> {
    const prompt = await this.options.prompts.getById(promptId)
    if (prompt === null || prompt.userId !== userId) throw ownershipError()
  }

  /** Confirms content-originated messages came from the expected supported tab and frame. */
  private async verifyContentSender(
    promptId: string,
    sender: chrome.runtime.MessageSender,
  ): Promise<void> {
    const queue = await this.options.queues.getActive()
    if (
      queue === null ||
      queue.currentPromptId !== promptId ||
      sender.tab?.id === undefined ||
      sender.tab.id !== queue.targetTabId
    ) {
      throw new LuffyflowError({
        code: "CONTENT_EVENT_STALE",
        category: "authorization",
        userMessage: "LuffyFlow rejected a stale page event.",
      })
    }
  }

  /** Collects prior output fingerprints so adapters can ignore responses from earlier commands. */
  private async readSessionFingerprints(sessionId: string): Promise<string[]> {
    const fingerprints: string[] = []
    let cursor: string | undefined
    do {
      const page = await this.options.outputs.list(
        { limit: 100, ...(cursor === undefined ? {} : { cursor }) },
        { sessionId },
      )
      fingerprints.push(...page.items.map((output) => output.fingerprint))
      cursor = page.nextCursor
    } while (cursor !== undefined && fingerprints.length < 10_000)
    return fingerprints.slice(0, 10_000)
  }
}

/** Prevents a signed-in user from mutating queue data owned by another account. */
const ownershipError = () =>
  new LuffyflowError({
    code: "RECORD_OWNERSHIP_INVALID",
    category: "authorization",
    userMessage: "This record does not belong to the authenticated LuffyFlow account.",
  })
