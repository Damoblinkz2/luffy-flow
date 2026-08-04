import { AutoflowError } from "~/errors/autoflow-error"

/** Missing records and optimistic conflicts share consistent actionable errors. */
export const recordMissingError = (entity: "prompt" | "output" | "queue", id: string) =>
  new AutoflowError({
    code: `${entity.toUpperCase()}_NOT_FOUND`,
    category: "invalid_data",
    userMessage: `The requested ${entity} no longer exists.`,
    details: { id },
  })

export const revisionConflictError = (
  entity: "prompt" | "output" | "queue",
  id: string,
  expectedRevision: number,
  actualRevision: number,
) =>
  new AutoflowError({
    code: `${entity.toUpperCase()}_REVISION_CONFLICT`,
    category: "storage_failure",
    userMessage: `The ${entity} changed in another AutoFlow context. Refresh and try again.`,
    recoverable: true,
    details: { id, expectedRevision, actualRevision },
  })

/** Constraint failures become domain errors without leaking browser implementation details. */
export const duplicateRecordError = (entity: "prompt" | "output") =>
  new AutoflowError({
    code: `${entity.toUpperCase()}_DUPLICATE`,
    category: "invalid_data",
    userMessage: `This ${entity} has already been saved.`,
  })
