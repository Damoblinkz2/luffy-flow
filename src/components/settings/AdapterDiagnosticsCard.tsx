import { useMemo, useState } from "react"

import { Badge, Button, ErrorState } from "~/components/common"
import { LuffyflowError } from "~/errors/luffyflow-error"
import { useActivePlatform } from "~/hooks/useActivePlatform"
import { TypedMessageClient } from "~/messaging/client"
import { RuntimeMessageTransport } from "~/messaging/runtime-transport"
import { platformStatusSnapshotSchema, type PlatformStatusSnapshot } from "~/schemas"

export interface AdapterDiagnosticsCardProps {
  source: "dashboard" | "options"
}

/** Live diagnostics ask the active tab adapter for non-sensitive selector presence checks. */
export const AdapterDiagnosticsCard = ({ source }: AdapterDiagnosticsCardProps) => {
  const activePlatform = useActivePlatform()
  const client = useMemo(
    () => new TypedMessageClient(source, new RuntimeMessageTransport()),
    [source],
  )
  const [snapshot, setSnapshot] = useState<PlatformStatusSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const inspect = async (): Promise<void> => {
    const tabId = activePlatform.tabId
    if (tabId === undefined) {
      setError("Open a supported platform tab before running diagnostics.")
      return
    }
    setBusy(true)
    setError(null)
    setCopyMessage(null)
    try {
      setSnapshot(
        await client.send({
          kind: "platform/status/get",
          target: "background",
          payload: { tabId },
          responseSchema: platformStatusSnapshotSchema,
        }),
      )
    } catch (caught) {
      setError(
        caught instanceof LuffyflowError
          ? caught.userMessage
          : "The active tab did not respond. Reload it after updating LuffyFlow.",
      )
    } finally {
      setBusy(false)
    }
  }

  const copyEvidence = async (): Promise<void> => {
    if (snapshot?.adapterHealth === undefined) return
    const evidence = {
      recordedAt: new Date().toISOString(),
      browserUserAgent: navigator.userAgent,
      activeRoute: activePlatform.url,
      snapshot,
    }
    try {
      await copyText(JSON.stringify(evidence, null, 2))
      setCopyMessage("Sanitized adapter evidence copied.")
    } catch {
      setCopyMessage("Diagnostics could not be copied. Select the visible checks manually.")
    }
  }

  return (
    <section className="af-card space-y-3" aria-labelledby="adapter-diagnostics-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="adapter-diagnostics-title" className="text-lg font-semibold">
            Live adapter diagnostics
          </h2>
          <p className="af-muted">
            Checks selector presence without returning page text, prompts, outputs, query strings,
            or selector values.
          </p>
        </div>
        <Badge tone="warning">Selectors unverified</Badge>
      </div>
      <p className="text-sm">
        Active tab: {activePlatform.displayName ?? "Unsupported or unavailable"}
      </p>
      <Button
        variant="secondary"
        busy={busy}
        disabled={!activePlatform.supported}
        onClick={() => void inspect()}
      >
        Inspect active tab
      </Button>
      {snapshot?.adapterHealth === undefined ? null : (
        <Button variant="ghost" onClick={() => void copyEvidence()}>
          Copy sanitized evidence
        </Button>
      )}
      {copyMessage === null ? null : (
        <p className="text-sm" role="status">
          {copyMessage}
        </p>
      )}
      {error === null ? null : <ErrorState message={error} onRetry={() => void inspect()} />}
      {snapshot?.adapterHealth === undefined ? null : (
        <div>
          <p className="mb-2 text-sm font-medium">
            {snapshot.adapterHealth.adapterId} · {snapshot.ready ? "ready" : "not ready"} ·{" "}
            {snapshot.adapterHealth.status}
          </p>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {snapshot.adapterHealth.selectorChecks.map((check) => (
              <li key={check.key} className="rounded-lg border p-2">
                <span
                  className={check.found ? "text-emerald-700 dark:text-emerald-300" : "text-danger"}
                >
                  {check.found ? "Matched" : "Missing"}
                </span>{" "}
                · {check.key}
                {check.matchedFallbackIndex === undefined
                  ? ""
                  : ` · candidate ${check.matchedFallbackIndex + 1}`}
              </li>
            ))}
          </ul>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-foreground/65">
            {snapshot.adapterHealth.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/** Copies diagnostic JSON through the modern API with a user-gesture fallback for older Chromium. */
const copyText = async (value: string): Promise<void> => {
  if (navigator.clipboard?.writeText !== undefined) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Some extension contexts require the legacy selection path despite a direct button gesture.
    }
  }
  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand("copy")
  textarea.remove()
  if (!copied) throw new Error("The browser rejected the copy operation.")
}
