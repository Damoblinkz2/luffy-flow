import { describe, expect, it, vi } from "vitest"

import { queueStateSchema } from "~/schemas"
import { DownloadService } from "~/services/downloads/DownloadService"
import { OutputNamingService } from "~/services/naming/OutputNamingService"
import { OutputCaptureService } from "~/services/outputs/OutputCaptureService"
import { PromptImportService } from "~/services/prompts/PromptImportService"
import { QueueService } from "~/services/queue/QueueService"
import { LocalQueueRepository } from "~/storage/repositories/LocalQueueRepository"
import {
  LocalSequenceRepository,
  sequenceCounterCollectionSchema,
} from "~/storage/repositories/LocalSequenceRepository"
import { VersionedStorageNamespace } from "~/storage/VersionedStorageNamespace"

import { chromeControls } from "../helpers/chrome-mock"
import { fixedClock, fixedNow, ids } from "../helpers/fixtures"
import {
  MemoryKeyValueStore,
  MemoryOutputRepository,
  MemoryPromptRepository,
} from "../helpers/memory"

describe("local automation workflow", () => {
  it("imports prompts, processes an adapter result, saves/names output, and downloads it", async () => {
    const keyValues = new MemoryKeyValueStore()
    const userId = ids.user

    const imported = await new PromptImportService().importFile(
      {
        name: "workflow.txt",
        size: 28,
        type: "text/plain",
        text: () => Promise.resolve("Write a moonlit harbor scene"),
      },
      { maxFileBytes: 1_000, maxPrompts: 10, maxPromptCharacters: 1_000 },
    )
    expect(imported.drafts).toHaveLength(1)

    const prompts = new MemoryPromptRepository()
    const outputs = new MemoryOutputRepository()
    const queueNamespace = new VersionedStorageNamespace({
      key: "integration.queue",
      currentVersion: 1,
      schema: queueStateSchema,
      store: keyValues,
      now: fixedClock.now,
    })
    const queues = new LocalQueueRepository(queueNamespace, fixedClock)
    const queueService = new QueueService(queues, prompts, fixedClock)
    const created = await queueService.create({
      userId,
      platform: "gemini",
      promptTexts: imported.drafts.map((draft) => draft.text),
      delayMs: 1_000,
      adapterVersion: "mock-adapter-1",
      sessionId: ids.session,
    })
    const running = await queueService.start(created.id, created.revision, 42, "integration-worker")
    const prompt = await queueService.claimNext(
      running.id,
      "integration-worker",
      running.lease?.generation ?? -1,
    )
    if (prompt === null) throw new Error("Expected a queued prompt")
    await queueService.markWaiting(prompt.id)

    const detectedOutput = {
      type: "text" as const,
      textContent: "The harbor rested under silver light.",
      metadata: {},
      platformOutputId: "mock-response-1",
      fingerprintSource: "mock-response-1:harbor",
      detectedAt: fixedNow.toISOString(),
    }
    const mockAdapter = {
      waitForGenerationComplete: vi.fn(() => Promise.resolve(detectedOutput)),
    }
    const detected = await mockAdapter.waitForGenerationComplete()

    const sequenceNamespace = new VersionedStorageNamespace({
      key: "integration.sequences",
      currentVersion: 1,
      schema: sequenceCounterCollectionSchema,
      store: keyValues,
      now: fixedClock.now,
    })
    const capture = new OutputCaptureService(
      prompts,
      outputs,
      new OutputNamingService(
        new LocalSequenceRepository(sequenceNamespace, fixedClock),
        outputs,
        fixedClock,
      ),
      queueService,
      () =>
        Promise.resolve({
          outputNamingPattern: "{platform}-{date}-{sequence}",
          sequencePadding: 3,
          sequenceScope: "global",
          defaultOutputFileFormat: "md",
        }),
      fixedClock,
    )
    const savedOutput = await capture.capture(prompt.id, detected)

    expect(savedOutput.generatedFilename).toBe("gemini-2026-08-04-001.md")
    expect(await outputs.getById(savedOutput.id)).toEqual(savedOutput)
    expect((await queues.getActive())?.status).toBe("completed")
    expect((await prompts.getById(prompt.id))?.outputIds).toContain(savedOutput.id)

    const downloads = new DownloadService({
      outputs,
      getAuthenticatedUserId: () => Promise.resolve(userId),
    })
    await downloads.request([savedOutput.id], "md")
    expect(chromeControls().downloadRequests[0]).toMatchObject({
      filename: "gemini-2026-08-04-001.md",
      saveAs: false,
    })
    chromeControls().emitDownloadChanged({ id: 1, state: { current: "complete" } })
    await expect
      .poll(async () => (await outputs.getById(savedOutput.id))?.downloadStatus)
      .toBe("completed")

    downloads.dispose()
  })
})
