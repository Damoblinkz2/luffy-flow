import { LuffyflowError } from "~/errors/luffyflow-error"
import {
  outputRecordSchema,
  type LuffyflowSettings,
  type DetectedOutput,
  type OutputRecord,
} from "~/schemas"
import { type OutputNamingService } from "~/services/naming/OutputNamingService"
import type { QueueService } from "~/services/queue/QueueService"
import type { OutputRepository, PromptRepository } from "~/storage/repositories/contracts"
import { sha256Hex } from "~/utils/digest"
import { createId } from "~/utils/ids"
import type { Clock } from "~/utils/time"
import { systemClock } from "~/utils/time"

export type OutputNamingSettings = Pick<
  LuffyflowSettings,
  "outputNamingPattern" | "sequencePadding" | "sequenceScope" | "defaultOutputFileFormat"
>

/** Output capture serializes deduplication, naming, and prompt completion as a replay-safe flow. */
export class OutputCaptureService {
  private operation: Promise<void> = Promise.resolve()

  /** Receives naming and repository dependencies used by the serialized capture pipeline. */
  constructor(
    private readonly prompts: PromptRepository,
    private readonly outputs: OutputRepository,
    private readonly naming: OutputNamingService,
    private readonly queue: QueueService,
    private readonly getNamingSettings: () => Promise<OutputNamingSettings>,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Deduplicates a detected response, generates its filename, and persists it atomically. */
  capture(promptId: string, detected: DetectedOutput): Promise<OutputRecord> {
    return this.runExclusive(async () => {
      const prompt = await this.prompts.getById(promptId)
      if (prompt === null) {
        throw new LuffyflowError({
          code: "OUTPUT_PROMPT_MISSING",
          category: "storage_failure",
          userMessage: "LuffyFlow could not find the prompt for this output.",
        })
      }
      const fingerprint = await sha256Hex(
        `${prompt.id}:${prompt.platform}:${detected.platformOutputId ?? detected.fingerprintSource}`,
      )
      const existing = await this.outputs.getByFingerprint(fingerprint)
      if (existing !== null) {
        if (prompt.status !== "completed") {
          await this.queue.completePrompt(prompt.id, existing.id)
        }
        return existing
      }

      const generated = await this.naming.generate(prompt, detected, await this.getNamingSettings())
      const now = this.clock.now().toISOString()
      const record = outputRecordSchema.parse({
        id: createId(),
        promptId: prompt.id,
        userId: prompt.userId,
        platform: prompt.platform,
        outputType: detected.type,
        originalDetectedTitle: detected.detectedTitle,
        sequenceNumber: generated.sequenceNumber,
        generatedFilename: generated.filename,
        textContent: detected.textContent,
        sourceUrl: detected.sourceUrl,
        thumbnailUrl: detected.thumbnailUrl,
        mimeType: detected.mimeType,
        fileExtension: extensionFromFilename(generated.filename),
        metadata: detected.metadata,
        fingerprint,
        createdAt: detected.detectedAt,
        updatedAt: now,
        downloadStatus: "not_requested",
        sessionId: prompt.sessionId,
        revision: 0,
        syncStatus: "local_only",
      })
      const saved = await this.outputs.createIfAbsent(record)
      await this.queue.completePrompt(prompt.id, saved.record.id)
      return saved.record
    })
  }

  /** Applies naming validation and updates the persisted output under optimistic locking. */
  async rename(
    outputId: string,
    expectedRevision: number,
    requestedName: string,
  ): Promise<OutputRecord> {
    const output = await this.outputs.getById(outputId)
    if (output === null) {
      throw new LuffyflowError({
        code: "OUTPUT_NOT_FOUND",
        category: "invalid_data",
        userMessage: "The requested output no longer exists.",
      })
    }
    const generatedFilename = await this.naming.rename(
      output.generatedFilename,
      requestedName,
      output.id,
    )
    return this.outputs.update(output.id, expectedRevision, {
      generatedFilename,
      userDefinedName: generatedFilename,
    })
  }

  /** Serializes capture operations so concurrent detections cannot allocate duplicate names. */
  private runExclusive<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    const result = this.operation.then(operation, operation)
    this.operation = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

/** Derives a persisted extension from the generated name, using .bin when unknown. */
const extensionFromFilename = (filename: string): string =>
  /\.[a-z0-9]{1,16}$/i.exec(filename)?.[0].toLowerCase() ?? ".bin"
