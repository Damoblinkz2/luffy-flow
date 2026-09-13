import { z } from "zod"
import { describe, expect, it } from "vitest"

import { DownloadService } from "~/services/downloads/DownloadService"
import { LocalQueueRepository } from "~/storage/repositories/LocalQueueRepository"
import { VersionedStorageNamespace } from "~/storage/VersionedStorageNamespace"

import { chromeControls } from "../helpers/chrome-mock"
import { fixedClock, ids, outputFixture, queueFixture } from "../helpers/fixtures"
import { MemoryKeyValueStore, MemoryOutputRepository } from "../helpers/memory"

describe("repository operations", () => {
  it("round-trips versioned values and applies contiguous migrations", async () => {
    const store = new MemoryKeyValueStore()
    await store.set("preferences", {
      schemaVersion: 1,
      value: { label: "old" },
      updatedAt: "2026-01-01T00:00:00.000Z",
    })
    const namespace = new VersionedStorageNamespace({
      key: "preferences",
      currentVersion: 2,
      schema: z.object({ label: z.string(), migrated: z.boolean() }),
      store,
      migrations: [
        {
          fromVersion: 1,
          toVersion: 2,
          migrate: (value) => ({ ...(value as { label: string }), migrated: true }),
        },
      ],
      now: fixedClock.now,
    })

    await expect(namespace.get()).resolves.toEqual({ label: "old", migrated: true })
    await namespace.remove()
    await expect(namespace.get()).resolves.toBeNull()
  })

  it("rejects stale queue revisions", async () => {
    const namespace = new VersionedStorageNamespace({
      key: "queue",
      currentVersion: 1,
      schema: z.custom<ReturnType<typeof queueFixture>>((value) => value !== null),
      store: new MemoryKeyValueStore(),
      now: fixedClock.now,
    })
    const repository = new LocalQueueRepository(namespace, fixedClock)
    const saved = await repository.save(queueFixture())
    await expect(repository.save({ ...saved, status: "stopped" }, 99)).rejects.toMatchObject({
      code: "QUEUE_REVISION_CONFLICT",
    })
  })
})

describe("download filename generation", () => {
  it("changes text format extensions, starts a browser download, and records completion", async () => {
    const outputs = new MemoryOutputRepository()
    const original = outputFixture({ generatedFilename: "unsafe: title.md" })
    await outputs.createIfAbsent(original)
    const service = new DownloadService({
      outputs,
      getAuthenticatedUserId: () => Promise.resolve(ids.user),
    })

    const started = await service.request([original.id], "json")
    expect(started[0]?.downloadStatus).toBe("downloading")
    expect(chromeControls().downloadRequests[0]).toMatchObject({
      filename: "unsafe-title.json",
      saveAs: false,
    })
    expect(chromeControls().downloadRequests[0]?.url).toContain("application/json")

    chromeControls().emitDownloadChanged({ id: 1, state: { current: "complete" } })
    await expect
      .poll(async () => (await outputs.getById(original.id))?.downloadStatus)
      .toBe("completed")
    service.dispose()
  })

  it("rejects inaccessible media URLs and cross-account records", async () => {
    const outputs = new MemoryOutputRepository()
    await outputs.createIfAbsent(outputFixture({ outputType: "image" }))
    const service = new DownloadService({
      outputs,
      getAuthenticatedUserId: () => Promise.resolve(ids.user),
    })

    await expect(service.request([ids.output])).rejects.toMatchObject({
      code: "DOWNLOAD_URL_UNAVAILABLE",
    })
    const failed = await outputs.getById(ids.output)
    expect(failed?.downloadStatus).toBe("failed")
    service.dispose()
  })

  it("keeps a detected media extension and opens Chrome's folder picker when requested", async () => {
    const outputs = new MemoryOutputRepository()
    const original = outputFixture({
      outputType: "audio",
      generatedFilename: "ambient-loop.mp3",
      fileExtension: ".wav",
      mimeType: "audio/wav",
      sourceUrl: "https://cdn.example.test/generated-audio?signature=temporary",
    })
    await outputs.createIfAbsent(original)
    const service = new DownloadService({
      outputs,
      getAuthenticatedUserId: () => Promise.resolve(ids.user),
      getMediaDownloadLocation: () => Promise.resolve("choose_folder"),
    })

    await service.request([original.id], "native")

    expect(chromeControls().downloadRequests[0]).toMatchObject({
      url: original.sourceUrl,
      filename: "ambient-loop.wav",
      saveAs: true,
    })
    service.dispose()
  })
})
