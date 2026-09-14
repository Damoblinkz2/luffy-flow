import { expect, test, chromium, type BrowserContext, type Page } from "@playwright/test"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const extensionPath = path.resolve("build/chrome-mv3-prod")
const manifestPath = path.join(extensionPath, "manifest.json")
const liveApiUrl = "http://localhost:8787/api/v1"

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

test("supported AI pages receive the in-page LuffyFlow launcher", async () => {
  const page = await context.newPage()
  // Fulfilling a supported origin locally keeps the test deterministic while still
  // exercising the browser's real content-script match and Shadow-DOM mount path.
  await page.route("https://flow.google.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Google Flow test</title>",
    }),
  )
  await page.route("https://gemini.google.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Gemini test</title>" }),
  )
  // Google Flow uses client-side project routes rather than only its root URL.
  // This assertion protects recognition of the actual project workspace route.
  await page.goto("https://flow.google.com/projects/browser-test")
  const flowLauncher = page.locator("#luffyflow-in-page-panel-host")
  await expect(flowLauncher).toHaveCount(1)
  await expect(flowLauncher.getByRole("button", { name: "Open LuffyFlow" })).toBeVisible()
  await page.goto("https://gemini.google.com/app")
  const launcher = page.locator("#luffyflow-in-page-panel-host")
  await expect(launcher).toHaveCount(1)
  // The launcher delegates to Chrome's native, user-resizable side panel, then hides so the
  // platform page has one clear LuffyFlow entry point while the native panel is displayed.
  await expect(launcher.getByRole("button", { name: "Open LuffyFlow" })).toBeVisible()
  await launcher.getByRole("button", { name: "Open LuffyFlow" }).click()
  await expect(launcher.getByRole("button", { name: "Open LuffyFlow" })).toHaveCount(0)
  await expect(launcher.getByText(/Something went wrong/i)).toHaveCount(0)
  await page.close()
})

test("production login surface contains no seeded account or legacy mock state", async () => {
  const dashboard = await openSurface("tabs/dashboard.html#/login", "Welcome to LuffyFlow")
  await expect(dashboard.getByRole("button", { name: "Use demo account" })).toHaveCount(0)
  await expect(dashboard.getByText(/demo@luffyflow\.local/i)).toHaveCount(0)
  const legacyState = await dashboard.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get(
          ["luffyflow:auth", "luffyflow:mock-api", "luffyflow:mock-api-v2"],
          (values) => resolve(values),
        )
      }),
  )
  expect(legacyState).toEqual({})
  await dashboard.close()
})

test("development and production builds can reach the configured local API", async () => {
  test.setTimeout(120_000)
  test.skip(
    process.env.LUFFYFLOW_LIVE_API_TEST !== "1",
    "Set LUFFYFLOW_LIVE_API_TEST=1 while the local backend is running.",
  )

  for (const buildName of ["chrome-mv3-dev", "chrome-mv3-prod"]) {
    const buildPath = path.resolve("build", buildName)
    expect(existsSync(path.join(buildPath, "manifest.json"))).toBe(true)
    const liveContext = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${buildPath}`, `--load-extension=${buildPath}`],
    })

    try {
      // Discover the real ID assigned to this folder, then issue a browser CORS
      // request from the extension origin using the same header as ApiClient.
      let worker = liveContext.serviceWorkers()[0]
      worker ??= await liveContext.waitForEvent("serviceworker")
      const liveExtensionId = new URL(worker.url()).host
      const page = await liveContext.newPage()
      await page.goto(`chrome-extension://${liveExtensionId}/popup.html`)
      const result = await page.evaluate(async (baseUrl) => {
        try {
          const response = await fetch(`${baseUrl}/billing/token-packs`, {
            headers: { "X-Request-Id": crypto.randomUUID() },
          })
          const body = (await response.json()) as { items?: unknown[] }
          // An empty signup is intentionally rejected after reaching Fastify;
          // HTTP 400 proves the POST preflight passed without creating an account.
          const signupResponse = await fetch(`${baseUrl}/auth/signup`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Request-Id": crypto.randomUUID(),
            },
            body: "{}",
          })
          return {
            status: response.status,
            signupValidationStatus: signupResponse.status,
            itemCount: Array.isArray(body.items) ? body.items.length : -1,
            networkError: null,
          }
        } catch (error) {
          return {
            status: 0,
            signupValidationStatus: 0,
            itemCount: -1,
            networkError: String(error),
          }
        }
      }, liveApiUrl)

      expect(result, `${buildName}: ${result.networkError ?? "unexpected response"}`).toMatchObject(
        {
          status: 200,
          signupValidationStatus: 400,
          itemCount: 3,
          networkError: null,
        },
      )
    } finally {
      await liveContext.close()
    }
  }
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
