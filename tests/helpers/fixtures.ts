import type { OutputRecord, PromptRecord, QueueState } from "~/schemas"

export const ids = {
  user: "10000000-0000-4000-8000-000000000001",
  session: "10000000-0000-4000-8000-000000000002",
  queue: "10000000-0000-4000-8000-000000000003",
  prompt: "10000000-0000-4000-8000-000000000004",
  output: "10000000-0000-4000-8000-000000000005",
} as const

export const fixedNow = new Date("2026-08-04T12:34:56.000Z")
/** Returns a fresh Date on every call so tests cannot mutate shared clock state. */
export const fixedClock = { now: (): Date => new Date(fixedNow) }

/** Builds a valid prompt and lets each test override only fields relevant to its scenario. */
export const promptFixture = (overrides: Partial<PromptRecord> = {}): PromptRecord => ({
  id: ids.prompt,
  userId: ids.user,
  platform: "gemini",
  text: "Paint a quiet moonlit harbor",
  queuePosition: 0,
  status: "queued",
  createdAt: fixedNow.toISOString(),
  updatedAt: fixedNow.toISOString(),
  retryCount: 0,
  outputIds: [],
  sessionId: ids.session,
  adapterVersion: "test-adapter-1",
  revision: 0,
  syncStatus: "local_only",
  ...overrides,
})

/** Builds a valid queue connected to the shared prompt fixture identifiers. */
export const queueFixture = (overrides: Partial<QueueState> = {}): QueueState => ({
  id: ids.queue,
  userId: ids.user,
  sessionId: ids.session,
  platform: "gemini",
  status: "idle",
  promptIds: [ids.prompt],
  delayMs: 1_000,
  createdAt: fixedNow.toISOString(),
  updatedAt: fixedNow.toISOString(),
  revision: 0,
  ...overrides,
})

/** Builds a valid captured output connected to the shared prompt and session identifiers. */
export const outputFixture = (overrides: Partial<OutputRecord> = {}): OutputRecord => ({
  id: ids.output,
  promptId: ids.prompt,
  userId: ids.user,
  platform: "gemini",
  outputType: "text",
  sequenceNumber: 1,
  generatedFilename: "gemini-2026-08-04-001.md",
  textContent: "The harbor rested under silver light.",
  metadata: {},
  fingerprint: "0123456789abcdef0123456789abcdef",
  createdAt: fixedNow.toISOString(),
  updatedAt: fixedNow.toISOString(),
  downloadStatus: "not_requested",
  sessionId: ids.session,
  revision: 0,
  syncStatus: "local_only",
  ...overrides,
})
