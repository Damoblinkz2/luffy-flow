import { LuffyflowError } from "~/errors/luffyflow-error"

/** Native setters and bubbling events match controlled React inputs without framework internals. */
export const setVisiblePromptValue = (element: HTMLElement, value: string): void => {
  assertVisible(element)
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set
    if (setter === undefined) throw inputUnavailableError()
    setter.call(element, value)
    element.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }),
    )
    element.dispatchEvent(new Event("change", { bubbles: true }))
    return
  }
  if (element.isContentEditable) {
    element.textContent = value
    element.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }),
    )
    element.dispatchEvent(new Event("change", { bubbles: true }))
    return
  }
  throw inputUnavailableError()
}

/** Visible controls are activated with their native click behavior only when enabled. */
export const clickVisibleControl = (element: HTMLElement): void => {
  assertVisible(element)
  if (element instanceof HTMLButtonElement && element.disabled) throw inputUnavailableError()
  if (element.getAttribute("aria-disabled") === "true") throw inputUnavailableError()
  element.focus({ preventScroll: true })
  element.click()
}

const inputUnavailableError = () =>
  new LuffyflowError({
    code: "PROMPT_INPUT_UNAVAILABLE",
    category: "prompt_input_unavailable",
    userMessage: "The platform prompt control is not currently available.",
    recoverable: true,
  })

const assertVisible = (element: HTMLElement): void => {
  if (!element.isConnected || element.getClientRects().length === 0) throw inputUnavailableError()
}
