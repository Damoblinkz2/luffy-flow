import { LuffyflowError } from "~/errors/luffyflow-error"

/** Missing records and optimistic conflicts share consistent actionable errors. */
export const recordMissingError = (entity: "prompt" | "output" | "queue", id: string) =>
  new LuffyflowError({
    code: `${entity.toUpperCase()}_NOT_FOUND`,
    category: "invalid_data",
    userMessage: `The requested ${entity} no longer exists.`,
    details: { id },
  })

/** Reports the expected and actual revisions so callers can recover from a stale write. */
export const revisionConflictError = (
  entity: "prompt" | "output" | "queue",
  id: string,
  expectedRevision: number,
  actualRevision: number,
) =>
  new LuffyflowError({
    code: `${entity.toUpperCase()}_REVISION_CONFLICT`,
    category: "storage_failure",
    userMessage: `The ${entity} changed in another LuffyFlow context. Refresh and try again.`,
    recoverable: true,
    details: { id, expectedRevision, actualRevision },
  })

/** Constraint failures become domain errors without leaking browser implementation details. */
export const duplicateRecordError = (entity: "prompt" | "output") =>
  new LuffyflowError({
    code: `${entity.toUpperCase()}_DUPLICATE`,
    category: "invalid_data",
    userMessage: `This ${entity} has already been saved.`,
  })
