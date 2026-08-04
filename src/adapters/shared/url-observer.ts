/** SPA URL observation combines navigation events, DOM changes, and a low-frequency fallback. */
export const observeUrlChanges = (onChange: (url: URL) => void): (() => void) => {
  let current = globalThis.location.href
  const inspect = (): void => {
    if (globalThis.location.href === current) return
    current = globalThis.location.href
    onChange(new URL(current))
  }
  const observer = new MutationObserver(inspect)
  const fallback = setInterval(inspect, 1_000)
  globalThis.addEventListener("popstate", inspect)
  globalThis.addEventListener("hashchange", inspect)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    clearInterval(fallback)
    globalThis.removeEventListener("popstate", inspect)
    globalThis.removeEventListener("hashchange", inspect)
  }
}
