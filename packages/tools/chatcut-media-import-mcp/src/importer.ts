import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ChatCutImportClient, type FetchLike } from "./chatcut-client.ts"
import {
  type ImportedAsset,
  type MediaImportCall,
  mediaImportResult,
  type MediaImportResult,
} from "./contracts.ts"
import {
  MediaPreparationError,
  type MediaPreparer,
  MediaToolchainError,
  PathMediaPreparer,
  type PreparedMedia,
} from "./media.ts"

function abortError() {
  return new DOMException("ChatCut media import was cancelled", "AbortError")
}

function assertPreparedKind(call: MediaImportCall, index: number, media: PreparedMedia) {
  const role = call.references[index]!.role
  const valid =
    role === "reference_image"
      ? media.assetType === "image" || media.assetType === "gif"
      : role === "reference_video"
        ? media.assetType === "video"
        : media.assetType === "audio"
  if (!valid) throw new MediaPreparationError()
}

export interface MediaImportEngineOptions {
  /** In-process test seam. Production construction never overrides this origin. */
  allowedOrigin?: string
  fetch?: FetchLike
  preparer?: MediaPreparer
  temporaryRoot?: string
}

export class MediaImportEngine {
  readonly #allowedOrigin: string | undefined
  readonly #fetch: FetchLike | undefined
  readonly #preparer: MediaPreparer
  readonly #temporaryRoot: string

  constructor(options: MediaImportEngineOptions = {}) {
    this.#allowedOrigin = options.allowedOrigin
    this.#fetch = options.fetch
    this.#preparer = options.preparer ?? new PathMediaPreparer()
    this.#temporaryRoot = options.temporaryRoot ?? os.tmpdir()
  }

  async import(call: MediaImportCall, signal: AbortSignal): Promise<MediaImportResult> {
    if (signal.aborted) throw abortError()
    const workDirectory = await mkdtemp(path.join(this.#temporaryRoot, "convax-chatcut-media-import-"))
    try {
      const client = new ChatCutImportClient({
        ...(this.#allowedOrigin === undefined ? {} : { allowedOrigin: this.#allowedOrigin }),
        endpoint: call.endpoint,
        ...(this.#fetch === undefined ? {} : { fetch: this.#fetch }),
        operationId: call.operation_id,
        sessionToken: call.session_token,
      })
      const assets: ImportedAsset[] = []
      for (let index = 0; index < call.references.length; index += 1) {
        if (signal.aborted) throw abortError()
        const reference = call.references[index]!
        const prepared = await this.#preparer.prepare(reference, workDirectory, index + 1, signal)
        assertPreparedKind(call, index, prepared)
        const assetId = crypto.randomUUID()
        await client.upload(assetId, prepared, signal)
        assets.push({
          assetId,
          assetType: prepared.assetType,
          nodeId: reference.node_id,
        })
      }
      return mediaImportResult(assets)
    } finally {
      await rm(workDirectory, { force: true, recursive: true }).catch(() => undefined)
    }
  }
}

export function publicImportError(error: unknown) {
  if (error instanceof MediaToolchainError || error instanceof MediaPreparationError) {
    return error.publicMessage
  }
  if (
    error
    && typeof error === "object"
    && "publicMessage" in error
    && typeof error.publicMessage === "string"
  ) {
    return error.publicMessage
  }
  return "ChatCut media import failed."
}

export function importDiagnosticCode(error: unknown) {
  if (error instanceof MediaToolchainError) return "media-toolchain-unavailable"
  if (error instanceof MediaPreparationError) return "media-preparation-failed"
  if (
    error
    && typeof error === "object"
    && "diagnosticCode" in error
    && typeof error.diagnosticCode === "string"
    && /^[a-z]+(?:-[a-z]+)*$/u.test(error.diagnosticCode)
  ) {
    return error.diagnosticCode
  }
  return "unclassified-failure"
}
