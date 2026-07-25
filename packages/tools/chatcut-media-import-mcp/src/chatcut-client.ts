import { createHash } from "node:crypto"
import { lstat } from "node:fs/promises"
import type { MediaAssetType } from "./contracts.ts"
import type { PreparedMedia } from "./media.ts"

export const officialChatCutOrigin = "https://api.chatcut.io"

const endpointAttemptTimeoutMs = 60_000
const uploadAttemptTimeoutMs = 10 * 60_000
const maximumEndpointResponseBytes = 2 * 1024 * 1024
const maximumPresignedUrlLength = 16 * 1024
const maximumMultipartParts = 10_000
const multipartSignBatchSize = 100
const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504])

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

interface UploadSlot {
  fileKey: string
  multipartPartCount?: number
  multipartPartSizeBytes?: number
  multipartUploadId?: string
  presignedUrl: string
  readUrl: string
}

interface MultipartResult {
  parts: Array<{ ETag: string; PartNumber: number }>
  uploadId: string
}

export class ChatCutEndpointError extends Error {
  readonly diagnosticCode = "endpoint-rejected"
  readonly publicMessage = "The ChatCut media import session endpoint was rejected."

  constructor() {
    super("ChatCut media import endpoint did not match the official origin")
    this.name = "ChatCutEndpointError"
  }
}

export class ChatCutUploadError extends Error {
  readonly publicMessage = "ChatCut media import failed. Create a fresh import session and try again."

  constructor(readonly diagnosticCode: string) {
    super(`ChatCut media import failed (${diagnosticCode})`)
    this.name = "ChatCutUploadError"
  }
}

function abortError() {
  return new DOMException("ChatCut media import was cancelled", "AbortError")
}

function validatedEndpoint(value: string, allowedOrigin: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ChatCutEndpointError()
  }
  if (
    url.origin !== allowedOrigin
    || url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
    || url.hash !== ""
  ) {
    throw new ChatCutEndpointError()
  }
  return url
}

function validatedHttpsCapability(value: unknown) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximumPresignedUrlLength) {
    throw new ChatCutUploadError("upstream-envelope-rejected")
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ChatCutUploadError("upstream-envelope-rejected")
  }
  if (
    url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
    || url.hash !== ""
  ) {
    throw new ChatCutUploadError("upstream-envelope-rejected")
  }
  return url.toString()
}

function boundedString(value: unknown, maximum: number) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximum
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new ChatCutUploadError("upstream-envelope-rejected")
  }
  return value
}

function objectValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ChatCutUploadError("upstream-envelope-rejected")
  }
  return value as Record<string, unknown>
}

function positiveInteger(value: unknown, maximum: number) {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    throw new ChatCutUploadError("upstream-envelope-rejected")
  }
  return value as number
}

function parseUploadSlot(value: unknown): UploadSlot {
  const slot = objectValue(value)
  const multipartUploadId = slot.multipartUploadId === undefined
    ? undefined
    : boundedString(slot.multipartUploadId, 1_024)
  const multipartPartSizeBytes = slot.multipartPartSizeBytes === undefined
    ? undefined
    : positiveInteger(slot.multipartPartSizeBytes, 256 * 1024 * 1024)
  const multipartPartCount = slot.multipartPartCount === undefined
    ? undefined
    : positiveInteger(slot.multipartPartCount, maximumMultipartParts)
  if (
    multipartUploadId !== undefined
    && (multipartPartSizeBytes === undefined || multipartPartCount === undefined)
  ) {
    throw new ChatCutUploadError("upstream-envelope-rejected")
  }
  return {
    fileKey: boundedString(slot.fileKey, 4_096),
    ...(multipartPartCount === undefined ? {} : { multipartPartCount }),
    ...(multipartPartSizeBytes === undefined ? {} : { multipartPartSizeBytes }),
    ...(multipartUploadId === undefined ? {} : { multipartUploadId }),
    presignedUrl: validatedHttpsCapability(slot.presignedUrl),
    readUrl: validatedHttpsCapability(slot.readUrl),
  }
}

async function readBoundedResponse(response: Response) {
  if (!response.body) return ""
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maximumEndpointResponseBytes) {
        throw new ChatCutUploadError("upstream-envelope-rejected")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

function retryDelay(attempt: number) {
  return attempt * 250
}

async function abortableDelay(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) throw abortError()
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (operation: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      operation()
    }
    const onAbort = () => finish(() => reject(abortError()))
    const timer = setTimeout(() => finish(resolve), milliseconds)
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

async function fetchWithAttemptTimeout(
  fetch_: FetchLike,
  url: string | URL,
  init: RequestInit,
  signal: AbortSignal,
  timeoutMs: number,
) {
  if (signal.aborted) throw abortError()
  const controller = new AbortController()
  const onAbort = () => controller.abort(signal.reason)
  const timeout = setTimeout(() => controller.abort("request-timeout"), timeoutMs)
  signal.addEventListener("abort", onAbort, { once: true })
  try {
    return await fetch_(url, { ...init, signal: controller.signal })
  } catch {
    if (signal.aborted) throw abortError()
    throw new ChatCutUploadError("network-request-failed")
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener("abort", onAbort)
  }
}

function requestId(request: Record<string, unknown>) {
  return `convax-${createHash("sha256").update(JSON.stringify(request)).digest("hex")}`
}

function metadataFields(media: PreparedMedia) {
  return {
    ...(media.durationInSeconds === undefined
      ? {}
      : { durationInSeconds: media.durationInSeconds }),
    ...(media.hasAudioTrack === undefined
      ? {}
      : { hasAudioTrack: media.hasAudioTrack }),
    ...(media.height === undefined ? {} : { height: media.height }),
    ...(media.width === undefined ? {} : { width: media.width }),
  }
}

export class ChatCutImportClient {
  readonly #endpoint: URL
  readonly #fetch: FetchLike
  readonly #operationId: string
  readonly #sessionToken: string

  constructor(options: {
    allowedOrigin?: string
    endpoint: string
    fetch?: FetchLike
    operationId: string
    sessionToken: string
  }) {
    this.#endpoint = validatedEndpoint(options.endpoint, options.allowedOrigin ?? officialChatCutOrigin)
    this.#fetch = options.fetch ?? fetch
    this.#operationId = options.operationId
    this.#sessionToken = options.sessionToken
  }

  async upload(
    assetId: string,
    media: PreparedMedia,
    signal: AbortSignal,
  ) {
    const registered = await this.#post({
      registerAssetPlaceholderRequest: {
        action: "register_asset_placeholder",
        assetId,
        assetType: media.assetType,
        contentType: media.contentType,
        filename: media.filename,
        size: media.size,
        ...metadataFields(media),
      },
    }, signal, `register:${assetId}`)
    if (registered.assetId !== undefined && registered.assetId !== assetId) {
      throw new ChatCutUploadError("upstream-envelope-rejected")
    }

    const prepared = await this.#post({
      prepareRegisteredUploadRequest: {
        action: "prepare_registered_upload",
        assetId,
        assetType: media.assetType,
        contentType: media.contentType,
        filename: media.filename,
        size: media.size,
      },
    }, signal, `prepare:${assetId}`)
    const slot = parseUploadSlot(prepared.assetUpload)
    const multipart = await this.#uploadFile(media, slot, signal, assetId)
    await this.#post({
      finalizeAssetUploadRequest: {
        action: "finalize_asset_upload",
        assetId,
        assetType: media.assetType,
        contentType: media.contentType,
        fileKey: slot.fileKey,
        filename: media.filename,
        readUrl: slot.readUrl,
        size: media.size,
        startTranscription:
          media.assetType === "audio"
          || media.assetType === "video" && media.hasAudioTrack === true,
        ...metadataFields(media),
        ...(multipart ? { multipart } : {}),
      },
    }, signal, `finalize:${assetId}`)
  }

  async #post(
    request: Record<string, unknown>,
    signal: AbortSignal,
    step: string,
  ): Promise<Record<string, unknown>> {
    const body = JSON.stringify({
      request,
      requestId: requestId({
        operationId: this.#operationId,
        request,
        step,
      }),
    })
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetchWithAttemptTimeout(this.#fetch, this.#endpoint, {
        body,
        headers: {
          Authorization: `Bearer ${this.#sessionToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        redirect: "error",
      }, signal, endpointAttemptTimeoutMs)
      const responseText = await readBoundedResponse(response)
      if (response.ok) {
        if (!responseText) return {}
        try {
          return objectValue(JSON.parse(responseText) as unknown)
        } catch (error) {
          if (error instanceof ChatCutUploadError) throw error
          throw new ChatCutUploadError("upstream-envelope-rejected")
        }
      }
      if (attempt < 3 && retryableStatuses.has(response.status)) {
        await abortableDelay(retryDelay(attempt), signal)
        continue
      }
      throw new ChatCutUploadError("upstream-http-rejected")
    }
    throw new ChatCutUploadError("upstream-http-rejected")
  }

  async #uploadFile(
    media: PreparedMedia,
    slot: UploadSlot,
    signal: AbortSignal,
    assetId: string,
  ): Promise<MultipartResult | undefined> {
    const current = await lstat(media.path)
    if (!current.isFile() || current.isSymbolicLink() || current.size !== media.size) {
      throw new ChatCutUploadError("staged-file-changed")
    }
    if (!slot.multipartUploadId || !slot.multipartPartCount || !slot.multipartPartSizeBytes) {
      await this.#put(slot.presignedUrl, Bun.file(media.path), media.contentType, media.size, signal)
      return undefined
    }
    if (slot.multipartPartCount === 1) {
      await this.#put(slot.presignedUrl, Bun.file(media.path), media.contentType, media.size, signal)
      return undefined
    }
    const expectedParts = Math.ceil(media.size / slot.multipartPartSizeBytes)
    if (expectedParts !== slot.multipartPartCount) {
      throw new ChatCutUploadError("upstream-envelope-rejected")
    }
    const file = Bun.file(media.path)
    const parts: Array<{ ETag: string; PartNumber: number }> = []
    for (
      let firstPartNumber = 1;
      firstPartNumber <= slot.multipartPartCount;
      firstPartNumber += multipartSignBatchSize
    ) {
      const lastPartNumber = Math.min(
        slot.multipartPartCount,
        firstPartNumber + multipartSignBatchSize - 1,
      )
      const signed = await this.#post({
        signPartsRequest: {
          action: "sign_parts",
          fileKey: slot.fileKey,
          firstPartNumber,
          lastPartNumber,
          uploadId: slot.multipartUploadId,
        },
      }, signal, `sign:${assetId}:${firstPartNumber}`)
      const partUrls = objectValue(signed.partUrls)
      for (let partNumber = firstPartNumber; partNumber <= lastPartNumber; partNumber += 1) {
        const start = (partNumber - 1) * slot.multipartPartSizeBytes
        const end = Math.min(media.size, start + slot.multipartPartSizeBytes)
        const blob = file.slice(start, end)
        const ETag = await this.#put(
          validatedHttpsCapability(partUrls[String(partNumber)]),
          blob,
          undefined,
          end - start,
          signal,
          true,
        )
        parts.push({ ETag, PartNumber: partNumber })
      }
    }
    return { parts, uploadId: slot.multipartUploadId }
  }

  async #put(
    url: string,
    body: Blob,
    contentType: string | undefined,
    size: number,
    signal: AbortSignal,
    requireEtag = false,
  ) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetchWithAttemptTimeout(this.#fetch, url, {
        body,
        headers: {
          "Content-Length": String(size),
          ...(contentType ? { "Content-Type": contentType } : {}),
        },
        method: "PUT",
        redirect: "error",
      }, signal, uploadAttemptTimeoutMs)
      if (response.ok) {
        if (!requireEtag) return ""
        const etag = response.headers.get("etag")?.replace(/^"|"$/gu, "")
        if (!etag || etag.length > 512 || /[\u0000-\u001f\u007f]/u.test(etag)) {
          throw new ChatCutUploadError("upstream-envelope-rejected")
        }
        return etag
      }
      await response.body?.cancel().catch(() => undefined)
      if (attempt < 3 && retryableStatuses.has(response.status)) {
        await abortableDelay(retryDelay(attempt), signal)
        continue
      }
      throw new ChatCutUploadError("upload-http-rejected")
    }
    throw new ChatCutUploadError("upload-http-rejected")
  }
}

export function assetTypeForRole(role: "audio" | "reference_image" | "reference_video"): MediaAssetType {
  return role === "audio" ? "audio" : role === "reference_video" ? "video" : "image"
}
