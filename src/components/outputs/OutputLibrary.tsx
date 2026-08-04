import { useCallback, useEffect, useMemo, useState } from "react"
import { z } from "zod"

import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  SelectField,
  Button,
} from "~/components/common"
import { useApplicationServices } from "~/components/common/ApplicationProviders"
import { useAuthStore } from "~/components/auth/AuthProvider"
import { AutoflowError } from "~/errors/autoflow-error"
import { TypedMessageClient } from "~/messaging/client"
import { RuntimeMessageTransport } from "~/messaging/runtime-transport"
import {
  outputRecordSchema,
  type OutputRecord,
  type OutputType,
  type SupportedPlatform,
  type TextExportFormat,
} from "~/schemas"

import { OutputCard } from "./OutputCard"
import { RenameDialog } from "./RenameDialog"

type OutputUiSource = "dashboard" | "sidepanel" | "in_page_panel"
const FIRST_OUTPUT_PAGE = "__first_output_page__"

export interface OutputLibraryProps {
  source: OutputUiSource
  compact?: boolean
  sessionId?: string | undefined
  limit?: number
}

/** Output library provides local filtering, bulk selection, rename, download, and confirmed deletion. */
export const OutputLibrary = ({
  source,
  compact = false,
  sessionId,
  limit = compact ? 5 : 25,
}: OutputLibraryProps) => {
  const services = useApplicationServices()
  const userId = useAuthStore((state) => state.session?.user.id)
  const client = useMemo(
    () => new TypedMessageClient(source, new RuntimeMessageTransport()),
    [source],
  )
  const [outputs, setOutputs] = useState<OutputRecord[]>([])
  const [search, setSearch] = useState("")
  const [platform, setPlatform] = useState<SupportedPlatform | "all">("all")
  const [outputType, setOutputType] = useState<OutputType | "all">("all")
  const [sort, setSort] = useState<"created_desc" | "created_asc" | "platform" | "sequence">(
    "created_desc",
  )
  const [createdFrom, setCreatedFrom] = useState("")
  const [createdTo, setCreatedTo] = useState("")
  const [cursor, setCursor] = useState<string | undefined>()
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [renameTarget, setRenameTarget] = useState<OutputRecord | null>(null)
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [format, setFormat] = useState<TextExportFormat>("md")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    if (userId === undefined) return
    setLoading(true)
    try {
      const page = await services.repositories.outputs.list(
        {
          limit: Math.min(100, compact ? Math.max(limit, 5) : 25),
          ...(cursor === undefined ? {} : { cursor }),
        },
        {
          ...(search.trim() === "" ? {} : { search: search.trim() }),
          ...(platform === "all" ? {} : { platform: [platform] }),
          ...(outputType === "all" ? {} : { outputType: [outputType] }),
          ...(sessionId === undefined ? {} : { sessionId }),
          ...(createdFrom === ""
            ? {}
            : { createdFrom: new Date(`${createdFrom}T00:00:00`).toISOString() }),
          ...(createdTo === ""
            ? {}
            : { createdTo: new Date(`${createdTo}T23:59:59.999`).toISOString() }),
          sort,
        },
      )
      setOutputs(page.items.filter((output) => output.userId === userId).slice(0, limit))
      setNextCursor(page.nextCursor)
      setError(null)
    } catch (caught) {
      setError(messageFromError(caught))
    } finally {
      setLoading(false)
    }
  }, [
    compact,
    createdFrom,
    createdTo,
    cursor,
    limit,
    outputType,
    platform,
    search,
    services,
    sessionId,
    sort,
    userId,
  ])

  const resetPage = (): void => {
    setCursor(undefined)
    setCursorHistory([])
  }

  useEffect(() => {
    void load()
  }, [load])
  useEffect(
    () => setSelected(new Set()),
    [createdFrom, createdTo, cursor, outputType, platform, search, sort],
  )

  const rename = async (name: string): Promise<void> => {
    if (renameTarget === null) return
    setBusy(true)
    try {
      await client.send({
        kind: "output/rename",
        target: "background",
        payload: {
          outputId: renameTarget.id,
          expectedRevision: renameTarget.revision,
          requestedName: name,
        },
        responseSchema: outputRecordSchema,
      })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const download = async (ids: string[]): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await client.send({
        kind: "download/request",
        target: "background",
        payload: { outputIds: ids, exportFormat: format },
        responseSchema: z.array(outputRecordSchema),
      })
      await load()
    } catch (caught) {
      setError(messageFromError(caught))
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async (): Promise<void> => {
    const owned = outputs.filter(
      (output) => deleteIds.includes(output.id) && output.userId === userId,
    )
    setDeleteIds([])
    if (owned.length === 0) return
    setBusy(true)
    try {
      await services.repositories.outputs.deleteMany(owned.map((output) => output.id))
      setSelected(
        (current) =>
          new Set([...current].filter((id) => !owned.some((output) => output.id === id))),
      )
      await load()
    } catch (caught) {
      setError(messageFromError(caught))
    } finally {
      setBusy(false)
    }
  }

  const exportMetadata = async (): Promise<void> => {
    const owned = outputs.filter((output) => selected.has(output.id) && output.userId === userId)
    if (owned.length === 0) return
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(owned, null, 2)], { type: "application/json" }),
    )
    try {
      await new Promise<void>((resolve, reject) => {
        chrome.downloads.download(
          { url, filename: "autoflow-output-metadata.json", saveAs: true },
          (downloadId) => {
            const lastError = chrome.runtime.lastError
            if (lastError !== undefined || downloadId === undefined)
              reject(new Error(lastError?.message ?? "Metadata export failed."))
            else resolve()
          },
        )
      })
    } catch {
      setError("The browser could not export the selected output metadata.")
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  if (loading && outputs.length === 0) return <LoadingState label="Loading saved outputs…" />

  return (
    <section
      className="space-y-4"
      aria-labelledby={compact ? "latest-outputs-title" : "output-library-title"}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id={compact ? "latest-outputs-title" : "output-library-title"}
            className="text-xl font-semibold"
          >
            {compact ? "Latest outputs" : "Output library"}
          </h2>
          <p className="af-muted">Saved locally with conflict-safe revisions.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {error === null ? null : <ErrorState message={error} onRetry={() => void load()} />}
      {compact ? null : (
        <div className="af-card grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div>
            <label className="af-label" htmlFor="output-search">
              Search
            </label>
            <input
              id="output-search"
              className="af-field"
              value={search}
              placeholder="Filename or text"
              onChange={(event) => {
                setSearch(event.target.value)
                resetPage()
              }}
            />
          </div>
          <SelectField
            id="output-platform"
            label="Platform"
            value={platform}
            onChange={(event) => {
              setPlatform(event.target.value as SupportedPlatform | "all")
              resetPage()
            }}
          >
            <option value="all">All platforms</option>
            <option value="google-flow">Google Flow</option>
            <option value="gemini">Gemini</option>
            <option value="grok">Grok</option>
          </SelectField>
          <SelectField
            id="output-type"
            label="Output type"
            value={outputType}
            onChange={(event) => {
              setOutputType(event.target.value as OutputType | "all")
              resetPage()
            }}
          >
            <option value="all">All types</option>
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="file">File</option>
            <option value="unknown">Unknown</option>
          </SelectField>
          <SelectField
            id="output-sort"
            label="Sort"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as typeof sort)
              resetPage()
            }}
          >
            <option value="created_desc">Newest first</option>
            <option value="created_asc">Oldest first</option>
            <option value="platform">Platform</option>
            <option value="sequence">Sequence</option>
          </SelectField>
          <div>
            <label className="af-label" htmlFor="output-from">
              From
            </label>
            <input
              id="output-from"
              className="af-field"
              type="date"
              value={createdFrom}
              onChange={(event) => {
                setCreatedFrom(event.target.value)
                resetPage()
              }}
            />
          </div>
          <div>
            <label className="af-label" htmlFor="output-to">
              To
            </label>
            <input
              id="output-to"
              className="af-field"
              type="date"
              value={createdTo}
              onChange={(event) => {
                setCreatedTo(event.target.value)
                resetPage()
              }}
            />
          </div>
        </div>
      )}
      {!compact && outputs.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <SelectField
            id="download-format"
            label="Text format"
            value={format}
            onChange={(event) => setFormat(event.target.value as TextExportFormat)}
          >
            <option value="txt">TXT</option>
            <option value="md">Markdown</option>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </SelectField>
          <Button
            disabled={selected.size === 0 || busy}
            onClick={() => void download([...selected])}
          >
            Download selected
          </Button>
          <Button
            variant="secondary"
            disabled={selected.size === 0 || busy}
            onClick={() => void exportMetadata()}
          >
            Export metadata
          </Button>
          <Button
            variant="danger"
            disabled={selected.size === 0 || busy}
            onClick={() => setDeleteIds([...selected])}
          >
            Delete selected
          </Button>
        </div>
      ) : null}
      {outputs.length === 0 ? (
        <EmptyState
          title="No saved outputs"
          description="Generated outputs will appear here after a prompt completes."
        />
      ) : (
        <div className={compact ? "space-y-3" : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"}>
          {outputs.map((output) => (
            <OutputCard
              key={output.id}
              output={output}
              compact={compact}
              selected={selected.has(output.id)}
              onSelect={
                compact
                  ? undefined
                  : (checked) =>
                      setSelected((current) => {
                        const next = new Set(current)
                        if (checked) next.add(output.id)
                        else next.delete(output.id)
                        return next
                      })
              }
              onRename={() => setRenameTarget(output)}
              onDownload={() => void download([output.id])}
              onDelete={compact ? undefined : () => setDeleteIds([output.id])}
            />
          ))}
        </div>
      )}
      <RenameDialog
        output={renameTarget}
        busy={busy}
        onSave={rename}
        onClose={() => setRenameTarget(null)}
      />
      <ConfirmDialog
        open={deleteIds.length > 0}
        title={`Delete ${deleteIds.length} output${deleteIds.length === 1 ? "" : "s"}?`}
        description="This permanently removes the selected local output records. Downloaded files are not deleted."
        confirmLabel="Delete outputs"
        destructive
        onCancel={() => setDeleteIds([])}
        onConfirm={() => void confirmDelete()}
      />
      {compact ? null : (
        <div className="flex justify-between gap-2">
          <Button
            variant="secondary"
            disabled={cursorHistory.length === 0 || loading}
            onClick={() => {
              const history = [...cursorHistory]
              const previous = history.pop()
              setCursorHistory(history)
              setCursor(previous === FIRST_OUTPUT_PAGE ? undefined : previous)
            }}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={nextCursor === undefined || loading}
            onClick={() => {
              if (nextCursor === undefined) return
              setCursorHistory((current) => [...current, cursor ?? FIRST_OUTPUT_PAGE])
              setCursor(nextCursor)
            }}
          >
            Next
          </Button>
        </div>
      )}
    </section>
  )
}

const messageFromError = (error: unknown): string =>
  error instanceof AutoflowError
    ? error.userMessage
    : error instanceof Error
      ? error.message
      : "The output action failed."
