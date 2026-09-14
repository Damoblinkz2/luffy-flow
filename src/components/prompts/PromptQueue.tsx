import { useState } from "react"

import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ProgressBar,
} from "~/components/common"
import type { ActivePlatformSnapshot } from "~/hooks/useActivePlatform"
import type { QueueWorkspace } from "~/hooks/useQueueWorkspace"
import type { PromptRecord, PromptStatus } from "~/schemas"
import { openDashboard } from "~/utils/extension-navigation"

export interface PromptQueueProps {
  workspace: QueueWorkspace
  activePlatform: ActivePlatformSnapshot
}

const STATUS_LABELS: Record<PromptStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  sending: "Sending",
  waiting_for_output: "Waiting for output",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
  cancelled: "Cancelled",
}

/** Queue controls mirror the durable background state and never run timers inside React. */
export const PromptQueue = ({ workspace, activePlatform }: PromptQueueProps) => {
  const queue = workspace.queue
  const completeCount = workspace.prompts.filter((prompt) =>
    ["completed", "failed", "skipped", "cancelled"].includes(prompt.status),
  ).length
  const progress =
    workspace.prompts.length === 0 ? 0 : (completeCount / workspace.prompts.length) * 100
  const matchingTab =
    queue !== null &&
    activePlatform.supported &&
    activePlatform.platform === queue.platform &&
    activePlatform.tabId !== undefined

  const run = (operation: () => Promise<void>): void => {
    void operation().catch(() => undefined)
  }
  const runWithActiveTab = (operation: (tabId: number) => Promise<void>): void => {
    const tabId = activePlatform.tabId
    if (tabId === undefined) return
    run(() => operation(tabId))
  }

  return (
    <section className="af-card space-y-4" aria-labelledby="queue-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="queue-title" className="text-lg font-semibold">
            Prompt queue
          </h2>
          <p className="af-muted">Durable background-owned automation</p>
        </div>
        {queue === null ? null : (
          <Badge
            tone={
              queue.status === "running"
                ? "success"
                : queue.status.startsWith("paused")
                  ? "warning"
                  : "neutral"
            }
          >
            {queue.status.replaceAll("_", " ")}
          </Badge>
        )}
      </div>

      {workspace.error === null ? null : (
        <ErrorState
          message={workspace.error}
          onRetry={() => void workspace.refresh()}
          action={
            workspace.authenticationRequired ? (
              <Button
                variant="primary"
                onClick={() => {
                  // Keep the queue intact and open the durable login surface in a new tab.
                  void openDashboard("/login")
                }}
              >
                Open login
              </Button>
            ) : undefined
          }
        />
      )}
      {queue?.pauseReason === undefined ? null : (
        <p className="rounded-xl bg-amber-500/10 p-3 text-sm" role="status">
          {queue.pauseReason}
        </p>
      )}

      {queue === null ? (
        <EmptyState
          title="Queue is empty"
          description="Review prompts above, then add them to create a queue."
        />
      ) : (
        <>
          <ProgressBar
            value={progress}
            label={`${completeCount} of ${workspace.prompts.length} processed`}
          />
          <p className="text-xs text-foreground/60">
            Delay: {(queue.delayMs / 1_000).toLocaleString()} seconds · Platform: {queue.platform}
          </p>
          {!matchingTab && (queue.status === "idle" || queue.status.startsWith("paused")) ? (
            <p className="rounded-xl bg-amber-500/10 p-3 text-sm">
              Open the matching supported platform tab before starting or resuming.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {queue.status === "idle" ? (
              <Button
                disabled={!matchingTab || workspace.busy}
                onClick={() => runWithActiveTab(workspace.start)}
              >
                Start automation
              </Button>
            ) : null}
            {queue.status === "running" ? (
              <Button
                variant="secondary"
                disabled={workspace.busy}
                onClick={() => run(workspace.pause)}
              >
                Pause
              </Button>
            ) : null}
            {queue.status === "paused" || queue.status === "paused_recovery" ? (
              <Button
                disabled={!matchingTab || workspace.busy}
                onClick={() => runWithActiveTab(workspace.resume)}
              >
                Resume
              </Button>
            ) : null}
            {!["stopped", "completed", "failed"].includes(queue.status) ? (
              <Button
                variant="danger"
                disabled={workspace.busy}
                onClick={() => run(workspace.stop)}
              >
                Stop
              </Button>
            ) : null}
          </div>
          <ol className="space-y-2">
            {workspace.prompts.map((prompt, index) => (
              <PromptQueueItem
                key={prompt.id}
                prompt={prompt}
                index={index}
                count={workspace.prompts.length}
                busy={workspace.busy}
                onEdit={(text) => workspace.editPrompt(prompt.id, text)}
                onRemove={() => workspace.removePrompt(prompt.id)}
                onMove={(direction) => workspace.movePrompt(prompt.id, direction)}
                onRetry={() => workspace.retryPrompt(prompt.id)}
                onSkip={() => workspace.skipPrompt(prompt.id)}
              />
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

interface PromptQueueItemProps {
  prompt: PromptRecord
  index: number
  count: number
  busy: boolean
  onEdit(text: string): Promise<void>
  onRemove(): Promise<void>
  onMove(direction: -1 | 1): Promise<void>
  onRetry(): Promise<void>
  onSkip(): Promise<void>
}

/** Individual prompt rows keep editing local until the user explicitly saves. */
const PromptQueueItem = ({
  prompt,
  index,
  count,
  busy,
  onEdit,
  onRemove,
  onMove,
  onRetry,
  onSkip,
}: PromptQueueItemProps) => {
  const [editing, setEditing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [text, setText] = useState(prompt.text)
  const editable = prompt.status === "draft" || prompt.status === "queued"
  const run = (operation: () => Promise<void>, source?: HTMLElement): void => {
    // Queue state is refreshed after a retry. Preserve every scrolling ancestor of the pressed
    // control so React's rerender cannot jump the side-panel user back to its first prompt.
    const restoreScroll = captureScrollPosition(source)
    void operation()
      .catch(() => undefined)
      .finally(() => {
        restoreScroll()
        globalThis.requestAnimationFrame?.(restoreScroll)
      })
  }

  return (
    <li className="rounded-xl border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">#{index + 1}</span>
            <Badge
              tone={
                prompt.status === "completed"
                  ? "success"
                  : prompt.status === "failed"
                    ? "danger"
                    : prompt.status === "waiting_for_output" || prompt.status === "sending"
                      ? "info"
                      : "neutral"
              }
            >
              {STATUS_LABELS[prompt.status]}
            </Badge>
          </div>
          {editing ? (
            <textarea
              className="af-field min-h-20"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm">{prompt.text}</p>
          )}
          {prompt.errorMessage === undefined ? null : (
            <p className="mt-2 text-sm text-danger" role="alert">
              {prompt.errorMessage}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {editing ? (
          <>
            <Button
              variant="primary"
              disabled={busy || text.trim().length === 0}
              onClick={() =>
                run(async () => {
                  await onEdit(text)
                  setEditing(false)
                })
              }
            >
              Save
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setText(prompt.text)
                setEditing(false)
              }}
            >
              Cancel
            </Button>
          </>
        ) : editable ? (
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              disabled={busy || index === 0}
              onClick={() => run(() => onMove(-1))}
            >
              Move up
            </Button>
            <Button
              variant="ghost"
              disabled={busy || index === count - 1}
              onClick={() => run(() => onMove(1))}
            >
              Move down
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmRemove(true)}>
              Remove
            </Button>
          </>
        ) : null}
        {prompt.status === "failed" ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={(event) => run(onRetry, event.currentTarget)}
          >
            Retry
          </Button>
        ) : null}
        {prompt.status === "failed" || prompt.status === "queued" ? (
          <Button variant="ghost" disabled={busy} onClick={() => run(onSkip)}>
            Skip
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmRemove}
        title="Remove this queued prompt?"
        description="The local prompt record will be deleted before submission."
        confirmLabel="Remove prompt"
        destructive
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false)
          run(onRemove)
        }}
      />
    </li>
  )
}

/** Records document and nested panel offsets before an asynchronous queue operation changes the DOM. */
const captureScrollPosition = (source?: HTMLElement): (() => void) => {
  const scrollOffsets = new Map<Element, { left: number; top: number }>()
  let current: HTMLElement | null | undefined = source
  while (current !== null && current !== undefined) {
    if (current.scrollHeight > current.clientHeight || current.scrollWidth > current.clientWidth) {
      scrollOffsets.set(current, { left: current.scrollLeft, top: current.scrollTop })
    }
    current = current.parentElement
  }
  const root = document.scrollingElement
  if (root !== null) scrollOffsets.set(root, { left: root.scrollLeft, top: root.scrollTop })
  return () => {
    for (const [element, offset] of scrollOffsets) {
      const scrollElement = element as HTMLElement
      scrollElement.scrollLeft = offset.left
      scrollElement.scrollTop = offset.top
    }
  }
}
