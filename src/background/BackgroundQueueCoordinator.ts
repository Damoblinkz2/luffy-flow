import { z } from "zod"

import { AutoflowError, toAutoflowError } from "~/errors/autoflow-error"
import type { Logger } from "~/logging/logger"
import type { TypedMessageClient } from "~/messaging/client"
import type { TypedMessageRouter } from "~/messaging/router"
import {
  detectedOutputSchema,
  queueStateSchema,
  type AutoflowSettings,
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
  getSettings(): Promise<AutoflowSettings>
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

  constructor(private readonly options: BackgroundQueueCoordinatorOptions) {}

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
          throw new AutoflowError({
            code: "CONTENT_STATUS_FORBIDDEN",
            category: "authorization",
            userMessage: "The content script cannot apply that prompt status.",
          })
        }
        return this.options.queueService.markWaiting(message.payload.promptId)
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
            reason: "The AutoFlow background worker restarted.",
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
          throw new AutoflowError({
            code: "ADAPTER_DISABLED",
            category: "platform_unsupported",
            userMessage: "Enable this platform adapter in AutoFlow settings before continuing.",
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
        const normalized = toAutoflowError(error, {
          code: "PROMPT_AUTOMATION_FAILED",
          category: "submission_failure",
          userMessage: "AutoFlow could not complete this prompt.",
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

  private async assertExpectedQueue(queueId: string, expectedRevision: number): Promise<void> {
    const queue = await this.requireCurrentQueue(queueId)
    if (queue.revision !== expectedRevision) {
      throw new AutoflowError({
        code: "QUEUE_REVISION_CONFLICT",
        category: "storage_failure",
        userMessage: "The queue changed in another AutoFlow context. Refresh and try again.",
        recoverable: true,
      })
    }
  }

  private async requireCurrentQueue(queueId: string): Promise<QueueState> {
    const queue = await this.options.queues.getActive()
    if (queue === null || queue.id !== queueId) {
      throw new AutoflowError({
        code: "QUEUE_NOT_FOUND",
        category: "invalid_data",
        userMessage: "The requested queue no longer exists.",
      })
    }
    return queue
  }

  private async assertQueueOwner(queueId: string, userId: string): Promise<void> {
    const queue = await this.requireCurrentQueue(queueId)
    if (queue.userId !== userId) throw ownershipError()
  }

  private async assertPromptOwner(promptId: string, userId: string): Promise<void> {
    const prompt = await this.options.prompts.getById(promptId)
    if (prompt === null || prompt.userId !== userId) throw ownershipError()
  }

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
      throw new AutoflowError({
        code: "CONTENT_EVENT_STALE",
        category: "authorization",
        userMessage: "AutoFlow rejected a stale page event.",
      })
    }
  }

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

const ownershipError = () =>
  new AutoflowError({
    code: "RECORD_OWNERSHIP_INVALID",
    category: "authorization",
    userMessage: "This record does not belong to the authenticated AutoFlow account.",
  })
