/** Result values make expected failures explicit without using exceptions for normal control flow. */
export type Result<TValue, TError> = { ok: true; value: TValue } | { ok: false; error: TError }

/** AsyncResult is used by ports whose failure is part of their public contract. */
export type AsyncResult<TValue, TError> = Promise<Result<TValue, TError>>
