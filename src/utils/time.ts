/** A clock port makes latency, expiry, retry, and logging behavior deterministic in tests. */
export interface Clock {
  now(): Date
}

export const systemClock: Clock = {
  now: () => new Date(),
}

/** Abort-aware delay releases its timer and listener on every completion path. */
export const delay = (durationMs: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(abortError(signal))
      return
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort)
      resolve()
    }, durationMs)

    const handleAbort = (): void => {
      clearTimeout(timer)
      reject(abortError(signal))
    }

    signal?.addEventListener("abort", handleAbort, { once: true })
  })

const abortError = (signal: AbortSignal | undefined): Error =>
  signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError")
