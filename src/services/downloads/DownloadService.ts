import JSZip from "jszip"

import { AutoflowError } from "~/errors/autoflow-error"
import type { TypedMessageRouter } from "~/messaging/router"
import type { OutputRecord, TextExportFormat } from "~/schemas"
import { buildSafeFilename } from "~/services/naming/filename"
import type { OutputRepository } from "~/storage/repositories/contracts"

const DOWNLOAD_SOURCES = ["dashboard", "sidepanel", "in_page_panel"] as const

export interface DownloadServiceOptions {
  outputs: OutputRepository
  getAuthenticatedUserId(): Promise<string>
}

/** Background-owned downloads validate ownership, schemes, filenames, and text serialization. */
export class DownloadService {
  private readonly tracked = new Map<number, string[]>()
  private readonly onChanged = (delta: chrome.downloads.DownloadDelta): void => {
    if (delta.state?.current === "complete") void this.finish(delta.id, true).catch(() => undefined)
    if (delta.state?.current === "interrupted")
      void this.finish(delta.id, false).catch(() => undefined)
  }

  constructor(private readonly options: DownloadServiceOptions) {
    chrome.downloads.onChanged.addListener(this.onChanged)
  }

  register(router: TypedMessageRouter): () => void {
    return router.register("download/request", DOWNLOAD_SOURCES, async (message) =>
      this.request(
        message.payload.outputIds,
        message.payload.exportFormat,
        message.payload.archiveName,
      ),
    )
  }

  async request(
    outputIds: string[],
    requestedFormat?: TextExportFormat | "native",
    archiveName?: string,
  ): Promise<OutputRecord[]> {
    const userId = await this.options.getAuthenticatedUserId()
    const records = await Promise.all(outputIds.map((id) => this.options.outputs.getById(id)))
    const outputs = records.filter((record): record is OutputRecord => record !== null)
    if (outputs.length !== outputIds.length || outputs.some((output) => output.userId !== userId)) {
      throw new AutoflowError({
        code: "DOWNLOAD_RECORD_FORBIDDEN",
        category: "authorization",
        userMessage: "One or more selected outputs are unavailable to this account.",
      })
    }

    try {
      const format =
        requestedFormat === undefined || requestedFormat === "native" ? "md" : requestedFormat
      const textOutputs = outputs.filter((output) => output.outputType === "text")
      if (outputs.length > 1 && textOutputs.length === outputs.length) {
        const downloadId = await this.downloadTextArchive(textOutputs, format, archiveName)
        this.tracked.set(
          downloadId,
          outputs.map((output) => output.id),
        )
      } else {
        for (const output of outputs) {
          const downloadId =
            output.outputType === "text"
              ? await this.downloadText(output, format)
              : await this.downloadRemote(output)
          this.tracked.set(downloadId, [output.id])
        }
      }

      return await Promise.all(
        outputs.map((output) =>
          this.options.outputs.update(output.id, output.revision, {
            downloadStatus: "downloading",
            error: null,
          }),
        ),
      )
    } catch (error) {
      await Promise.all(outputs.map((output) => this.markFailed(output.id)))
      throw error
    }
  }

  dispose(): void {
    chrome.downloads.onChanged.removeListener(this.onChanged)
    this.tracked.clear()
  }

  private async downloadText(output: OutputRecord, format: TextExportFormat): Promise<number> {
    const content = renderText(output, format)
    return startBrowserDownload({
      url: dataUrl(mimeForFormat(format), content),
      filename: filenameForText(output, format),
      saveAs: false,
    })
  }

  private async downloadTextArchive(
    outputs: OutputRecord[],
    format: TextExportFormat,
    requestedName?: string,
  ): Promise<number> {
    const archive = new JSZip()
    for (const output of outputs)
      archive.file(filenameForText(output, format), renderText(output, format))
    const base64 = await archive.generateAsync({ type: "base64", compression: "DEFLATE" })
    const filename = buildSafeFilename(requestedName ?? "autoflow-outputs", ".zip")
    return startBrowserDownload({
      url: `data:application/zip;base64,${base64}`,
      filename,
      saveAs: false,
    })
  }

  private downloadRemote(output: OutputRecord): Promise<number> {
    if (output.sourceUrl === undefined) throw unavailableMediaError()
    let url: URL
    try {
      url = new URL(output.sourceUrl)
    } catch {
      throw unavailableMediaError()
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw unavailableMediaError()
    return startBrowserDownload({
      url: url.href,
      filename: output.userDefinedName ?? output.generatedFilename,
      saveAs: false,
    })
  }

  private async finish(downloadId: number, succeeded: boolean): Promise<void> {
    const outputIds = this.tracked.get(downloadId)
    if (outputIds === undefined) return
    this.tracked.delete(downloadId)
    await Promise.all(
      outputIds.map(async (id) => {
        const output = await this.options.outputs.getById(id)
        if (output === null) return
        await this.options.outputs.update(
          id,
          output.revision,
          succeeded
            ? { downloadStatus: "completed", downloadedAt: new Date().toISOString(), error: null }
            : {
                downloadStatus: "failed",
                error: {
                  code: "BROWSER_DOWNLOAD_INTERRUPTED",
                  category: "download_failure",
                  userMessage: "The browser interrupted this download. You can retry safely.",
                },
              },
        )
      }),
    )
  }

  private async markFailed(id: string): Promise<void> {
    const output = await this.options.outputs.getById(id)
    if (output === null) return
    await this.options.outputs.update(id, output.revision, {
      downloadStatus: "failed",
      error: {
        code: "BROWSER_DOWNLOAD_FAILED",
        category: "download_failure",
        userMessage: "The browser could not start this download. You can retry safely.",
      },
    })
  }
}

const startBrowserDownload = (options: chrome.downloads.DownloadOptions): Promise<number> =>
  new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      const lastError = chrome.runtime.lastError
      if (lastError !== undefined || downloadId === undefined) {
        reject(
          new AutoflowError({
            code: "BROWSER_DOWNLOAD_FAILED",
            category: "download_failure",
            userMessage: "The browser could not start this download.",
            ...(lastError?.message === undefined ? {} : { diagnosticMessage: lastError.message }),
            recoverable: true,
          }),
        )
        return
      }
      resolve(downloadId)
    })
  })

const renderText = (output: OutputRecord, format: TextExportFormat): string => {
  const text = output.textContent ?? ""
  if (format === "json") {
    return JSON.stringify(
      {
        filename: output.userDefinedName ?? output.generatedFilename,
        platform: output.platform,
        createdAt: output.createdAt,
        text,
      },
      null,
      2,
    )
  }
  if (format === "csv")
    return `filename,platform,createdAt,text\r\n${[output.userDefinedName ?? output.generatedFilename, output.platform, output.createdAt, text].map(csvCell).join(",")}\r\n`
  if (format === "md") return `# ${output.userDefinedName ?? output.generatedFilename}\n\n${text}\n`
  return `${text}\n`
}

const filenameForText = (output: OutputRecord, format: TextExportFormat): string => {
  const current = output.userDefinedName ?? output.generatedFilename
  return buildSafeFilename(current.replace(/\.[a-z0-9]{1,16}$/i, ""), `.${format}`)
}

const dataUrl = (mimeType: string, content: string): string =>
  `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`

const mimeForFormat = (format: TextExportFormat): string => {
  if (format === "json") return "application/json"
  if (format === "csv") return "text/csv"
  if (format === "md") return "text/markdown"
  return "text/plain"
}

const csvCell = (value: string): string => `"${value.replaceAll('"', '""')}"`

const unavailableMediaError = () =>
  new AutoflowError({
    code: "DOWNLOAD_URL_UNAVAILABLE",
    category: "download_failure",
    userMessage:
      "This output does not expose an accessible HTTP(S) media URL. Revisit the platform and try again.",
    recoverable: true,
  })
