import { AutoflowError } from "~/errors/autoflow-error"
import { queueStateSchema, type QueueRunStatus, type QueueState } from "~/schemas"

const ALLOWED_TRANSITIONS: Readonly<Record<QueueRunStatus, readonly QueueRunStatus[]>> = {
  idle: ["running", "stopped"],
  running: ["paused", "paused_recovery", "stopping", "completed", "failed"],
  paused: ["running", "stopping", "stopped", "failed"],
  paused_recovery: ["running", "stopping", "stopped", "failed"],
  stopping: ["stopped", "failed"],
  stopped: [],
  completed: [],
  failed: [],
}

/** Pure transition validation keeps invalid queue states out of persistence and message handlers. */
export class QueueStateMachine {
  transition(queue: QueueState, status: QueueRunStatus, pauseReason?: string): QueueState {
    if (!ALLOWED_TRANSITIONS[queue.status].includes(status)) {
      throw new AutoflowError({
        code: "QUEUE_TRANSITION_INVALID",
        category: "invalid_data",
        userMessage: `The queue cannot move from ${queue.status} to ${status}.`,
        details: { queueId: queue.id, from: queue.status, to: status },
      })
    }
    const candidate: Record<string, unknown> = { ...queue, status }
    if (status === "paused" || status === "paused_recovery") {
      candidate.pauseReason = pauseReason ?? "Paused by AutoFlow."
    } else {
      delete candidate.pauseReason
    }
    if (status === "stopped" || status === "completed" || status === "failed") {
      delete candidate.currentPromptId
      delete candidate.activeCommandId
      delete candidate.lease
    }
    return queueStateSchema.parse(candidate)
  }
}
