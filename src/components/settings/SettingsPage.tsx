import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useState } from "react"
import { useForm, type UseFormRegisterReturn } from "react-hook-form"

import { useAuthStore } from "~/components/auth/AuthProvider"
import { Button, ConfirmDialog, ErrorState, LoadingState, SelectField } from "~/components/common"
import { applyTheme, useApplicationServices } from "~/components/common/ApplicationProviders"
import {
  luffyflowSettingsSchema,
  selectorOverridesSchema,
  type LuffyflowSettings,
  type SupportedPlatform,
} from "~/schemas"

import { AdapterDiagnosticsCard } from "./AdapterDiagnosticsCard"

const ADAPTERS: { id: SupportedPlatform; label: string }[] = [
  { id: "google-flow", label: "Google Flow" },
  { id: "gemini", label: "Gemini" },
  { id: "grok", label: "Grok" },
]

/** Settings use one Zod-backed form and keep advanced selector JSON non-executable. */
export const SettingsPage = ({ source = "dashboard" }: { source?: "dashboard" | "options" }) => {
  const services = useApplicationServices()
  const session = useAuthStore((state) => state.session)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [selectorJson, setSelectorJson] = useState<Record<SupportedPlatform, string>>({
    "google-flow": "{}",
    gemini: "{}",
    grok: "{}",
  })
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LuffyflowSettings>({ resolver: zodResolver(luffyflowSettingsSchema) })

  useEffect(() => {
    let active = true
    void services.settingsRepository.get().then(
      (settings) => {
        if (!active) return
        reset(settings)
        setSelectorJson({
          "google-flow": JSON.stringify(
            settings.platformAdapters["google-flow"].selectorOverrides,
            null,
            2,
          ),
          gemini: JSON.stringify(settings.platformAdapters.gemini.selectorOverrides, null, 2),
          grok: JSON.stringify(settings.platformAdapters.grok.selectorOverrides, null, 2),
        })
        setLoading(false)
      },
      () => {
        if (active) {
          setLoadError("LuffyFlow settings could not be loaded.")
          setLoading(false)
        }
      },
    )
    return () => {
      active = false
    }
  }, [reset, services])

  const save = async (values: LuffyflowSettings): Promise<void> => {
    setMessage(null)
    try {
      const overrides = {
        "google-flow": selectorOverridesSchema.parse(
          JSON.parse(selectorJson["google-flow"]) as unknown,
        ),
        gemini: selectorOverridesSchema.parse(JSON.parse(selectorJson.gemini) as unknown),
        grok: selectorOverridesSchema.parse(JSON.parse(selectorJson.grok) as unknown),
      }
      const parsed = luffyflowSettingsSchema.parse({
        ...values,
        platformAdapters: {
          "google-flow": {
            ...values.platformAdapters["google-flow"],
            selectorOverrides: overrides["google-flow"],
          },
          gemini: { ...values.platformAdapters.gemini, selectorOverrides: overrides.gemini },
          grok: { ...values.platformAdapters.grok, selectorOverrides: overrides.grok },
        },
        updatedAt: new Date().toISOString(),
      })
      const saved = await services.settingsRepository.save(parsed)
      reset(saved)
      applyTheme(saved.theme)
      setMessage("Settings saved. Reload open platform tabs after changing adapter settings.")
    } catch {
      setMessage(
        "Selector overrides must be a JSON object whose values are arrays of CSS selector strings.",
      )
    }
  }

  const clearData = async (): Promise<void> => {
    setConfirmClear(false)
    try {
      const queue = await services.repositories.queue.getActive()
      if (queue !== null && !["stopped", "completed", "failed"].includes(queue.status)) {
        setMessage("Stop the active queue before clearing local data.")
        return
      }
      const database = await services.repositories.database
      database.close()
      await clearChromeLocalStorage()
      await deleteIndexedDatabase("luffyflow-records")
      globalThis.location.reload()
    } catch {
      setMessage(
        "Local data could not be fully cleared. Close other LuffyFlow pages and reload before retrying.",
      )
    }
  }

  const exportLocalData = async (): Promise<void> => {
    if (session === null) return
    setMessage("Preparing local data export…")
    try {
      const [prompts, outputs, settings] = await Promise.all([
        readAllRecords((cursor) =>
          services.repositories.prompts.list({
            limit: 100,
            ...(cursor === undefined ? {} : { cursor }),
          }),
        ),
        readAllRecords((cursor) =>
          services.repositories.outputs.list({
            limit: 100,
            ...(cursor === undefined ? {} : { cursor }),
          }),
        ),
        services.settingsRepository.get(),
      ])
      await downloadJsonFile(`luffyflow-data-${new Date().toISOString().slice(0, 10)}.json`, {
        exportedAt: new Date().toISOString(),
        account: session.user,
        settings,
        prompts: prompts.filter((record) => record.userId === session.user.id),
        outputs: outputs.filter((record) => record.userId === session.user.id),
      })
      setMessage("Local data export started.")
    } catch {
      setMessage("Local data could not be exported.")
    }
  }

  if (loading) return <LoadingState label="Loading settings…" />
  if (loadError !== null) return <ErrorState message={loadError} />

  return (
    <section className="space-y-6" aria-labelledby="settings-title">
      <div>
        <h1 id="settings-title" className="text-2xl font-semibold">
          Settings
        </h1>
        <p className="af-muted">
          Automation defaults, naming, privacy, and advanced adapter maintenance.
        </p>
      </div>
      <form className="space-y-6" onSubmit={(event) => void handleSubmit(save)(event)} noValidate>
        <section
          className="af-card grid gap-4 md:grid-cols-2"
          aria-labelledby="automation-settings"
        >
          <h2 id="automation-settings" className="text-lg font-semibold md:col-span-2">
            Automation
          </h2>
          <NumberField
            id="default-delay"
            label="Default delay (milliseconds)"
            error={errors.defaultPromptDelayMs?.message}
            inputProps={register("defaultPromptDelayMs", { valueAsNumber: true })}
            min={1000}
            max={3600000}
          />
          <NumberField
            id="retry-count"
            label="Maximum retries"
            error={errors.maximumRetryCount?.message}
            inputProps={register("maximumRetryCount", { valueAsNumber: true })}
            min={0}
            max={10}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("autoSaveOutputs")} /> Automatically save detected
            outputs
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("autoDownloadOutputs")} /> Automatically download
            outputs
          </label>
        </section>

        <section className="af-card grid gap-4 md:grid-cols-2" aria-labelledby="naming-settings">
          <h2 id="naming-settings" className="text-lg font-semibold md:col-span-2">
            Output naming
          </h2>
          <div className="md:col-span-2">
            <label className="af-label" htmlFor="naming-pattern">
              Naming pattern
            </label>
            <input id="naming-pattern" className="af-field" {...register("outputNamingPattern")} />
            {errors.outputNamingPattern?.message === undefined ? null : (
              <p className="text-sm text-danger">{errors.outputNamingPattern.message}</p>
            )}
            <p className="mt-1 text-xs text-foreground/60">
              Tokens: {"{platform}"}, {"{date}"}, {"{time}"}, {"{sequence}"}, {"{promptSlug}"},{" "}
              {"{outputType}"}, {"{sessionId}"}
            </p>
          </div>
          <NumberField
            id="sequence-padding"
            label="Sequence padding"
            error={errors.sequencePadding?.message}
            inputProps={register("sequencePadding", { valueAsNumber: true })}
            min={1}
            max={12}
          />
          <SelectField id="sequence-scope" label="Sequence scope" {...register("sequenceScope")}>
            <option value="global">Global</option>
            <option value="platform">Per platform</option>
            <option value="day">Per day</option>
            <option value="session">Per session</option>
          </SelectField>
          <SelectField
            id="text-format"
            label="Default text format"
            {...register("defaultOutputFileFormat")}
          >
            <option value="txt">TXT</option>
            <option value="md">Markdown</option>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </SelectField>
        </section>

        <section className="af-card grid gap-4 md:grid-cols-2" aria-labelledby="appearance-privacy">
          <h2 id="appearance-privacy" className="text-lg font-semibold md:col-span-2">
            Appearance and privacy
          </h2>
          <SelectField id="theme" label="Theme" {...register("theme")}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </SelectField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("privacyMode")} /> Redact sensitive prompt content
            from logs
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("debugLogging")} /> Enable debug logging
          </label>
        </section>

        <section className="af-card grid gap-4 md:grid-cols-2" aria-labelledby="backend-settings">
          <h2 id="backend-settings" className="text-lg font-semibold md:col-span-2">
            Backend
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("useMockApi")} /> Use development mock API
          </label>
          <div className="md:col-span-2">
            <label className="af-label" htmlFor="backend-url">
              Backend base URL
            </label>
            <input
              id="backend-url"
              type="url"
              className="af-field"
              {...register("backendBaseUrl")}
            />
            {errors.backendBaseUrl?.message === undefined ? null : (
              <p className="text-sm text-danger">{errors.backendBaseUrl.message}</p>
            )}
            <p className="mt-1 text-xs text-foreground/60">
              Environment configuration still controls the current service graph until the surface
              reloads.
            </p>
          </div>
        </section>

        <section className="space-y-4" aria-labelledby="adapter-settings">
          <div>
            <h2 id="adapter-settings" className="text-lg font-semibold">
              Platform adapters
            </h2>
            <p className="af-muted">
              Selector overrides are advanced, unverified CSS fallbacks. Invalid JSON is rejected
              and never executed as code.
            </p>
          </div>
          {ADAPTERS.map(({ id, label }) => (
            <article key={id} className="af-card grid gap-3 md:grid-cols-2">
              <h3 className="font-semibold md:col-span-2">{label}</h3>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register(`platformAdapters.${id}.enabled`)} /> Enable
                adapter
              </label>
              <NumberField
                id={`${id}-start-timeout`}
                label="Start timeout (ms)"
                inputProps={register(`platformAdapters.${id}.generationStartTimeoutMs`, {
                  valueAsNumber: true,
                })}
                min={5000}
                max={300000}
              />
              <NumberField
                id={`${id}-complete-timeout`}
                label="Completion timeout (ms)"
                inputProps={register(`platformAdapters.${id}.generationCompleteTimeoutMs`, {
                  valueAsNumber: true,
                })}
                min={10000}
                max={1800000}
              />
              <div className="md:col-span-2">
                <label className="af-label" htmlFor={`${id}-selectors`}>
                  Selector overrides (JSON)
                </label>
                <textarea
                  id={`${id}-selectors`}
                  className="af-field min-h-32 font-mono text-xs"
                  value={selectorJson[id]}
                  spellCheck={false}
                  onChange={(event) =>
                    setSelectorJson((current) => ({ ...current, [id]: event.target.value }))
                  }
                />
              </div>
            </article>
          ))}
        </section>

        {message === null ? null : (
          <p className="rounded-xl border p-3 text-sm" role="status">
            {message}
          </p>
        )}
        <Button type="submit" busy={isSubmitting}>
          Save settings
        </Button>
      </form>

      <section className="af-card border-danger/40" aria-labelledby="local-data-title">
        <h2 id="local-data-title" className="text-lg font-semibold">
          Local data
        </h2>
        <p className="af-muted my-2">
          Clearing removes mock sessions, settings, queues, prompts, outputs, and sequence counters
          from this browser profile.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void exportLocalData()}>
            Export my local data
          </Button>
          <Button variant="danger" onClick={() => setConfirmClear(true)}>
            Clear all local data
          </Button>
        </div>
      </section>
      <AdapterDiagnosticsCard source={source} />
      <ConfirmDialog
        open={confirmClear}
        title="Clear all LuffyFlow data?"
        description="This cannot be undone. Download or export anything you need first."
        confirmLabel="Clear all data"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => void clearData()}
      />
    </section>
  )
}

interface NumberFieldProps {
  id: string
  label: string
  min: number
  max: number
  error?: string | undefined
  inputProps: UseFormRegisterReturn
}

const NumberField = ({ id, label, min, max, error, inputProps }: NumberFieldProps) => (
  <div>
    <label className="af-label" htmlFor={id}>
      {label}
    </label>
    <input id={id} className="af-field" type="number" min={min} max={max} {...inputProps} />
    {error === undefined ? null : <p className="mt-1 text-sm text-danger">{error}</p>}
  </div>
)

const clearChromeLocalStorage = (): Promise<void> =>
  new Promise((resolve, reject) =>
    chrome.storage.local.clear(() => {
      const lastError = chrome.runtime.lastError
      if (lastError === undefined) resolve()
      else reject(new Error(lastError.message))
    }),
  )

const deleteIndexedDatabase = (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error("IndexedDB deletion failed."))
    request.onblocked = () => reject(new Error("Close other LuffyFlow pages before clearing data."))
  })

const readAllRecords = async <T,>(
  read: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor?: string }>,
): Promise<T[]> => {
  const records: T[] = []
  let cursor: string | undefined
  do {
    const page = await read(cursor)
    records.push(...page.items)
    cursor = page.nextCursor
  } while (cursor !== undefined)
  return records
}

const downloadJsonFile = (filename: string, value: unknown): Promise<void> => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  )
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: true }, (downloadId) => {
      URL.revokeObjectURL(url)
      if (chrome.runtime.lastError !== undefined || downloadId === undefined) {
        reject(new Error(chrome.runtime.lastError?.message ?? "Data export download failed."))
        return
      }
      resolve()
    })
  })
}
