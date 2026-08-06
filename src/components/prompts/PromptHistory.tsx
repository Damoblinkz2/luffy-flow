import { useCallback, useEffect, useMemo, useState } from "react"

import { useAuthStore } from "~/components/auth/AuthProvider"
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  SelectField,
  Badge,
} from "~/components/common"
import { useApplicationServices } from "~/components/common/ApplicationProviders"
import { LuffyflowError } from "~/errors/luffyflow-error"
import { TypedMessageClient } from "~/messaging/client"
import { RuntimeMessageTransport } from "~/messaging/runtime-transport"
import {
  promptRecordSchema,
  type PromptRecord,
  type PromptStatus,
  type QueueState,
  type SupportedPlatform,
} from "~/schemas"

const FIRST_PAGE = "__first_page__"

/** Prompt history supports validated filters, paging, retry, bulk selection, and confirmed deletion. */
export const PromptHistory = () => {
  const services = useApplicationServices()
  const userId = useAuthStore((state) => state.session?.user.id)
  const client = useMemo(
    () => new TypedMessageClient("dashboard", new RuntimeMessageTransport()),
    [],
  )
  const [records, setRecords] = useState<PromptRecord[]>([])
  const [activeQueue, setActiveQueue] = useState<QueueState | null>(null)
  const [search, setSearch] = useState("")
  const [platform, setPlatform] = useState<SupportedPlatform | "all">("all")
  const [status, setStatus] = useState<PromptStatus | "all">("all")
  const [sort, setSort] = useState<"created_desc" | "created_asc" | "platform">("created_desc")
  const [createdFrom, setCreatedFrom] = useState("")
  const [createdTo, setCreatedTo] = useState("")
  const [cursor, setCursor] = useState<string | undefined>()
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    if (userId === undefined) return
    setLoading(true)
    try {
      const [page, queue] = await Promise.all([
        services.repositories.prompts.list(
          { limit: 25, ...(cursor === undefined ? {} : { cursor }) },
          {
            ...(search.trim() === "" ? {} : { search: search.trim() }),
            ...(platform === "all" ? {} : { platform: [platform] }),
            ...(status === "all" ? {} : { status: [status] }),
            ...(createdFrom === ""
              ? {}
              : { createdFrom: new Date(`${createdFrom}T00:00:00`).toISOString() }),
            ...(createdTo === ""
              ? {}
              : { createdTo: new Date(`${createdTo}T23:59:59.999`).toISOString() }),
            sort,
          },
        ),
        services.repositories.queue.getActive(),
      ])
      setRecords(page.items.filter((record) => record.userId === userId))
      setActiveQueue(queue?.userId === userId ? queue : null)
      setNextCursor(page.nextCursor)
      setError(null)
    } catch (caught) {
      setError(messageFromError(caught))
    } finally {
      setLoading(false)
    }
  }, [createdFrom, createdTo, cursor, platform, search, services, sort, status, userId])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(
    () => setSelected(new Set()),
    [createdFrom, createdTo, cursor, platform, search, sort, status],
  )

  const retry = async (promptId: string): Promise<void> => {
    setBusy(true)
    try {
      await client.send({
        kind: "queue/prompt/retry",
        target: "background",
        payload: { promptId },
        responseSchema: promptRecordSchema,
      })
      await load()
    } catch (caught) {
      setError(messageFromError(caught))
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async (): Promise<void> => {
    const owned = records.filter(
      (record) => deleteIds.includes(record.id) && record.userId === userId,
    )
    setDeleteIds([])
    if (
      activeQueue !== null &&
      !["stopped", "completed", "failed"].includes(activeQueue.status) &&
      owned.some((record) => activeQueue.promptIds.includes(record.id))
    ) {
      setError("Stop the active queue before deleting one of its prompt records.")
      return
    }
    setBusy(true)
    try {
      await services.repositories.prompts.deleteMany(owned.map((record) => record.id))
      setSelected(
        (current) =>
          new Set([...current].filter((id) => !owned.some((record) => record.id === id))),
      )
      await load()
    } catch (caught) {
      setError(messageFromError(caught))
    } finally {
      setBusy(false)
    }
  }

  const resetPage = (): void => {
    setCursor(undefined)
    setCursorHistory([])
  }

  const exportSelected = async (format: "json" | "csv"): Promise<void> => {
    const owned = records.filter((record) => selected.has(record.id) && record.userId === userId)
    if (owned.length === 0) return
    const content =
      format === "json"
        ? JSON.stringify(owned, null, 2)
        : `id,platform,status,createdAt,prompt\r\n${owned
            .map((record) =>
              [record.id, record.platform, record.status, record.createdAt, record.text]
                .map(csvCell)
                .join(","),
            )
            .join("\r\n")}\r\n`
    try {
      await downloadHistoryFile(`luffyflow-prompt-history.${format}`, content, format)
    } catch {
      setError("The browser could not export the selected prompt history.")
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="prompt-history-title">
      <div>
        <h1 id="prompt-history-title" className="text-2xl font-semibold">
          Prompt history
        </h1>
        <p className="af-muted">Search and review locally stored prompt records.</p>
      </div>
      <div className="af-card grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div>
          <label className="af-label" htmlFor="history-search">
            Search
          </label>
          <input
            id="history-search"
            className="af-field"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              resetPage()
            }}
          />
        </div>
        <SelectField
          id="history-platform"
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
          <option value="meta-ai">Meta AI</option>
        </SelectField>
        <SelectField
          id="history-status"
          label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as PromptStatus | "all")
            resetPage()
          }}
        >
          <option value="all">All statuses</option>
          {[
            "draft",
            "queued",
            "sending",
            "waiting_for_output",
            "completed",
            "failed",
            "skipped",
            "cancelled",
          ].map((value) => (
            <option key={value} value={value}>
              {value.replaceAll("_", " ")}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="history-sort"
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
        </SelectField>
        <div>
          <label className="af-label" htmlFor="history-from">
            From
          </label>
          <input
            id="history-from"
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
          <label className="af-label" htmlFor="history-to">
            To
          </label>
          <input
            id="history-to"
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
      {error === null ? null : <ErrorState message={error} onRetry={() => void load()} />}
      {selected.size === 0 ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{selected.size} selected</span>
          <Button variant="secondary" disabled={busy} onClick={() => void exportSelected("json")}>
            Export JSON
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void exportSelected("csv")}>
            Export CSV
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => setDeleteIds([...selected])}>
            Delete selected
          </Button>
        </div>
      )}
      {loading && records.length === 0 ? (
        <LoadingState label="Loading prompt history…" />
      ) : records.length === 0 ? (
        <EmptyState
          title="No prompts found"
          description="Adjust filters or add prompts from the side panel."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-foreground/5">
              <tr>
                <th className="p-3">
                  <span className="sr-only">Select</span>
                </th>
                <th className="p-3">Prompt</th>
                <th className="p-3">Platform</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-t align-top">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={`Select prompt ${record.queuePosition + 1}`}
                      checked={selected.has(record.id)}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current)
                          if (event.target.checked) next.add(record.id)
                          else next.delete(record.id)
                          return next
                        })
                      }
                    />
                  </td>
                  <td className="max-w-md p-3">
                    <p className="line-clamp-3 whitespace-pre-wrap">{record.text}</p>
                    {record.errorMessage === undefined ? null : (
                      <p className="mt-1 text-danger">{record.errorMessage}</p>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge tone="info">{record.platform}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge
                      tone={
                        record.status === "failed"
                          ? "danger"
                          : record.status === "completed"
                            ? "success"
                            : "neutral"
                      }
                    >
                      {record.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td className="p-3">{new Date(record.createdAt).toLocaleString()}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {record.status === "failed" ? (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void retry(record.id)}
                        >
                          Retry
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        className="text-danger"
                        disabled={busy}
                        onClick={() => setDeleteIds([record.id])}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-between gap-2">
        <Button
          variant="secondary"
          disabled={cursorHistory.length === 0 || loading}
          onClick={() => {
            const history = [...cursorHistory]
            const previous = history.pop()
            setCursorHistory(history)
            setCursor(previous === FIRST_PAGE ? undefined : previous)
          }}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={nextCursor === undefined || loading}
          onClick={() => {
            if (nextCursor === undefined) return
            setCursorHistory((current) => [...current, cursor ?? FIRST_PAGE])
            setCursor(nextCursor)
          }}
        >
          Next
        </Button>
      </div>
      <ConfirmDialog
        open={deleteIds.length > 0}
        title={`Delete ${deleteIds.length} prompt${deleteIds.length === 1 ? "" : "s"}?`}
        description="This permanently removes the selected prompt records. Associated outputs are retained."
        confirmLabel="Delete prompts"
        destructive
        onCancel={() => setDeleteIds([])}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  )
}

/** Prefers safe domain messages and hides raw implementation details from the history UI. */
const messageFromError = (error: unknown): string =>
  error instanceof LuffyflowError
    ? error.userMessage
    : error instanceof Error
      ? error.message
      : "The prompt history action failed."

/** Escapes a history value so commas, quotes, and line breaks remain within one CSV cell. */
const csvCell = (value: string): string => `"${value.replaceAll('"', '""')}"`

/** Creates a temporary local URL, starts the export, and immediately releases that URL. */
const downloadHistoryFile = (
  filename: string,
  content: string,
  format: "json" | "csv",
): Promise<void> => {
  const mimeType = format === "json" ? "application/json" : "text/csv"
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }))
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: true }, (downloadId) => {
      URL.revokeObjectURL(url)
      const lastError = chrome.runtime.lastError
      if (lastError !== undefined || downloadId === undefined) {
        reject(new Error(lastError?.message ?? "History export failed."))
        return
      }
      resolve()
    })
  })
}
