import "@testing-library/jest-dom/vitest"

import { webcrypto } from "node:crypto"
import { cleanup } from "@testing-library/react"
import { afterEach, beforeEach, vi } from "vitest"

import { createChromeMock } from "./helpers/chrome-mock"

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto)
  vi.stubGlobal("chrome", createChromeMock())
})

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})
