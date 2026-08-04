import { sha256Hex } from "~/utils/digest"

/** SHA-256 is adequate only for this development mock and is not production password storage. */
export const digestMockSecret = (value: string): Promise<string> => sha256Hex(value)

export const createMockSalt = (): string => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export const hashMockPassword = (password: string, salt: string): Promise<string> =>
  digestMockSecret(`${salt}:${password}`)

/** Constant-time comparison avoids teaching unsafe comparison patterns in replaceable auth code. */
export const equalSecretHashes = (left: string, right: string): boolean => {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}
