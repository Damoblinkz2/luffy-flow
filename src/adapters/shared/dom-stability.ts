/** DOM stability waits for response-content changes, ignoring live UI attribute churn. */
export const waitForDomStability = (
  root: Node,
  quietMs: number,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<void> =>
  new Promise((resolve, reject) => {
    let quietTimer: ReturnType<typeof setTimeout> | undefined
    const finish = (): void => {
      cleanup()
      resolve()
    }
    const handleAbort = (): void => {
      cleanup()
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException("DOM stability wait aborted.", "AbortError"),
      )
    }
    const scheduleQuiet = (): void => {
      clearTimeout(quietTimer)
      quietTimer = setTimeout(finish, quietMs)
    }
    const observer = new MutationObserver(scheduleQuiet)
    const timeout = setTimeout(() => {
      cleanup()
      reject(new DOMException("DOM did not become stable in time.", "TimeoutError"))
    }, timeoutMs)
    const cleanup = (): void => {
      clearTimeout(quietTimer)
      clearTimeout(timeout)
      observer.disconnect()
      signal.removeEventListener("abort", handleAbort)
    }

    if (signal.aborted) {
      handleAbort()
      return
    }
    signal.addEventListener("abort", handleAbort, { once: true })
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    scheduleQuiet()
  })
