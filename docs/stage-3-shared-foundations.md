# AutoFlow — Stage 3 Shared Foundations

**Status:** Implemented and structurally validated  
**Scope:** Domain validation, errors/logging, API transports, storage abstractions, and typed messaging

## Technical decisions

### Runtime-validated domain types

Zod schemas are the source of truth for persistent records, API payloads, file imports, adapter output, settings, and extension messages. TypeScript types are inferred from schemas wherever practical so runtime validation and compile-time expectations cannot drift independently.

Prompt imports model `.txt` as a first-class source alongside typed text, CSV, and JSON. The shared contracts enforce the documented 2 MiB and 1,000-prompt defaults, preserve source-row diagnostics, and accept the supported JSON shapes. Raw file bytes are not part of any persistent model.

### Error and logging boundary

`AutoflowError` provides stable codes, categories, recovery hints, correlation IDs, user-facing text, and optional diagnostics. Native causes and stack traces never cross storage or message boundaries.

The structured logger has injectable clocks and sinks. Redaction happens before a sink receives metadata. Tokens, passwords, authorization headers, cookies, API keys, and secrets are always redacted; prompt and output content are additionally redacted when privacy mode is enabled.

### API client and transports

The API client receives its transport, logger, token provider, and random source through dependency injection. It provides:

- Validated relative request paths and a fixed configured API origin.
- JSON serialization and Zod response parsing.
- Per-attempt `AbortController` timeouts combined with caller cancellation.
- Bearer-token attachment and a single token-refresh placeholder.
- Bounded exponential backoff with jitter.
- Automatic retry for GET requests only by default.
- Mutation retry only when the caller explicitly marks it safe and provides an idempotency key.
- No sensitive request-body logging.

`HttpTransport` contains the only production `fetch` behavior. `MockTransport` supports registered method/path handlers, configurable latency, deterministic random injection, simulated server failures, cancellation, and typed JSON responses. Stage 4 adds authentication, billing, and usage route handlers.

### Versioned storage

The generic key-value port separates application services from Plasmo Storage and future IndexedDB repositories. Every versioned namespace stores an envelope with schema version and update timestamp, validates reads and writes, rejects data written by a newer extension, and permits only contiguous forward migrations.

AutoFlow storage keys are centrally allowlisted. Clear-data features can remove those keys individually without calling a broad extension-storage clear operation. Repository ports define optimistic prompt/output updates, idempotent output creation, durable queue leases, sequence allocation, and settings persistence; concrete repositories arrive in Stage 5.

### Typed messaging

The message schema is a versioned discriminated union covering all required authentication, platform, queue, prompt, output, download, settings, usage, cancellation, and adapter-error events.

Outbound messages and inbound responses are validated. The router validates unknown input before dispatch, checks the message target, enforces a per-handler source allowlist, verifies Chrome `MessageSender` context is consistent with the claimed source, and returns correlated result envelopes instead of throwing across runtime boundaries.

## Files created

### Schemas and types

- `src/schemas/adapter.ts`
- `src/schemas/api.ts`
- `src/schemas/auth.ts`
- `src/schemas/billing.ts`
- `src/schemas/common.ts`
- `src/schemas/errors.ts`
- `src/schemas/import.ts`
- `src/schemas/index.ts`
- `src/schemas/messages.ts`
- `src/schemas/output.ts`
- `src/schemas/prompt.ts`
- `src/schemas/queue.ts`
- `src/schemas/settings.ts`
- `src/schemas/storage.ts`
- `src/types/index.ts`
- `src/types/result.ts`
- `src/adapters/contracts.ts`

### Configuration, errors, logging, and utilities

- `src/config/env.ts`
- `src/constants/index.ts`
- `src/errors/autoflow-error.ts`
- `src/logging/logger.ts`
- `src/utils/ids.ts`
- `src/utils/redaction.ts`
- `src/utils/time.ts`

### API layer

- `src/api/client/ApiClient.ts`
- `src/api/client/contracts.ts`
- `src/api/index.ts`
- `src/api/mock/MockTransport.ts`
- `src/api/transports/HttpTransport.ts`

### Storage layer

- `src/storage/contracts.ts`
- `src/storage/index.ts`
- `src/storage/migrations/registry.ts`
- `src/storage/PlasmoKeyValueStore.ts`
- `src/storage/repositories/contracts.ts`
- `src/storage/storage-keys.ts`
- `src/storage/VersionedStorageNamespace.ts`

### Messaging layer

- `src/messaging/client.ts`
- `src/messaging/envelope.ts`
- `src/messaging/index.ts`
- `src/messaging/router.ts`
- `src/messaging/runtime-transport.ts`

### Documentation and environment updates

- `docs/stage-3-shared-foundations.md`
- `.env.example` updated with the public API timeout setting.

## Validation performed

- All 41 Stage 3 TypeScript files passed Node's TypeScript syntax check with type transformation enabled.
- Every relative and `~/` aliased import resolves to an existing source file or index module.
- Package and manifest invariants from Stage 2 still pass.
- Static scans found no explicit `any`, `eval`, unresolved TODO/FIXME markers, `<all_urls>`, or direct console use outside the structured logging abstraction.
- Chrome sender-validation behavior was checked against the current Manifest V3 runtime and messaging documentation.
- Zod 4 discriminated-union and record syntax was checked against current Zod documentation.

## Assumptions and known limitations

- The execution environment still prevents a complete dependency installation, so `tsc`, ESLint, Prettier, Vitest, and Plasmo build verification remain pending. No partial dependency directory or invalid lockfile is retained.
- Mock route infrastructure exists, but mock authentication, billing, subscription, usage, and seeded records are Stage 4 work.
- Repository interfaces and versioned small-record storage exist, but concrete prompt/output/queue repositories and IndexedDB storage are Stage 5 work.
- File-content schemas exist, including `.txt`, but actual TXT/CSV/JSON parsing services and prompt-composer UI arrive in later queue/UI stages.
- Adapter contracts exist, but DOM utilities, registries, selectors, and live platform implementations are not part of Stage 3.
- Runtime sender checks establish extension/context consistency; platform-specific URL checks are additionally required in the Stage 5 content coordinator.
