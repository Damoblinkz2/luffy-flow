import { useEffect, useState } from "react"

import { Badge, Button, ErrorState, LoadingState } from "~/components/common"
import { useApplicationServices } from "~/components/common/ApplicationProviders"
import { OutputLibrary } from "~/components/outputs"
import { PromptComposer, PromptQueue } from "~/components/prompts"
import { useActivePlatform } from "~/hooks/useActivePlatform"
import { useQueueWorkspace } from "~/hooks/useQueueWorkspace"
import type { LuffyflowSettings } from "~/schemas"

type WorkspaceSource = "dashboard" | "sidepanel" | "in_page_panel"

export interface AutomationWorkspaceProps {
  source: WorkspaceSource
  compact?: boolean
}

/** The same workspace powers dashboard, side panel, and the isolated in-page fallback. */
export const AutomationWorkspace = ({ source, compact = false }: AutomationWorkspaceProps) => {
  const services = useApplicationServices()
  const activePlatform = useActivePlatform()
  const queue = useQueueWorkspace(source)
  const [settings, setSettings] = useState<LuffyflowSettings | null>(null)
  const [delayMs, setDelayMs] = useState(8_000)
  const [namingPattern, setNamingPattern] = useState("")
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void services.settingsRepository.get().then(
      (value) => {
        if (!active) return
        setSettings(value)
        setDelayMs(value.defaultPromptDelayMs)
        setNamingPattern(value.outputNamingPattern)
      },
      () => {
        if (active) setSettingsMessage("Automation settings could not be loaded.")
      },
    )
    return () => {
      active = false
    }
  }, [services])

  const saveWorkspaceDefaults = async (): Promise<void> => {
    if (
      settings === null ||
      delayMs < 1_000 ||
      delayMs > 3_600_000 ||
      namingPattern.trim() === ""
    ) {
      setSettingsMessage("Use a delay from 1,000 to 3,600,000 ms and a non-empty naming pattern.")
      return
    }
    try {
      const saved = await services.settingsRepository.save({
        ...settings,
        defaultPromptDelayMs: delayMs,
        outputNamingPattern: namingPattern.trim(),
        updatedAt: new Date().toISOString(),
      })
      setSettings(saved)
      setSettingsMessage("Workspace defaults saved.")
    } catch {
      setSettingsMessage("Workspace defaults could not be saved.")
    }
  }

  const addPrompts = (texts: string[]): Promise<void> => {
    if (
      !activePlatform.supported ||
      activePlatform.platform === undefined ||
      activePlatform.adapterVersion === undefined
    ) {
      return Promise.reject(new Error("Open Google Flow, Gemini, or Grok in the active tab first."))
    }
    return queue.addDrafts({
      texts,
      platform: activePlatform.platform,
      delayMs,
      adapterVersion: activePlatform.adapterVersion,
    })
  }

  if (settings === null && settingsMessage === null)
    return <LoadingState label="Preparing automation workspace…" />

  return (
    <div className={`space-y-5 ${compact ? "text-sm" : ""}`}>
      <section className="af-card" aria-labelledby="platform-status-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="platform-status-title" className="text-lg font-semibold">
              Platform status
            </h2>
            <p className="af-muted break-all">
              {activePlatform.url ?? "Inspecting the active tab…"}
            </p>
          </div>
          {activePlatform.loading ? (
            <Badge>Checking</Badge>
          ) : activePlatform.supported ? (
            <Badge tone="success">{activePlatform.displayName} supported</Badge>
          ) : (
            <Badge tone="warning">Unsupported page</Badge>
          )}
        </div>
        {activePlatform.error === undefined ? null : (
          <ErrorState message={activePlatform.error} onRetry={activePlatform.refresh} />
        )}
        {!activePlatform.loading && !activePlatform.supported ? (
          <p className="mt-3 text-sm">
            Open an official Google Flow, Gemini, or Grok page. LuffyFlow does not request access to
            unrelated sites.
          </p>
        ) : null}
      </section>

      <section
        className="af-card grid gap-3 md:grid-cols-2"
        aria-labelledby="workspace-defaults-title"
      >
        <div className="md:col-span-2">
          <h2 id="workspace-defaults-title" className="text-lg font-semibold">
            Queue defaults
          </h2>
          <p className="af-muted">Safe delay and sequential output naming.</p>
        </div>
        <div>
          <label className="af-label" htmlFor={`${source}-delay`}>
            Delay between prompts (ms)
          </label>
          <input
            id={`${source}-delay`}
            className="af-field"
            type="number"
            min={1000}
            max={3600000}
            value={delayMs}
            onChange={(event) => setDelayMs(event.target.valueAsNumber)}
          />
        </div>
        <div>
          <label className="af-label" htmlFor={`${source}-naming`}>
            Output naming pattern
          </label>
          <input
            id={`${source}-naming`}
            className="af-field"
            value={namingPattern}
            onChange={(event) => setNamingPattern(event.target.value)}
          />
        </div>
        <Button
          className="md:col-span-2 md:justify-self-start"
          variant="secondary"
          onClick={() => void saveWorkspaceDefaults()}
        >
          Save defaults
        </Button>
        {settingsMessage === null ? null : (
          <p className="text-sm md:col-span-2" role="status">
            {settingsMessage}
          </p>
        )}
      </section>

      <PromptComposer
        disabled={!activePlatform.supported || queue.queue?.status === "running"}
        onAdd={addPrompts}
      />
      <PromptQueue workspace={queue} activePlatform={activePlatform} />
      <OutputLibrary source={source} compact sessionId={queue.queue?.sessionId} />
    </div>
  )
}
