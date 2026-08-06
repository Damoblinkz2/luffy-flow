import { MAX_FILENAME_LENGTH } from "~/constants"
import { LuffyflowError } from "~/errors/luffyflow-error"

const ILLEGAL_FILENAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g
const RESERVED_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i

/** Filename sanitation is conservative across Chromium hosts, Windows, macOS, and Linux. */
export const sanitizeFilenamePart = (value: string): string => {
  const sanitized = value
    .normalize("NFKC")
    .replace(ILLEGAL_FILENAME_CHARACTERS, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[. -]+|[. -]+$/g, "")
  if (sanitized === "") return "untitled"
  return RESERVED_DEVICE_NAME.test(sanitized) ? `_${sanitized}` : sanitized
}

/** An extension is normalized separately so truncation cannot remove or corrupt it. */
export const buildSafeFilename = (base: string, extension: string): string => {
  const normalizedExtension = normalizeExtension(extension)
  const availableLength = MAX_FILENAME_LENGTH - normalizedExtension.length
  const safeBase = sanitizeFilenamePart(base)
    .slice(0, availableLength)
    .replace(/[. -]+$/g, "")
  return `${safeBase || "untitled"}${normalizedExtension}`
}

/** Converts an extension to a safe, lowercase dotted suffix with a binary fallback. */
export const normalizeExtension = (extension: string): string => {
  const candidate = extension.startsWith(".")
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`
  if (!/^\.[a-z0-9]{1,16}$/.test(candidate)) {
    throw new LuffyflowError({
      code: "FILENAME_EXTENSION_INVALID",
      category: "invalid_data",
      userMessage: "The output file extension is invalid.",
    })
  }
  return candidate
}

/** Renaming preserves the current extension and rejects path-like empty names. */
export const normalizeRenamedFilename = (
  requestedName: string,
  currentExtension: string,
): string => {
  const extension = normalizeExtension(currentExtension)
  const trimmed = requestedName.trim()
  const requestedWithoutExtension = trimmed.toLowerCase().endsWith(extension)
    ? trimmed.slice(0, -extension.length)
    : trimmed.replace(/\.[a-z0-9]{1,16}$/i, "")
  return buildSafeFilename(requestedWithoutExtension, extension)
}
