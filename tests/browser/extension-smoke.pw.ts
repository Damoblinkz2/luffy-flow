import { expect, test, chromium, type BrowserContext, type Page } from "@playwright/test"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const extensionPath = path.resolve("build/chrome-mv3-prod")
const manifestPath = path.join(extensionPath, "manifest.json")

let context: BrowserContext
let extensionId: string

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  if (!existsSync(manifestPath)) {
    throw new Error("The production extension is missing. Run `pnpm run build` first.")
  }

  // The Chromium channel uses Chrome for Testing, where unpacked-extension flags remain supported.
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  })

  // An install event wakes the MV3 worker and reveals the runtime-generated extension identifier.
  let worker = context.serviceWorkers()[0]
  worker ??= await context.waitForEvent("serviceworker")
  extensionId = new URL(worker.url()).host
})

test.afterAll(async () => {
  await context?.close()
})

test("production manifest keeps the extension surfaces and host access narrowly scoped", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    action?: { default_popup?: string }
    background?: { service_worker?: string }
    content_scripts?: { matches?: string[]; js?: string[] }[]
    host_permissions?: string[]
    options_ui?: { page?: string }
    side_panel?: { default_path?: string }
  }

  expect(manifest.action?.default_popup).toBe("popup.html")
  expect(manifest.side_panel?.default_path).toBe("sidepanel.html")
  expect(manifest.options_ui?.page).toBe("options.html")
  expect(manifest.background?.service_worker).toBe("static/background/index.js")
  expect(manifest.content_scripts).toHaveLength(1)
  expect(manifest.content_scripts?.[0]?.js).toHaveLength(1)
  expect(manifest.content_scripts?.[0]?.matches).not.toContain("<all_urls>")
  expect(manifest.host_permissions).not.toContain("<all_urls>")

  for (const relativePath of [
    "popup.html",
    "sidepanel.html",
    "options.html",
    "tabs/dashboard.html",
    manifest.background?.service_worker,
    manifest.content_scripts?.[0]?.js?.[0],
  ]) {
    expect(
      relativePath,
      "Every generated manifest entry must resolve to a packaged file.",
    ).toBeTruthy()
    if (relativePath === undefined) throw new Error("A generated manifest entry is missing.")
    expect(existsSync(path.join(extensionPath, relativePath))).toBe(true)
  }
})

test("signed-out popup, side panel, dashboard, and options surfaces render without runtime errors", async () => {
  const popup = await openSurface("popup.html", "Welcome to LuffyFlow")
  const sidePanel = await openSurface("sidepanel.html", "Log in to LuffyFlow")
  const dashboard = await openSurface("tabs/dashboard.html#/login", "Welcome to LuffyFlow")
  const options = await openSurface("options.html#/login", "Welcome to LuffyFlow")

  await Promise.all([popup.close(), sidePanel.close(), dashboard.close(), options.close()])
})

test("mock login persists across dashboard, popup, side panel, and options", async () => {
  const dashboard = await openSurface("tabs/dashboard.html#/login", "Welcome to LuffyFlow")
  await dashboard.getByRole("button", { name: "Use demo account" }).click()
  await expect(dashboard.locator("#login-email")).toHaveValue("demo@luffyflow.local")
  await dashboard.getByRole("button", { name: "Log in", exact: true }).click()
  await expect(dashboard.getByRole("heading", { name: "Overview" })).toBeVisible()

  const popup = await openSurface("popup.html", "LuffyFlow Demo")
  const sidePanel = await openSurface("sidepanel.html", "Platform workspace")
  const options = await openSurface("options.html", "Settings")

  await expect(popup.getByText("Logged in")).toBeVisible()
  await expect(sidePanel.getByText("Add prompts")).toBeVisible()
  await expect(options.getByRole("heading", { name: "Settings" })).toBeVisible()

  await Promise.all([popup.close(), sidePanel.close(), options.close(), dashboard.close()])
})

/** Opens an extension page, waits for its expected content, and fails on uncaught browser errors. */
const openSurface = async (relativeUrl: string, expectedText: string): Promise<Page> => {
  const page = await context.newPage()
  const runtimeErrors: string[] = []
  page.on("pageerror", (error) => runtimeErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text())
  })
  page.on("requestfailed", (request) => {
    runtimeErrors.push(
      `Request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown error"})`,
    )
  })

  await page.goto(`chrome-extension://${extensionId}/${relativeUrl}`)
  try {
    await expect(page.locator("body")).toContainText(expectedText)
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nRuntime errors:\n${runtimeErrors.join("\n") || "none captured"}`,
    )
  }
  await expect(page.getByText(/Something went wrong in/i)).toHaveCount(0)
  expect(runtimeErrors).toEqual([])
  return page
}
