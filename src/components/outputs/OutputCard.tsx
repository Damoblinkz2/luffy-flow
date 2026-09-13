import { Badge, Button } from "~/components/common"
import type { OutputRecord } from "~/schemas"

export interface OutputCardProps {
  output: OutputRecord
  selected?: boolean | undefined
  compact?: boolean | undefined
  onSelect?: ((selected: boolean) => void) | undefined
  onRename?: (() => void) | undefined
  onDownload?: (() => void) | undefined
  onDelete?: (() => void) | undefined
}

/** Output cards render safe text/media metadata without injecting platform HTML. */
export const OutputCard = ({
  output,
  selected = false,
  compact = false,
  onSelect,
  onRename,
  onDownload,
  onDelete,
}: OutputCardProps) => {
  const filename = output.userDefinedName ?? output.generatedFilename
  const nativeFormat = mediaFormatLabel(output)
  const downloadLabel = output.outputType === "text" ? "Download" : `Download ${nativeFormat}`
  return (
    <article className="af-card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold" title={filename}>
            {filename}
          </h3>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge tone="info">{output.platform}</Badge>
            <Badge>{output.outputType}</Badge>
            {output.outputType === "text" ? null : <Badge tone="info">{nativeFormat}</Badge>}
            <Badge
              tone={
                output.downloadStatus === "failed"
                  ? "danger"
                  : output.downloadStatus === "completed"
                    ? "success"
                    : "neutral"
              }
            >
              {output.downloadStatus.replaceAll("_", " ")}
            </Badge>
          </div>
        </div>
        {onSelect === undefined ? null : (
          <input
            type="checkbox"
            aria-label={`Select ${filename}`}
            checked={selected}
            onChange={(event) => onSelect(event.target.checked)}
          />
        )}
      </div>
      {output.outputType === "image" && output.thumbnailUrl !== undefined ? (
        <img
          className="max-h-44 w-full rounded-xl object-cover"
          src={output.thumbnailUrl}
          alt={output.originalDetectedTitle ?? filename}
        />
      ) : null}
      {output.textContent === undefined ? null : (
        <p
          className={`whitespace-pre-wrap break-words text-sm ${compact ? "line-clamp-3" : "line-clamp-6"}`}
        >
          {output.textContent}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-1 text-xs text-foreground/65">
        <dt>Sequence</dt>
        <dd>#{output.sequenceNumber}</dd>
        <dt>Created</dt>
        <dd>{new Date(output.createdAt).toLocaleString()}</dd>
      </dl>
      {output.error === undefined ? null : (
        <p className="text-sm text-danger" role="alert">
          {output.error.userMessage}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {onDownload === undefined ? null : (
          <Button variant="secondary" onClick={onDownload}>
            {downloadLabel}
          </Button>
        )}
        {onRename === undefined ? null : (
          <Button variant="ghost" onClick={onRename}>
            Rename
          </Button>
        )}
        {onDelete === undefined ? null : (
          <Button variant="ghost" className="text-danger" onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
    </article>
  )
}

/** Labels the captured source format; media is downloaded natively rather than renamed as text. */
const mediaFormatLabel = (output: OutputRecord): string => {
  const extension =
    output.fileExtension ?? /\.[a-z0-9]{1,16}$/i.exec(output.generatedFilename)?.[0] ?? ".bin"
  return extension.slice(1).toUpperCase()
}
