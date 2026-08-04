/** Browser-provided UUIDs are collision-resistant and avoid another runtime dependency. */
export const createId = (): string => crypto.randomUUID()

/** Correlation IDs intentionally share UUID semantics with message IDs. */
export const createCorrelationId = (): string => createId()
