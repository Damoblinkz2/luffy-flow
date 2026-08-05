/** Safe automation defaults favor platform stability over submission speed. */
export const DEFAULT_PROMPT_DELAY_MS = 8_000
export const MINIMUM_PROMPT_DELAY_MS = 1_000
export const DEFAULT_MAXIMUM_RETRY_COUNT = 2

/** Import limits keep local parsing responsive on compact extension surfaces. */
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024
export const MAX_IMPORT_PROMPTS = 1_000
export const MAX_PROMPT_CHARACTERS = 100_000
export const ACCEPTED_PROMPT_FILE_EXTENSIONS = [".txt", ".csv", ".json"] as const

/** Generation timeouts are deliberately generous and remain adapter-configurable. */
export const DEFAULT_GENERATION_START_TIMEOUT_MS = 30_000
export const DEFAULT_GENERATION_COMPLETE_TIMEOUT_MS = 10 * 60_000

/** Naming defaults match the documented sequence-based output convention. */
export const DEFAULT_OUTPUT_NAMING_PATTERN = "{platform}-{date}-{sequence}-{promptSlug}"
export const DEFAULT_SEQUENCE_PADDING = 3
export const MAX_FILENAME_LENGTH = 255

/** API retries are bounded and apply only when the request policy marks them safe. */
export const DEFAULT_API_TIMEOUT_MS = 15_000
export const DEFAULT_API_RETRY_COUNT = 2
export const DEFAULT_API_RETRY_BASE_DELAY_MS = 400

/** Storage schema versions advance only alongside an idempotent migration. */
export const CURRENT_STORAGE_SCHEMA_VERSION = 1

/** Plan limits are mock product fixtures rather than payment-provider truth. */
export const MOCK_PLAN_LIMITS = {
  free: 20,
  pro: 1_000,
  business: 10_000,
} as const

export const DEMO_ACCOUNT = {
  email: "demo@luffyflow.local",
  password: "Demo123!",
} as const
