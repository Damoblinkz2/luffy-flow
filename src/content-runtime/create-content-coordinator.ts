import { type PlatformAdapterRegistry } from "~/adapters/registry"
import type { TypedMessageClient } from "~/messaging/client"
import { promptRecordSchema } from "~/schemas"

import { ContentAutomationCoordinator } from "./ContentAutomationCoordinator"

/** Submission reporting lets the background debit and persist waiting state before output checks. */
export const createContentCoordinator = (
  registry: PlatformAdapterRegistry,
  backgroundClient: TypedMessageClient,
): ContentAutomationCoordinator =>
  new ContentAutomationCoordinator(registry, async (promptId) => {
    await backgroundClient.send({
      kind: "prompt/status/changed",
      target: "background",
      payload: { promptId, status: "waiting_for_output" },
      responseSchema: promptRecordSchema,
    })
  })
