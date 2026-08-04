import type { SelectorCandidate } from "~/adapters/contracts"

export interface SelectorMatch<T extends Element> {
  element: T
  candidate: SelectorCandidate
  candidateIndex: number
}

/** Invalid advanced-user selectors are skipped instead of breaking safer configured fallbacks. */
export const queryFirst = <T extends Element>(
  root: ParentNode,
  candidates: readonly SelectorCandidate[],
): SelectorMatch<T> | null => {
  for (const [candidateIndex, candidate] of candidates.entries()) {
    try {
      const element = root.querySelector<T>(candidate.query)
      if (element !== null) return { element, candidate, candidateIndex }
    } catch {
      // Selector health reporting will identify the invalid candidate without executing it.
    }
  }
  return null
}

/** All configured candidates are queried in priority order and duplicate nodes are removed. */
export const queryAll = <T extends Element>(
  root: ParentNode,
  candidates: readonly SelectorCandidate[],
): SelectorMatch<T>[] => {
  const seen = new Set<Element>()
  const matches: SelectorMatch<T>[] = []
  for (const [candidateIndex, candidate] of candidates.entries()) {
    try {
      for (const element of root.querySelectorAll<T>(candidate.query)) {
        if (seen.has(element)) continue
        seen.add(element)
        matches.push({ element, candidate, candidateIndex })
      }
    } catch {
      // Invalid selectors are surfaced by diagnostics without preventing safer fallbacks.
    }
  }
  return matches
}

export interface WaitForElementOptions<T extends Element> {
  root: Document | Element
  candidates: readonly SelectorCandidate[]
  timeoutMs: number
  signal: AbortSignal
  predicate?: (element: T) => boolean
}

/** Mutation observation is primary; a one-second fallback covers state changes without mutations. */
export const waitForElement = <T extends Element>(
  options: WaitForElementOptions<T>,
): Promise<SelectorMatch<T>> =>
  new Promise((resolve, reject) => {
    let settled = false
    const finish = (result: SelectorMatch<T>): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(asError(error))
    }
    const inspect = (): void => {
      const match = queryFirst<T>(options.root, options.candidates)
      if (match !== null && (options.predicate?.(match.element) ?? true)) finish(match)
    }
    const handleAbort = (): void => fail(abortReason(options.signal))
    const observer = new MutationObserver(inspect)
    const timeout = setTimeout(
      () => fail(new DOMException("Timed out waiting for a page element.", "TimeoutError")),
      options.timeoutMs,
    )
    const fallback = setInterval(inspect, 1_000)
    const cleanup = (): void => {
      observer.disconnect()
      clearTimeout(timeout)
      clearInterval(fallback)
      options.signal.removeEventListener("abort", handleAbort)
    }

    if (options.signal.aborted) {
      fail(abortReason(options.signal))
      return
    }
    options.signal.addEventListener("abort", handleAbort, { once: true })
    observer.observe(options.root, { childList: true, subtree: true, attributes: true })
    inspect()
  })

const abortReason = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The DOM operation was aborted.", "AbortError")

const asError = (value: unknown): Error =>
  value instanceof Error ? value : new Error("A DOM observation failed.", { cause: value })

export interface WaitForConditionOptions<T> {
  root: Document | Element
  timeoutMs: number
  signal: AbortSignal
  evaluate: () => T | null
}

/** Conditions use DOM observation first with a low-frequency fallback and full cleanup. */
export const waitForCondition = <T>(options: WaitForConditionOptions<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    let settled = false
    const cleanup = (): void => {
      observer.disconnect()
      clearTimeout(timeout)
      clearInterval(fallback)
      options.signal.removeEventListener("abort", handleAbort)
    }
    const finish = (value: T): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(asError(error))
    }
    const inspect = (): void => {
      try {
        const value = options.evaluate()
        if (value !== null) finish(value)
      } catch (error) {
        fail(error)
      }
    }
    const handleAbort = (): void => fail(abortReason(options.signal))
    const observer = new MutationObserver(inspect)
    const timeout = setTimeout(
      () => fail(new DOMException("Timed out waiting for a page condition.", "TimeoutError")),
      options.timeoutMs,
    )
    const fallback = setInterval(inspect, 1_000)

    if (options.signal.aborted) {
      fail(abortReason(options.signal))
      return
    }
    options.signal.addEventListener("abort", handleAbort, { once: true })
    observer.observe(options.root, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
    inspect()
  })
