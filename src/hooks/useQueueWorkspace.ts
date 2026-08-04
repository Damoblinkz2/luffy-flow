import { useCallback, useEffect, useMemo, useState } from "react"

import { AutoflowError } from "~/errors/autoflow-error"
import { TypedMessageClient } from "~/messaging/client"
import { TypedMessageRouter } from "~/messaging/router"
import { listenForRuntimeMessages, RuntimeMessageTransport } from "~/messaging/runtime-transport"
import {
  promptRecordSchema,
  queueStateSchema,
  type PromptRecord,
  type QueueState,
  type SupportedPlatform,
} from "~/schemas"
import { useApplicationServices } from "~/components/common/ApplicationProviders"

type QueueUiSource = "dashboard" | "sidepanel" | "in_page_panel"

export interface QueueWorkspace {
  queue: QueueState | null
  prompts: PromptRecord[]
  loading: boolean
  busy: boolean
  error: string | null
  refresh(): Promise<void>
  addDrafts(input: {
    texts: string[]
    platform: SupportedPlatform
    delayMs: number
    adapterVersion: string
  }): Promise<void>
  start(tabId: number): Promise<void>
  pause(): Promise<void>
  resume(tabId: number): Promise<void>
  stop(): Promise<void>
  editPrompt(promptId: string, text: string): Promise<void>
  removePrompt(promptId: string): Promise<void>
  movePrompt(promptId: string, direction: -1 | 1): Promise<void>
  retryPrompt(promptId: string): Promise<void>
  skipPrompt(promptId: string): Promise<void>
  clearError(): void
}

/** Queue UI sends mutations to the background while repository reads hydrate durable records. */
export const useQueueWorkspace = (source: QueueUiSource): QueueWorkspace => {
  const services = useApplicationServices()
  const client = useMemo(
    () => new TypedMessageClient(source, new RuntimeMessageTransport()),
    [source],
  )
  const [queue, setQueue] = useState<QueueState | null>(null)
  const [prompts, setPrompts] = useState<PromptRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hydrate = useCallback(
    async (nextQueue?: QueueState | null): Promise<void> => {
      const durableQueue =
        nextQueue === undefined ? await services.repositories.queue.getActive() : nextQueue
      setQueue(durableQueue)
      if (durableQueue === null) {
        setPrompts([])
        return
      }
      const records = await Promise.all(
        durableQueue.promptIds.map((id) => services.repositories.prompts.getById(id)),
      )
      setPrompts(records.filter((record): record is PromptRecord => record !== null))
    },
    [services],
  )

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      await hydrate()
      setError(null)
    } catch (caught) {
      setError(messageFromError(caught))
    } finally {
      setLoading(false)
    }
  }, [hydrate])

  useEffect(() => {
    void refresh()
    if (source === "in_page_panel") {
      const fallback = setInterval(() => void hydrate(), 1_500)
      return () => clearInterval(fallback)
    }
    const router = new TypedMessageRouter("ui")
    const unregister = router.register("queue/state/changed", ["background"], async (message) => {
      await hydrate(message.payload.queue)
    })
    const stopListening = listenForRuntimeMessages((message, sender) =>
      router.route(message, sender),
    )
    return () => {
      stopListening()
      unregister()
    }
  }, [hydrate, refresh, source])

  const command = useCallback(
    async (operation: () => Promise<QueueState | PromptRecord>): Promise<void> => {
      setBusy(true)
      setError(null)
      try {
        const result = await operation()
        await hydrate("promptIds" in result ? result : undefined)
      } catch (caught) {
        setError(messageFromError(caught))
        throw caught
      } finally {
        setBusy(false)
      }
    },
    [hydrate],
  )

  const requireQueue = useCallback((): QueueState => {
    if (queue === null) {
      throw new AutoflowError({
        code: "QUEUE_MISSING",
        category: "invalid_data",
        userMessage: "Create a prompt queue first.",
      })
    }
    return queue
  }, [queue])

  const addDrafts = useCallback(
    async (input: {
      texts: string[]
      platform: SupportedPlatform
      delayMs: number
      adapterVersion: string
    }) => {
      const active = queue
      const terminal = active === null || ["stopped", "completed", "failed"].includes(active.status)
      await command(() =>
        terminal
          ? client.send({
              kind: "queue/create",
              target: "background",
              payload: {
                platform: input.platform,
                promptTexts: input.texts,
                delayMs: input.delayMs,
                adapterVersion: input.adapterVersion,
              },
              responseSchema: queueStateSchema,
            })
          : active.platform !== input.platform
            ? Promise.reject(
                new AutoflowError({
                  code: "QUEUE_PLATFORM_MISMATCH",
                  category: "invalid_data",
                  userMessage:
                    "Finish the current platform queue before adding prompts for another platform.",
                }),
              )
            : client.send({
                kind: "queue/prompts/add",
                target: "background",
                payload: {
                  queueId: active.id,
                  expectedRevision: active.revision,
                  promptTexts: input.texts,
                  adapterVersion: input.adapterVersion,
                },
                responseSchema: queueStateSchema,
              }),
      )
    },
    [client, command, queue],
  )

  const start = useCallback(
    (tabId: number) => {
      const active = requireQueue()
      return command(() =>
        client.send({
          kind: "queue/start",
          target: "background",
          payload: { queueId: active.id, tabId, expectedRevision: active.revision },
          responseSchema: queueStateSchema,
        }),
      )
    },
    [client, command, requireQueue],
  )

  const pause = useCallback(() => {
    const active = requireQueue()
    return command(() =>
      client.send({
        kind: "queue/pause",
        target: "background",
        payload: {
          queueId: active.id,
          expectedRevision: active.revision,
          reason: "Paused from the AutoFlow UI.",
        },
        responseSchema: queueStateSchema,
      }),
    )
  }, [client, command, requireQueue])

  const resume = useCallback(
    (tabId: number) => {
      const active = requireQueue()
      return command(() =>
        client.send({
          kind: "queue/resume",
          target: "background",
          payload: { queueId: active.id, tabId, expectedRevision: active.revision },
          responseSchema: queueStateSchema,
        }),
      )
    },
    [client, command, requireQueue],
  )

  const stop = useCallback(() => {
    const active = requireQueue()
    return command(() =>
      client.send({
        kind: "queue/stop",
        target: "background",
        payload: { queueId: active.id, expectedRevision: active.revision },
        responseSchema: queueStateSchema,
      }),
    )
  }, [client, command, requireQueue])

  const editPrompt = useCallback(
    (promptId: string, text: string) =>
      command(() =>
        client.send({
          kind: "queue/prompt/edit",
          target: "background",
          payload: { promptId, text },
          responseSchema: promptRecordSchema,
        }),
      ),
    [client, command],
  )

  const removePrompt = useCallback(
    (promptId: string) => {
      const active = requireQueue()
      return command(() =>
        client.send({
          kind: "queue/prompt/remove",
          target: "background",
          payload: { queueId: active.id, expectedRevision: active.revision, promptId },
          responseSchema: queueStateSchema,
        }),
      )
    },
    [client, command, requireQueue],
  )

  const movePrompt = useCallback(
    (promptId: string, direction: -1 | 1) => {
      const active = requireQueue()
      const index = active.promptIds.indexOf(promptId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= active.promptIds.length) return Promise.resolve()
      const orderedPromptIds = [...active.promptIds]
      const [moved] = orderedPromptIds.splice(index, 1)
      if (moved === undefined) return Promise.resolve()
      orderedPromptIds.splice(target, 0, moved)
      return command(() =>
        client.send({
          kind: "queue/prompts/reorder",
          target: "background",
          payload: { queueId: active.id, expectedRevision: active.revision, orderedPromptIds },
          responseSchema: queueStateSchema,
        }),
      )
    },
    [client, command, requireQueue],
  )

  const retryPrompt = useCallback(
    (promptId: string) =>
      command(() =>
        client.send({
          kind: "queue/prompt/retry",
          target: "background",
          payload: { promptId },
          responseSchema: promptRecordSchema,
        }),
      ),
    [client, command],
  )

  const skipPrompt = useCallback(
    (promptId: string) =>
      command(() =>
        client.send({
          kind: "queue/prompt/skip",
          target: "background",
          payload: { promptId },
          responseSchema: promptRecordSchema,
        }),
      ),
    [client, command],
  )

  return {
    queue,
    prompts,
    loading,
    busy,
    error,
    refresh,
    addDrafts,
    start,
    pause,
    resume,
    stop,
    editPrompt,
    removePrompt,
    movePrompt,
    retryPrompt,
    skipPrompt,
    clearError: () => setError(null),
  }
}

const messageFromError = (error: unknown): string =>
  error instanceof AutoflowError
    ? error.userMessage
    : error instanceof Error
      ? error.message
      : "AutoFlow could not update the queue."
