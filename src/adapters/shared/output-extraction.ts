import type { DetectedOutput, OutputType } from "~/schemas"

/** Media extraction reads only already-rendered URLs and never fetches or bypasses signed resources. */
export const detectMediaOutput = (root: HTMLElement): DetectedOutput | null => {
  const media = firstSelfOrDescendant(root, "video, audio, img, a[download]")
  if (media === null) return null

  const type = mediaType(media)
  const sourceUrl = mediaSource(media)
  if (sourceUrl === undefined) return null
  const thumbnailUrl = media instanceof HTMLVideoElement ? safeHttpUrl(media.poster) : undefined
  const width =
    media instanceof HTMLImageElement
      ? media.naturalWidth || undefined
      : media instanceof HTMLVideoElement
        ? media.videoWidth || undefined
        : undefined
  const height =
    media instanceof HTMLImageElement
      ? media.naturalHeight || undefined
      : media instanceof HTMLVideoElement
        ? media.videoHeight || undefined
        : undefined
  const durationSeconds =
    media instanceof HTMLMediaElement && Number.isFinite(media.duration)
      ? media.duration
      : undefined
  const platformOutputId = outputId(root)
  const rawTitle = media.getAttribute("aria-label") ?? undefined
  const detectedTitle = rawTitle === undefined ? undefined : rawTitle.slice(0, 1_000)
  const detectedMimeType = declaredMimeType(media) ?? mimeType(sourceUrl, type)
  const detectedExtension = fileExtension(sourceUrl) ?? extensionForMime(detectedMimeType)

  return {
    type,
    sourceUrl,
    ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
    ...(detectedTitle === undefined ? {} : { detectedTitle }),
    ...(detectedMimeType === undefined ? {} : { mimeType: detectedMimeType }),
    ...(detectedExtension === undefined ? {} : { fileExtension: detectedExtension }),
    metadata: {
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
      ...(durationSeconds === undefined ? {} : { durationSeconds }),
    },
    ...(platformOutputId === undefined ? {} : { platformOutputId }),
    fingerprintSource: `${platformOutputId ?? "media"}:${sourceUrl}`.slice(0, 16_384),
    detectedAt: new Date().toISOString(),
  }
}

/** Text extraction deliberately scopes content to the adapter-selected response container. */
export const detectTextOutput = (root: HTMLElement): DetectedOutput | null => {
  const textContent = normalizeText(root.innerText || root.textContent || "").slice(0, 5_000_000)
  if (textContent.length === 0) return detectMediaOutput(root)
  const platformOutputId = outputId(root)
  const identity = normalizeText(textContent).slice(0, 15_000)
  return {
    type: "text",
    textContent,
    metadata: {},
    ...(platformOutputId === undefined ? {} : { platformOutputId }),
    fingerprintSource: `${platformOutputId ?? "text"}:${identity}`.slice(0, 16_384),
    detectedAt: new Date().toISOString(),
  }
}

/** Includes the root itself when locating the first output element matching a selector. */
const firstSelfOrDescendant = (
  root: HTMLElement,
  selector: string,
): HTMLMediaElement | HTMLImageElement | HTMLAnchorElement | null => {
  if (root.matches(selector)) {
    return root as HTMLMediaElement | HTMLImageElement | HTMLAnchorElement
  }
  return root.querySelector<HTMLMediaElement | HTMLImageElement | HTMLAnchorElement>(selector)
}

/** Reads the browser-resolved URL from supported media elements, rejecting empty sources. */
const mediaSource = (element: Element): string | undefined => {
  const raw =
    element instanceof HTMLImageElement
      ? element.currentSrc || element.src
      : element instanceof HTMLMediaElement
        ? element.currentSrc || element.src
        : element instanceof HTMLAnchorElement
          ? element.href
          : ""
  return safeHttpUrl(raw)
}

/** Maps a DOM media element to the output category persisted by the extension. */
const mediaType = (element: Element): OutputType => {
  if (element instanceof HTMLImageElement) return "image"
  if (element instanceof HTMLVideoElement) return "video"
  if (element instanceof HTMLAudioElement) return "audio"
  return "file"
}

/** Reuses a host-provided message identifier so repeated scans can deduplicate outputs. */
const outputId = (element: HTMLElement): string | undefined => {
  const owning = element.closest<HTMLElement>("[data-message-id], [data-output-id], [data-id]")
  const value =
    owning?.dataset.messageId ?? owning?.dataset.outputId ?? owning?.dataset.id ?? undefined
  return value === undefined || value.length === 0 ? undefined : value.slice(0, 512)
}

/** Accepts only downloadable HTTP(S) URLs and discards malformed or unsafe schemes. */
const safeHttpUrl = (value: string): string | undefined => {
  if (value.length === 0) return undefined
  try {
    const url = new URL(value, globalThis.location.href)
    const supported = url.protocol === "https:" || url.protocol === "http:"
    return supported && url.href.length <= 16_384 ? url.href : undefined
  } catch {
    return undefined
  }
}

/** Extracts a short extension from a validated URL pathname for MIME inference. */
const fileExtension = (value: string): string | undefined => {
  try {
    const match = /\.[a-z0-9]{1,16}$/i.exec(new URL(value).pathname)
    return match?.[0]?.toLocaleLowerCase()
  } catch {
    return undefined
  }
}

/** Infers common media MIME types while leaving unknown formats for the browser to resolve. */
const mimeType = (value: string, type: OutputType): string | undefined => {
  const extension = fileExtension(value)
  if (extension === ".png") return "image/png"
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg"
  if (extension === ".webp") return "image/webp"
  if (extension === ".gif") return "image/gif"
  if (extension === ".avif") return "image/avif"
  if (extension === ".mp4") return "video/mp4"
  if (extension === ".webm") return type === "audio" ? "audio/webm" : "video/webm"
  if (extension === ".mov") return "video/quicktime"
  if (extension === ".mp3") return "audio/mpeg"
  if (extension === ".wav") return "audio/wav"
  if (extension === ".m4a") return "audio/mp4"
  if (extension === ".ogg") return "audio/ogg"
  if (extension === ".flac") return "audio/flac"
  return undefined
}

/** Reads a platform-declared media MIME type without fetching cross-origin media. */
const declaredMimeType = (element: Element): string | undefined => {
  const candidate =
    element.getAttribute("type") ?? element.querySelector<HTMLSourceElement>("source[type]")?.type
  return candidate !== undefined && /^[a-z]+\/[a-z0-9.+-]+$/i.test(candidate)
    ? candidate
    : undefined
}

/** Supplies a safe suffix when a signed or CDN media URL does not contain a file extension. */
const extensionForMime = (mimeType: string | undefined): string | undefined => {
  if (mimeType === "image/png") return ".png"
  if (mimeType === "image/jpeg") return ".jpg"
  if (mimeType === "image/webp") return ".webp"
  if (mimeType === "image/gif") return ".gif"
  if (mimeType === "image/avif") return ".avif"
  if (mimeType === "video/mp4") return ".mp4"
  if (mimeType === "video/webm") return ".webm"
  if (mimeType === "video/quicktime") return ".mov"
  if (mimeType === "audio/mpeg") return ".mp3"
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") return ".wav"
  if (mimeType === "audio/mp4") return ".m4a"
  if (mimeType === "audio/ogg") return ".ogg"
  if (mimeType === "audio/flac") return ".flac"
  return undefined
}

/** Collapses presentation whitespace so captured text is stable across DOM layouts. */
const normalizeText = (value: string): string => value.replace(/\s+/g, " ").trim()
