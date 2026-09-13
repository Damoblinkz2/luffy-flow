# Stage 5: Queue and automation foundations

Stage 5 implements the durable queue, local record repositories, sequential naming, adapter
registry, shared DOM utilities, and background/content coordination. Platform-specific adapters and
their provisional selectors remain intentionally deferred to Stage 6.

## Queue lifecycle

The background worker is the only runtime allowed to acquire a running queue lease. Every control
message is runtime-validated, authenticated, ownership-checked, and protected by an expected queue
revision. Supported operations include creating a queue, adding/editing/removing/reordering prompts,
starting, pausing, resuming, stopping, retrying, and skipping.

Prompt state transitions cover queued, sending, waiting for output, completed, failed, skipped, and
cancelled records. Pausing an in-flight prompt marks it failed and requires an explicit retry because
silently resubmitting after an uncertain page operation could duplicate a platform request. Platform
rate limits and unavailable states pause rather than reduce delays or bypass restrictions.

An active content command ID and lease generation are persisted. On a Manifest V3 worker restart,
the new worker attempts to cancel that exact content command, marks an uncertain in-flight prompt as
failed, expires the old lease without resetting its generation, and stores `paused_recovery`. The
user must review and explicitly resume.

## Records and conflict handling

Prompt and output records use IndexedDB through the typed `idb` wrapper because prompt/output text
can exceed appropriate extension-storage sizes. Queue state, settings, and sequence counters remain
in separate versioned Plasmo storage namespaces.

- Prompt and output reads are Zod-validated.
- Mutable updates require the current revision and increment it automatically.
- Immutable IDs, ownership, creation time, and revisions cannot be patched.
- Optional error/timestamp fields use explicit null deletion semantics in repository patches.
- Output fingerprints are protected by a unique IndexedDB index.
- Output creation is idempotent and filename lookups support duplicate prevention.
- Repository contract tests add deterministic latency/failure behavior over an isolated
  backing repository while preserving the same contracts.

## Prompt import, including TXT upload

`PromptImportService.importFile` accepts a browser `File`-shaped object and processes its text
locally. It never uploads file content.

- `.txt` is first-class and uses one non-empty line per prompt, including BOM and CRLF handling.
- `.csv` uses Papa Parse for quoted commas and multiline cells. A configured column, `prompt`,
  `text`, or the first column is selected.
- `.json` accepts arrays of strings, prompt/text objects, or an object containing `prompts`.
- File size, prompt count, and prompt length limits are validated before queue creation.
- Import never starts automation; selected drafts must be explicitly added and started by the user.

The visible file picker and preview UI will be added in Stage 7 using this service.

## Sequential output naming

`OutputNamingService` supports `{platform}`, `{date}`, `{time}`, `{sequence}`, `{promptSlug}`,
`{outputType}`, and `{sessionId}`. Counters can be global, per platform, per day, or per session and
are additionally scoped by authenticated user. Counters are background-owned and persist across
popup closure and worker restarts.

Filename handling removes control/path/illegal characters, protects reserved device names, limits
the complete filename to 255 characters, preserves extensions on rename, and appends numeric suffixes
without truncating those suffixes when resolving duplicates.

## Browser coordination

The background coordinator performs this durable flow:

1. Authenticate and verify that the token wallet has at least one token.
2. Validate ownership and acquire a revisioned queue lease.
3. Persist the current prompt and content command ID.
4. Send a validated command to the configured target tab.
5. Let the content coordinator select an injected adapter for the current canonical URL.
6. Use the adapter contract to detect readiness, set text, submit, and observe generation.
7. Persist waiting status when generation starts.
8. Fingerprint, name, and create the output if absent.
9. Increment usage with an output-scoped idempotency key.
10. Complete the prompt, publish queue state, and honor the configured safe delay.

Shared DOM utilities use ordered selector candidates, native controlled-input setters, visible native
clicks, MutationObserver-based element/stability waits, AbortSignal cleanup, and a one-second fallback
for browser states that change without observable DOM mutation. No utility contains platform
selectors or bypass behavior.

## Files created in Stage 5

- `src/background.ts`
- `src/background/BackgroundQueueCoordinator.ts`
- `src/background/create-background-runtime.ts`
- `src/background/index.ts`
- `src/contents/ContentAutomationCoordinator.ts`
- `src/contents/create-content-coordinator.ts`
- `src/contents/register-content-handlers.ts`
- `src/contents/index.ts`
- `src/adapters/registry.ts`
- `src/adapters/index.ts`
- `src/adapters/shared/dom-query.ts`
- `src/adapters/shared/dom-events.ts`
- `src/adapters/shared/dom-stability.ts`
- `src/adapters/shared/url-observer.ts`
- `src/adapters/shared/index.ts`
- `src/storage/indexed-db/database.ts`
- `src/storage/indexed-db/index.ts`
- `src/storage/repositories/IndexedDbPromptRepository.ts`
- `src/storage/repositories/IndexedDbOutputRepository.ts`
- `src/storage/repositories/LocalQueueRepository.ts`
- `src/storage/repositories/LocalSequenceRepository.ts`
- `src/storage/repositories/LocalSettingsRepository.ts`
- `src/storage/repositories/create-local-repositories.ts`
- `src/storage/repositories/pagination.ts`
- `src/storage/repositories/repository-errors.ts`
- `src/services/queue/QueueStateMachine.ts`
- `src/services/queue/QueueService.ts`
- `src/services/queue/index.ts`
- `src/services/naming/filename.ts`
- `src/services/naming/OutputNamingService.ts`
- `src/services/naming/index.ts`
- `src/services/prompts/PromptImportService.ts`
- `src/services/prompts/index.ts`
- `src/services/outputs/OutputCaptureService.ts`
- `src/services/outputs/index.ts`
- `src/services/settings/create-settings-repository.ts`
- `src/services/settings/index.ts`
- `src/utils/digest.ts`
- `docs/stage-5-queue-and-automation.md`

Stage 5 also extends queue/message schemas, repository contracts, the Stage 4 composition root,
storage/service exports, and shared record validation.

## Validation and known limitations

- Node's TypeScript parser accepts all non-JSX TypeScript modules.
- All local TypeScript/TSX import targets resolve.
- Static scans reject `eval`, raw HTML injection, broad host permissions, and selector definitions in
  shared queue/content services.
- Full `tsc`, ESLint, Prettier, Vitest, and Plasmo build verification remains unavailable because
  registry access is offline and `node_modules` is absent.
- IndexedDB transactions provide record-level atomicity. Sequence and queue coordination rely on the
  documented single background-owner invariant because extension storage does not provide a general
  cross-context transaction primitive.
- Content coordinator bootstrapping awaits Stage 6 adapter registration. No live Google Flow,
  Gemini, or Grok selectors are claimed or included in this stage.
- A worker restart deliberately fails uncertain in-flight work rather than automatically replaying
  it. This can require a manual retry but avoids duplicate submissions.
- TXT represents one prompt per non-empty line. Use JSON/CSV or the manual editor for prompts that
  intentionally contain line breaks.
