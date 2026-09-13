import { describe, expect, it, vi } from "vitest"

import { createMessage } from "~/messaging/envelope"
import { TypedMessageRouter } from "~/messaging/router"
import { listenForRuntimeMessages } from "~/messaging/runtime-transport"

import { queueFixture } from "../helpers/fixtures"

/** Exercises Chrome's broadcast runtime transport so unrelated contexts never steal a response. */
describe("runtime message routing", () => {
  it("silently ignores a broadcast addressed to another extension component", async () => {
    const router = new TypedMessageRouter("ui")
    const stopListening = listenForRuntimeMessages((message, sender) =>
      router.route(message, sender),
    )
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0]
    if (listener === undefined) throw new Error("Expected the runtime listener to be registered.")

    const sendResponse = vi.fn()
    const backgroundMessage = createMessage({
      kind: "queue/state/changed",
      source: "background",
      target: "background",
      payload: {
        queue: queueFixture({ promptIds: [] }),
      },
    })

    listener(backgroundMessage, { id: chrome.runtime.id }, sendResponse)
    await Promise.resolve()
    await Promise.resolve()

    expect(sendResponse).not.toHaveBeenCalled()
    stopListening()
  })
})
