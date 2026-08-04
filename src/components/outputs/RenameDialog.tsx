import { useEffect, useState } from "react"

import { Button } from "~/components/common"
import type { OutputRecord } from "~/schemas"

export interface RenameDialogProps {
  output: OutputRecord | null
  busy?: boolean
  onSave(name: string): Promise<void>
  onClose(): void
}

/** Renaming is explicit and preserves extension rules in the background naming service. */
export const RenameDialog = ({ output, busy = false, onSave, onClose }: RenameDialogProps) => {
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setName(output?.userDefinedName ?? output?.generatedFilename ?? "")
    setError(null)
  }, [output])
  if (output === null) return null

  const save = async (): Promise<void> => {
    if (name.trim().length === 0 || name.length > 255) {
      setError("Enter a filename between 1 and 255 characters.")
      return
    }
    try {
      await onSave(name)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The output could not be renamed.")
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="presentation">
      <section
        className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-title"
      >
        <h2 id="rename-title" className="text-lg font-semibold">
          Rename output
        </h2>
        <p className="af-muted mt-1">
          The existing extension is preserved unless the export format changes.
        </p>
        <label className="af-label mt-4" htmlFor="rename-output">
          Filename
        </label>
        <input
          id="rename-output"
          className="af-field"
          value={name}
          maxLength={255}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
        {error === null ? null : (
          <p className="mt-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} onClick={() => void save()}>
            Save name
          </Button>
        </div>
      </section>
    </div>
  )
}
