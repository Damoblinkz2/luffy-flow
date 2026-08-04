import { useRef, useState, type DragEvent } from "react"

import { Button, EmptyState } from "~/components/common"
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_PROMPTS, MAX_PROMPT_CHARACTERS } from "~/constants"
import type { ImportedPromptDraft, PromptImportIssue } from "~/schemas"
import { useApplicationServices } from "~/components/common/ApplicationProviders"

export interface PromptComposerProps {
  disabled?: boolean
  onAdd(texts: string[]): Promise<void>
}

const IMPORT_OPTIONS = {
  maxFileBytes: MAX_IMPORT_FILE_BYTES,
  maxPrompts: MAX_IMPORT_PROMPTS,
  maxPromptCharacters: MAX_PROMPT_CHARACTERS,
}

/** Prompt composition unifies typed, pasted, dropped, and uploaded files without auto-starting automation. */
export const PromptComposer = ({ disabled = false, onAdd }: PromptComposerProps) => {
  const { promptImportService } = useApplicationServices()
  const inputRef = useRef<HTMLInputElement>(null)
  const [editor, setEditor] = useState("")
  const [drafts, setDrafts] = useState<ImportedPromptDraft[]>([])
  const [issues, setIssues] = useState<PromptImportIssue[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const appendResult = (
    nextDrafts: ImportedPromptDraft[],
    nextIssues: PromptImportIssue[],
  ): void => {
    const available = Math.max(0, MAX_IMPORT_PROMPTS - drafts.length)
    setDrafts((current) => [...current, ...nextDrafts.slice(0, available)])
    setIssues(nextIssues)
    setMessage(
      nextDrafts.length === 0
        ? "No valid prompts were found."
        : `${Math.min(nextDrafts.length, available)} prompt${nextDrafts.length === 1 ? "" : "s"} ready for review.`,
    )
  }

  const stageTypedPrompts = (): void => {
    const result = promptImportService.importText(editor, IMPORT_OPTIONS)
    appendResult(result.drafts, result.issues)
    if (result.drafts.length > 0) setEditor("")
  }

  const importFile = async (file: File): Promise<void> => {
    setBusy(true)
    setMessage(`Reading ${file.name} locally…`)
    try {
      const result = await promptImportService.importFile(file, IMPORT_OPTIONS)
      appendResult(result.drafts, result.issues)
    } catch {
      setIssues([])
      setMessage("The prompt file could not be read.")
    } finally {
      setBusy(false)
      if (inputRef.current !== null) inputRef.current.value = ""
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files.item(0)
    if (file !== null) void importFile(file)
  }

  const updateDraft = (
    clientId: string,
    patch: Partial<Pick<ImportedPromptDraft, "text" | "selected">>,
  ): void => {
    setDrafts((current) =>
      current.map((draft) => (draft.clientId === clientId ? { ...draft, ...patch } : draft)),
    )
  }

  const moveDraft = (clientId: string, direction: -1 | 1): void => {
    setDrafts((current) => {
      const index = current.findIndex((draft) => draft.clientId === clientId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const reordered = [...current]
      const [moved] = reordered.splice(index, 1)
      if (moved === undefined) return current
      reordered.splice(target, 0, moved)
      return reordered
    })
  }

  const addSelected = async (): Promise<void> => {
    const selected = drafts.filter((draft) => draft.selected)
    const invalid = selected.find(
      (draft) => draft.text.trim().length === 0 || draft.text.trim().length > MAX_PROMPT_CHARACTERS,
    )
    if (invalid !== undefined) {
      setMessage("Fix empty or overlong selected prompts before adding them to the queue.")
      return
    }
    if (selected.length === 0) {
      setMessage("Select at least one reviewed prompt.")
      return
    }
    setBusy(true)
    try {
      await onAdd(selected.map((draft) => draft.text.trim()))
      const selectedIds = new Set(selected.map((draft) => draft.clientId))
      setDrafts((current) => current.filter((draft) => !selectedIds.has(draft.clientId)))
      setMessage(`${selected.length} prompt${selected.length === 1 ? "" : "s"} added to the queue.`)
    } catch {
      // Queue workspace renders the normalized error while keeping drafts available for retry.
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="af-card space-y-4" aria-labelledby="prompt-composer-title">
      <div>
        <h2 id="prompt-composer-title" className="text-lg font-semibold">
          Add prompts
        </h2>
        <p className="af-muted">
          One prompt per non-empty line. Review imports before adding them.
        </p>
      </div>

      <div>
        <label className="af-label" htmlFor="prompt-editor">
          Prompt editor
        </label>
        <textarea
          id="prompt-editor"
          className="af-field min-h-28 resize-y"
          value={editor}
          maxLength={MAX_PROMPT_CHARACTERS * 2}
          disabled={disabled || busy}
          placeholder="Describe a landing page…&#10;Summarize this concept…"
          onChange={(event) => setEditor(event.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={editor.trim().length === 0 || disabled}
            onClick={stageTypedPrompts}
          >
            Review typed prompts
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={editor.length === 0}
            onClick={() => setEditor("")}
          >
            Clear editor
          </Button>
        </div>
      </div>

      <div
        className={`rounded-2xl border-2 border-dashed p-4 text-center transition ${dragging ? "border-primary bg-primary/10" : "border-border"}`}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <p className="font-medium">Drop a prompt file here</p>
        <p className="af-muted mb-3">TXT, CSV, or JSON · parsed locally · maximum 2 MiB</p>
        <input
          ref={inputRef}
          id="prompt-file"
          className="sr-only"
          type="file"
          accept=".txt,.csv,.json,text/plain,text/csv,application/json"
          disabled={disabled || busy}
          onChange={(event) => {
            const file = event.target.files?.item(0)
            if (file !== null && file !== undefined) void importFile(file)
          }}
        />
        <label
          className="inline-flex cursor-pointer rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          htmlFor="prompt-file"
        >
          {busy ? "Reading file…" : "Choose prompt file"}
        </label>
      </div>

      {message === null ? null : (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}
      {issues.length === 0 ? null : (
        <ul
          className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"
          aria-label="Import warnings"
        >
          {issues.slice(0, 10).map((issue, index) => (
            <li key={`${issue.code}-${issue.row ?? index}`}>
              {issue.row === undefined ? "" : `Row ${issue.row}: `}
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {drafts.length === 0 ? (
        <EmptyState
          title="No reviewed prompts"
          description="Type prompts or upload a .txt, .csv, or .json file."
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              Review {drafts.length} prompt{drafts.length === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setDrafts((current) => current.map((draft) => ({ ...draft, selected: true })))
                }
              >
                Select all
              </Button>
              <Button type="button" variant="ghost" onClick={() => setDrafts([])}>
                Clear drafts
              </Button>
            </div>
          </div>
          <ol className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {drafts.map((draft, index) => (
              <li key={draft.clientId} className="rounded-xl border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={draft.selected}
                      onChange={(event) =>
                        updateDraft(draft.clientId, { selected: event.target.checked })
                      }
                    />
                    Prompt {index + 1}
                  </label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Move prompt ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => moveDraft(draft.clientId, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Move prompt ${index + 1} down`}
                      disabled={index === drafts.length - 1}
                      onClick={() => moveDraft(draft.clientId, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove prompt ${index + 1}`}
                      onClick={() =>
                        setDrafts((current) =>
                          current.filter((item) => item.clientId !== draft.clientId),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>
                <textarea
                  className="af-field min-h-20 resize-y"
                  aria-label={`Prompt ${index + 1} text`}
                  value={draft.text}
                  maxLength={MAX_PROMPT_CHARACTERS}
                  onChange={(event) => updateDraft(draft.clientId, { text: event.target.value })}
                />
                <p className="mt-1 text-xs text-foreground/60">
                  {draft.source.filename ?? "Typed text"} · source row {draft.sourceRow}
                </p>
              </li>
            ))}
          </ol>
          <Button type="button" busy={busy} disabled={disabled} onClick={() => void addSelected()}>
            Add selected to queue
          </Button>
        </div>
      )}
    </section>
  )
}
