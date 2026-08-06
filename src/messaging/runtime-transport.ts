import type { ExtensionMessage } from "~/schemas/messages"

export type IncomingMessageHandler = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
) => Promise<unknown>

export interface MessageTransport {
  send(message: ExtensionMessage): Promise<unknown>
}

/** Runtime transport sends messages to the background worker or another extension page. */
export class RuntimeMessageTransport implements MessageTransport {
  /** Wraps runtime.sendMessage and promotes Chrome's side-channel error into rejection. */
  send(message: ExtensionMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response: unknown) => {
        const lastError = chrome.runtime.lastError
        if (lastError !== undefined) {
          reject(new Error(lastError.message))
          return
        }
        resolve(response)
      })
    })
  }
}

/** Tab transport addresses the content script in one verified active tab. */
export class TabMessageTransport implements MessageTransport {
  /** Pins all messages from this transport to one previously verified browser tab. */
  constructor(private readonly tabId: number) {}

  /** Wraps tabs.sendMessage and promotes Chrome's side-channel error into rejection. */
  send(message: ExtensionMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(this.tabId, message, (response: unknown) => {
        const lastError = chrome.runtime.lastError
        if (lastError !== undefined) {
          reject(new Error(lastError.message))
          return
        }
        resolve(response)
      })
    })
  }
}

/** Listener registration preserves the callback identity required for cleanup. */
export const listenForRuntimeMessages = (handler: IncomingMessageHandler): (() => void) => {
  const listener = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): true => {
    void handler(message, sender).then(
      (response) => sendResponse(response),
      () => sendResponse(undefined),
    )
    return true
  }

  chrome.runtime.onMessage.addListener(listener)
  return () => chrome.runtime.onMessage.removeListener(listener)
}
