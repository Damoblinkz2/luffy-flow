import { z } from "zod"
import { describe, expect, it, vi } from "vitest"

import { QueueStateMachine } from "~/services/queue/QueueStateMachine"
import { QueueService } from "~/services/queue/QueueService"
import {
  buildSafeFilename,
  normalizeExtension,
  normalizeRenamedFilename,
  sanitizeFilenamePart,
} from "~/services/naming/filename"
import { OutputNamingService } from "~/services/naming/OutputNamingService"
import { LocalQueueRepository } from "~/storage/repositories/LocalQueueRepository"
import {
  LocalSequenceRepository,
  sequenceCounterCollectionSchema,
} from "~/storage/repositories/LocalSequenceRepository"
import { VersionedStorageNamespace } from "~/storage/VersionedStorageNamespace"

import {
  fixedClock,
  fixedNow,
  ids,
  outputFixture,
  promptFixture,
  queueFixture,
} from "../helpers/fixtures"
import {
  MemoryKeyValueStore,
  MemoryOutputRepository,
  MemoryPromptRepository,
} from "../helpers/memory"

describe("queue transitions", () => {
  it("enforces legal transitions and clears terminal run fields", () => {
    const machine = new QueueStateMachine()
    const running = queueFixture({
      status: "running",
      currentPromptId: ids.prompt,
      activeCommandId: "20000000-0000-4000-8000-000000000001",
      lease: {
        ownerId: "worker",
        generation: 0,
        acquiredAt: fixedNow.toISOString(),
        expiresAt: new Date(fixedNow.getTime() + 60_000).toISOString(),
      },
    })

    const completed = machine.transition(running, "completed")
    expect(completed.status).toBe("completed")
    expect(completed).not.toHaveProperty("currentPromptId")
    expect(completed).not.toHaveProperty("lease")
    expect(() => machine.transition(queueFixture(), "completed")).toThrow(
      expect.objectContaining({ code: "QUEUE_TRANSITION_INVALID" }),
    )
  })

  it("pauses, resumes, and enforces retry limits", async () => {
    const store = new MemoryKeyValueStore()
    const namespace = new VersionedStorageNamespace({
      key: "queue",
      currentVersion: 1,
      schema: z.custom<ReturnType<typeof queueFixture>>((value) => value !== null),
      store,
      now: fixedClock.now,
    })
    const queues = new LocalQueueRepository(namespace, fixedClock)
    const prompts = new MemoryPromptRepository()
    const service = new QueueService(queues, prompts, fixedClock)
    const created = await service.create({
      userId: ids.user,
      platform: "gemini",
      promptTexts: ["First prompt"],
      delayMs: 1_000,
      adapterVersion: "test-1",
      sessionId: ids.session,
    })
    const started = await service.start(created.id, created.revision, 7, "worker")
    const claimed = await service.claimNext(started.id, "worker", started.lease?.generation ?? -1)
    expect(claimed?.status).toBe("sending")
    if (claimed === null) throw new Error("Expected a claimed prompt")
    await service.markWaiting(claimed.id)

    const beforePause = await queues.getActive()
    if (beforePause === null) throw new Error("Expected an active queue")
    const paused = await service.pause(
      beforePause.id,
      beforePause.revision,
      "worker",
      "User paused",
    )
    expect(paused.status).toBe("paused")
    expect((await prompts.getById(claimed.id))?.status).toBe("failed")

    const retried = await service.retryPrompt(claimed.id, 1)
    expect(retried).toMatchObject({ status: "queued", retryCount: 1 })
    await service.failPrompt(retried.id, "TEST_FAILURE", "Failed again", false)
    await expect(service.retryPrompt(retried.id, 1)).rejects.toMatchObject({
      code: "PROMPT_RETRY_NOT_ALLOWED",
    })

    const latest = await queues.getActive()
    if (latest === null) throw new Error("Expected an active queue")
    const resumed = await service.resume(latest.id, latest.revision, 7, "worker")
    expect(resumed.status).toBe("running")
  })
})

describe("output naming", () => {
  it("sanitizes reserved/path-like names while preserving extensions", () => {
    expect(sanitizeFilenamePart(" CON: draft / one ")).toBe("CON-draft-one")
    expect(sanitizeFilenamePart("con")).toBe("_con")
    expect(buildSafeFilename("scene:name", "PNG")).toBe("scene-name.png")
    expect(normalizeRenamedFilename("new / title.txt", ".md")).toBe("new-title.md")
    expect(normalizeRenamedFilename("already.md", ".md")).toBe("already.md")
    expect(sanitizeFilenamePart(" . - ")).toBe("untitled")
    expect(() => normalizeExtension("not/an/extension")).toThrow(
      expect.objectContaining({ code: "FILENAME_EXTENSION_INVALID" }),
    )
  })

  it("persists sequences, resolves duplicates, and validates renames", async () => {
    const store = new MemoryKeyValueStore()
    const namespace = new VersionedStorageNamespace({
      key: "sequences",
      currentVersion: 1,
      schema: sequenceCounterCollectionSchema,
      store,
      now: fixedClock.now,
    })
    const sequences = new LocalSequenceRepository(namespace, fixedClock)
    const outputs = new MemoryOutputRepository()
    await outputs.createIfAbsent(outputFixture({ generatedFilename: "gemini-001.md" }))
    const naming = new OutputNamingService(sequences, outputs, fixedClock)
    const settings = {
      outputNamingPattern: "{platform}-{sequence}",
      sequencePadding: 3,
      sequenceScope: "global" as const,
      defaultOutputFileFormat: "md" as const,
    }

    await expect(
      naming.generate(
        promptFixture(),
        {
          type: "text",
          textContent: "result",
          metadata: {},
          fingerprintSource: "1234567890abcdef",
          detectedAt: fixedNow.toISOString(),
        },
        settings,
      ),
    ).resolves.toEqual({ filename: "gemini-001-2.md", sequenceNumber: 1 })
    expect(
      await new LocalSequenceRepository(namespace, fixedClock).peek(`user:${ids.user}:global`),
    ).toBe(1)

    await expect(naming.rename("old.md", "gemini-001", "different-id")).rejects.toMatchObject({
      code: "OUTPUT_FILENAME_DUPLICATE",
    })
    await expect(naming.rename("old.md", "fresh title", ids.output)).resolves.toBe("fresh-title.md")
  })

  it("uses explicit media extensions and allocates every sequence scope", async () => {
    const allocate = vi.fn<(scopeKey: string) => Promise<number>>((_scopeKey) => Promise.resolve(7))
    const naming = new OutputNamingService(
      { allocate, peek: () => Promise.resolve(0) },
      new MemoryOutputRepository(),
      fixedClock,
    )
    const detected = {
      type: "image" as const,
      fileExtension: ".webp",
      metadata: {},
      fingerprintSource: "1234567890abcdef",
      detectedAt: fixedNow.toISOString(),
    }
    const baseSettings = {
      outputNamingPattern: "{outputType}-{sequence}",
      sequencePadding: 2,
      defaultOutputFileFormat: "md" as const,
    }

    for (const sequenceScope of ["platform", "day", "session", "global"] as const) {
      await expect(
        naming.generate(promptFixture(), detected, { ...baseSettings, sequenceScope }),
      ).resolves.toEqual({ filename: "image-07.webp", sequenceNumber: 7 })
    }
    expect(allocate.mock.calls.map(([scope]) => scope)).toEqual([
      `user:${ids.user}:platform:gemini`,
      `user:${ids.user}:day:2026-08-04`,
      `user:${ids.user}:session:${ids.session}`,
      `user:${ids.user}:global`,
    ])
  })

  it("rejects unsupported tokens and unmatched naming braces before allocating", async () => {
    const allocate = vi.fn<(scopeKey: string) => Promise<number>>((_scopeKey) => Promise.resolve(1))
    const naming = new OutputNamingService(
      { allocate, peek: () => Promise.resolve(0) },
      new MemoryOutputRepository(),
      fixedClock,
    )
    const detected = {
      type: "text" as const,
      textContent: "result",
      metadata: {},
      fingerprintSource: "1234567890abcdef",
      detectedAt: fixedNow.toISOString(),
    }
    const settings = {
      sequencePadding: 3,
      sequenceScope: "global" as const,
      defaultOutputFileFormat: "md" as const,
    }

    await expect(
      naming.generate(promptFixture(), detected, {
        ...settings,
        outputNamingPattern: "{unsupported}",
      }),
    ).rejects.toMatchObject({ code: "OUTPUT_NAMING_TOKEN_INVALID" })
    await expect(
      naming.generate(promptFixture(), detected, {
        ...settings,
        outputNamingPattern: "{platform",
      }),
    ).rejects.toMatchObject({ code: "OUTPUT_NAMING_TOKEN_INVALID" })
    expect(allocate).not.toHaveBeenCalled()
  })
})
