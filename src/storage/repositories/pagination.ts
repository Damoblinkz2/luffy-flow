import { AutoflowError } from "~/errors/autoflow-error"
import type { PageRequest, PageResult } from "~/schemas"

const CURSOR_PREFIX = "offset:"

/** Local cursors are opaque to callers even though IndexedDB pages use stable array offsets. */
export const paginateRecords = <T>(records: T[], page: PageRequest): PageResult<T> => {
  const offset = decodeCursor(page.cursor)
  const items = records.slice(offset, offset + page.limit)
  const nextOffset = offset + items.length
  return {
    items,
    total: records.length,
    ...(nextOffset >= records.length ? {} : { nextCursor: `${CURSOR_PREFIX}${nextOffset}` }),
  }
}

const decodeCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) return 0
  if (!cursor.startsWith(CURSOR_PREFIX)) throw invalidCursorError()
  const offset = Number(cursor.slice(CURSOR_PREFIX.length))
  if (!Number.isSafeInteger(offset) || offset < 0) throw invalidCursorError()
  return offset
}

const invalidCursorError = () =>
  new AutoflowError({
    code: "PAGINATION_CURSOR_INVALID",
    category: "invalid_data",
    userMessage: "The requested history page is invalid.",
  })
