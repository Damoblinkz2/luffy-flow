import { MAX_FILENAME_LENGTH } from "~/constants"
import { AutoflowError } from "~/errors/autoflow-error"
import type {
  AutoflowSettings,
  DetectedOutput,
  OutputType,
  PromptRecord,
  SequenceScope,
} from "~/schemas"
import type { OutputRepository, SequenceRepository } from "~/storage/repositories/contracts"
import type { Clock } from "~/utils/time"
import { systemClock } from "~/utils/time"

import { buildSafeFilename, normalizeRenamedFilename } from "./filename"

const ALLOWED_PATTERN_TOKENS = new Set([
  "platform",
  "date",
  "time",
  "sequence",
  "promptSlug",
  "outputType",
  "sessionId",
])

const DEFAULT_EXTENSION_BY_TYPE: Record<OutputType, string> = {
  text: ".md",
  image: ".png",
  video: ".mp4",
  audio: ".mp3",
  file: ".bin",
  unknown: ".bin",
}

/** Generated names return the allocated number so output records persist both representations. */
export interface GeneratedOutputName {
  filename: string
  sequenceNumber: number
}

/** Naming allocates durable sequence numbers and resolves duplicate filenames deterministically. */
export class OutputNamingService {
  constructor(
    private readonly sequences: SequenceRepository,
    private readonly outputs: OutputRepository,
    private readonly clock: Clock = systemClock,
  ) {}

  async generate(
    prompt: PromptRecord,
    detected: DetectedOutput,
    settings: Pick<
      AutoflowSettings,
      "outputNamingPattern" | "sequencePadding" | "sequenceScope" | "defaultOutputFileFormat"
    >,
  ): Promise<GeneratedOutputName> {
    validatePattern(settings.outputNamingPattern)
    const now = this.clock.now()
    const sequenceNumber = await this.sequences.allocate(
      createScopeKey(prompt, settings.sequenceScope, now),
    )
    const extension =
      detected.fileExtension ??
      (detected.type === "text"
        ? `.${settings.defaultOutputFileFormat}`
        : DEFAULT_EXTENSION_BY_TYPE[detected.type])
    const values: Record<string, string> = {
      platform: prompt.platform,
      date: now.toISOString().slice(0, 10),
      time: now.toISOString().slice(11, 19).replace(/:/g, ""),
      sequence: String(sequenceNumber).padStart(settings.sequencePadding, "0"),
      promptSlug: prompt.text.slice(0, 80),
      outputType: detected.type,
      sessionId: prompt.sessionId,
    }
    const base = settings.outputNamingPattern.replace(
      /\{([^{}]+)\}/g,
      (_match, token: string) => values[token] ?? token,
    )
    const initial = buildSafeFilename(base, extension)
    return {
      filename: await this.resolveDuplicate(initial),
      sequenceNumber,
    }
  }

  async rename(currentFilename: string, requestedName: string, outputId: string): Promise<string> {
    const extensionMatch = /\.[a-z0-9]{1,16}$/i.exec(currentFilename)
    const normalized = normalizeRenamedFilename(requestedName, extensionMatch?.[0] ?? ".bin")
    if (await this.outputs.isFilenameTaken(normalized, outputId)) {
      throw new AutoflowError({
        code: "OUTPUT_FILENAME_DUPLICATE",
        category: "invalid_data",
        userMessage: "Another output already uses that filename.",
      })
    }
    return normalized
  }

  private async resolveDuplicate(filename: string): Promise<string> {
    if (!(await this.outputs.isFilenameTaken(filename))) return filename
    const extension = /\.[a-z0-9]{1,16}$/i.exec(filename)?.[0] ?? ".bin"
    const base = filename.slice(0, -extension.length)
    for (let suffix = 2; suffix <= 10_000; suffix += 1) {
      const suffixText = `-${suffix}`
      const maximumBaseLength = MAX_FILENAME_LENGTH - extension.length - suffixText.length
      const candidate = buildSafeFilename(
        `${base.slice(0, maximumBaseLength)}${suffixText}`,
        extension,
      )
      if (!(await this.outputs.isFilenameTaken(candidate))) return candidate
    }
    throw new AutoflowError({
      code: "OUTPUT_FILENAME_EXHAUSTED",
      category: "storage_failure",
      userMessage: "AutoFlow could not allocate a unique output filename.",
    })
  }
}

const createScopeKey = (prompt: PromptRecord, scope: SequenceScope, now: Date): string => {
  const prefix = `user:${prompt.userId}`
  if (scope === "platform") return `${prefix}:platform:${prompt.platform}`
  if (scope === "day") return `${prefix}:day:${now.toISOString().slice(0, 10)}`
  if (scope === "session") return `${prefix}:session:${prompt.sessionId}`
  return `${prefix}:global`
}

const validatePattern = (pattern: string): void => {
  const tokens = [...pattern.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1])
  const unsupported = tokens.find(
    (token) => token === undefined || !ALLOWED_PATTERN_TOKENS.has(token),
  )
  const unmatchedBraces = /[{}]/.exec(pattern.replace(/\{[^{}]+\}/g, "")) !== null
  if (unsupported !== undefined || unmatchedBraces) {
    throw new AutoflowError({
      code: "OUTPUT_NAMING_TOKEN_INVALID",
      category: "invalid_data",
      userMessage:
        unsupported === undefined
          ? "The output naming pattern contains unmatched braces."
          : `The output naming token {${unsupported}} is not supported.`,
    })
  }
}
