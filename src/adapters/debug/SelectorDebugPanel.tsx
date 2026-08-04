import { useCallback, useEffect, useState } from "react"

import type { PlatformAdapterRegistry } from "~/adapters/registry"

import { collectSelectorDebugSnapshot, type SelectorDebugSnapshot } from "./selector-diagnostics"

export interface SelectorDebugPanelProps {
  registry: PlatformAdapterRegistry
}

/** The panel reports selector presence only and never renders prompt or output content. */
export const SelectorDebugPanel = ({ registry }: SelectorDebugPanelProps) => {
  const [snapshot, setSnapshot] = useState<SelectorDebugSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const refresh = useCallback(() => setRefreshIndex((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    void collectSelectorDebugSnapshot(registry, controller.signal).then(setSnapshot, () => {
      if (!controller.signal.aborted) setError("Selector diagnostics could not be collected.")
    })
    return () => controller.abort()
  }, [registry, refreshIndex])

  return (
    <section aria-labelledby="autoflow-selector-debug-title">
      <h2 id="autoflow-selector-debug-title">Selector diagnostics</h2>
      <p>All Stage 6 selectors are provisional and require validation on an authenticated page.</p>
      <button type="button" onClick={refresh}>
        Refresh checks
      </button>
      {error === null ? null : <p role="alert">{error}</p>}
      {snapshot === null ? (
        <p aria-live="polite">Checking selectors…</p>
      ) : (
        <div aria-live="polite">
          <p>Page: {snapshot.page}</p>
          <p>Supported: {snapshot.supported ? "yes" : "no"}</p>
          {snapshot.adapterId === undefined ? null : <p>Adapter: {snapshot.adapterId}</p>}
          {snapshot.adapterVersion === undefined ? null : <p>Version: {snapshot.adapterVersion}</p>}
          {snapshot.message === undefined ? null : <p>{snapshot.message}</p>}
          {snapshot.health === undefined ? null : (
            <>
              <p>Health: {snapshot.health.status}</p>
              <ul>
                {snapshot.health.selectorChecks.map((check) => (
                  <li key={check.key}>
                    {check.key}: {check.found ? "matched" : "missing"}
                    {check.matchedFallbackIndex === undefined
                      ? ""
                      : ` (candidate ${check.matchedFallbackIndex + 1})`}
                  </li>
                ))}
              </ul>
              <ul>
                {snapshot.health.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}
