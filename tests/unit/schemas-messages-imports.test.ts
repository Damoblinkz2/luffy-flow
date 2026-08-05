import { describe, expect, it } from "vitest"

import { createMessage } from "~/messaging/envelope"
import {
  luffyflowSettingsSchema,
  extensionMessageSchema,
  outputRecordSchema,
  promptRecordSchema,
  queueStateSchema,
} from "~/schemas"
import { PromptImportService } from "~/services/prompts/PromptImportService"

import { outputFixture, promptFixture, queueFixture } from "../helpers/fixtures"

describe("runtime schemas and messages", () => {
  it("accepts valid domain records and rejects malformed data", () => {
    expect(promptRecordSchema.parse(promptFixture())).toEqual(promptFixture())
    expect(outputRecordSchema.parse(outputFixture())).toEqual(outputFixture())
    expect(queueStateSchema.parse(queueFixture())).toEqual(queueFixture())
    expect(() => promptRecordSchema.parse(promptFixture({ text: " " }))).toThrow()
    expect(() => outputRecordSchema.parse(outputFixture({ generatedFilename: "" }))).toThrow()
    expect(() =>
      luffyflowSettingsSchema.parse({ schemaVersion: 1, maximumRetryCount: 99 }),
    ).toThrow()
  })

  it("validates both outbound and untrusted inbound messages", () => {
    const message = createMessage({
      kind: "queue/create",
      source: "popup",
      target: "background",
      payload: {
        platform: "gemini",
        promptTexts: ["A valid prompt"],
        delayMs: 1_000,
        adapterVersion: "test-1",
      },
    })
    expect(extensionMessageSchema.parse(message)).toEqual(message)
    expect(
      extensionMessageSchema.safeParse({
        ...message,
        target: "content",
        payload: { ...message.payload, delayMs: 5 },
      }).success,
    ).toBe(false)
  })
})

describe("prompt imports", () => {
  const options = { maxFileBytes: 10_000, maxPrompts: 10, maxPromptCharacters: 1_000 }

  it("imports one non-empty prompt per line from an uploaded TXT file", async () => {
    const service = new PromptImportService()
    const file = {
      name: "ideas.txt",
      size: 42,
      type: "text/plain",
      text: () => Promise.resolve("First prompt\n\n Second prompt \r\nThird prompt"),
    }

    const result = await service.importFile(file, options)

    expect(result.drafts.map((draft) => draft.text)).toEqual([
      "First prompt",
      "Second prompt",
      "Third prompt",
    ])
    expect(result.drafts.every((draft) => draft.source.format === "txt")).toBe(true)
    expect(result.rejectedCount).toBe(0)
  })

  it("rejects unsupported and oversized files without reading them", async () => {
    const service = new PromptImportService()
    const text = (): Promise<string> => Promise.resolve("secret")

    await expect(
      service.importFile({ name: "prompts.pdf", size: 6, type: "application/pdf", text }, options),
    ).resolves.toMatchObject({ drafts: [], issues: [{ code: "unsupported_file_type" }] })
    await expect(
      service.importFile({ name: "prompts.txt", size: 20_000, type: "text/plain", text }, options),
    ).resolves.toMatchObject({ drafts: [], issues: [{ code: "file_too_large" }] })
  })
})
