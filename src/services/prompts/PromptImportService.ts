import Papa from "papaparse"

import {
  jsonPromptImportContentSchema,
  promptImportOptionsSchema,
  promptImportResultSchema,
  promptTextSchema,
  type ImportedPromptDraft,
  type PromptImportFormat,
  type PromptImportIssue,
  type PromptImportOptions,
  type PromptImportResult,
} from "~/schemas"
import { createId } from "~/utils/ids"

/** The browser File subset keeps imports testable without granting arbitrary filesystem access. */
export interface PromptImportFile {
  name: string
  size: number
  type: string
  text(): Promise<string>
}

/** Local prompt imports treat file extensions as authoritative and never upload file content. */
export class PromptImportService {
  async importFile(
    file: PromptImportFile,
    options: PromptImportOptions,
    signal?: AbortSignal,
  ): Promise<PromptImportResult> {
    const parsedOptions = promptImportOptionsSchema.parse(options)
    throwIfAborted(signal)
    const format = formatFromFilename(file.name)
    if (format === null) {
      return issueOnly("unsupported_file_type", "Choose a .txt, .csv, or .json file.")
    }
    if (file.size > parsedOptions.maxFileBytes) {
      return issueOnly(
        "file_too_large",
        "The selected prompt file exceeds the configured size limit.",
      )
    }

    const text = await file.text()
    throwIfAborted(signal)
    const source = {
      format,
      filename: file.name,
      byteSize: file.size,
      importedAt: new Date().toISOString(),
    }
    if (format === "txt") return this.fromRows(parseTxt(text), source, parsedOptions)
    if (format === "csv") {
      const rows = parseCsv(text, parsedOptions.csvColumn)
      return rows === null
        ? issueOnly("invalid_structure", "The CSV file could not be parsed safely.")
        : this.fromRows(rows, source, parsedOptions)
    }
    return this.fromJson(text, source, parsedOptions)
  }

  /** Pasted multi-prompt text uses the same one-non-empty-line rule as TXT files. */
  importText(text: string, options: PromptImportOptions): PromptImportResult {
    const parsedOptions = promptImportOptionsSchema.parse(options)
    return this.fromRows(
      parseTxt(text),
      { format: "text", importedAt: new Date().toISOString() },
      parsedOptions,
    )
  }

  private fromJson(
    text: string,
    source: ImportSource,
    options: PromptImportOptions,
  ): PromptImportResult {
    try {
      const parsedUnknown: unknown = JSON.parse(stripBom(text))
      const parsed = jsonPromptImportContentSchema.parse(parsedUnknown)
      const values = Array.isArray(parsed) ? parsed : parsed.prompts
      const rows = values.map((value, index) => ({
        row: index + 1,
        text: typeof value === "string" ? value : (value.prompt ?? value.text ?? ""),
      }))
      return this.fromRows(rows, source, options)
    } catch {
      return issueOnly("invalid_structure", "The JSON file must contain a supported prompt array.")
    }
  }

  private fromRows(
    rows: ParsedRow[],
    source: ImportSource,
    options: PromptImportOptions,
  ): PromptImportResult {
    const drafts: ImportedPromptDraft[] = []
    const issues: PromptImportIssue[] = []
    let rejectedCount = 0

    for (const row of rows) {
      if (drafts.length >= options.maxPrompts) {
        rejectedCount += 1
        continue
      }
      const parsed = promptTextSchema.max(options.maxPromptCharacters).safeParse(row.text)
      if (!parsed.success) {
        rejectedCount += 1
        issues.push({
          row: row.row,
          code: row.text.trim() === "" ? "empty_prompt" : "prompt_too_long",
          message:
            row.text.trim() === "" ? "Empty prompts are ignored." : "This prompt is too long.",
        })
        continue
      }
      drafts.push({
        clientId: createId(),
        text: parsed.data,
        source,
        sourceRow: row.row,
        selected: true,
      })
    }

    if (rows.length > options.maxPrompts) {
      issues.push({
        code: "too_many_prompts",
        message: `Only the first ${options.maxPrompts} valid prompts were imported.`,
      })
    }
    return promptImportResultSchema.parse({ drafts, issues, rejectedCount })
  }
}

type ImportSource = ImportedPromptDraft["source"]
interface ParsedRow {
  row: number
  text: string
}

const formatFromFilename = (filename: string): Exclude<PromptImportFormat, "text"> | null => {
  const extension = /\.([^.]+)$/.exec(filename.trim().toLowerCase())?.[1]
  return extension === "txt" || extension === "csv" || extension === "json" ? extension : null
}

const parseTxt = (text: string): ParsedRow[] =>
  stripBom(text)
    .split(/\r?\n/)
    .map((value, index) => ({ row: index + 1, text: value }))
    .filter((row) => row.text.trim() !== "")

/** Papa Parse handles quoted commas and multiline CSV values; the first column is the safe default. */
const parseCsv = (text: string, requestedColumn: string | undefined): ParsedRow[] | null => {
  const result = Papa.parse<string[]>(stripBom(text), { skipEmptyLines: "greedy" })
  if (result.errors.length > 0) return null
  const rows = result.data
  const header = rows[0] ?? []
  const normalizedRequested = requestedColumn?.trim().toLowerCase()
  const headerIndex = header.findIndex((value) => {
    const normalized = value.trim().toLowerCase()
    return normalized === (normalizedRequested ?? "prompt") || normalized === "text"
  })
  const hasHeader = headerIndex >= 0
  const columnIndex = hasHeader ? headerIndex : 0
  return rows.slice(hasHeader ? 1 : 0).map((row, index) => ({
    row: index + (hasHeader ? 2 : 1),
    text: row[columnIndex] ?? "",
  }))
}

const stripBom = (text: string): string => text.replace(/^\uFEFF/, "")

const issueOnly = (code: PromptImportIssue["code"], message: string): PromptImportResult =>
  promptImportResultSchema.parse({ drafts: [], issues: [{ code, message }], rejectedCount: 0 })

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) throw signal.reason
}
