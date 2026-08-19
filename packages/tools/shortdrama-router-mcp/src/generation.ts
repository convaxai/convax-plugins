import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { link, lstat, open, realpath, rm, stat } from "node:fs/promises"
import path from "node:path"

import type {
  AudioCreateRequest,
  AudioJob,
  ImageCreateRequest,
  ImageJob,
  VideoCreateRequest,
  VideoJob,
} from "shortdrama-router"
import { RouterError } from "shortdrama-router"

import { boundedCall } from "./bounded-call.ts"
import {
  generationTools,
  loadModelCatalog,
  type ModelsByKind,
  type ValidatedModel,
} from "./catalog.ts"
import {
  abortError,
  asRecord,
  exactKeys,
  generationCallSchema,
  isAbortError,
  type GenerationArtifact,
  type GenerationKind,
  type ProviderId,
  type RouterPort,
} from "./contracts.ts"
import {
  openSafeDownload,
  type DownloadOpener,
} from "./safe-download.ts"

const maximumArtifactBytes = 1024 * 1024 * 1024
const maximumOperationHistory = 512
const maximumPromptBytes = 20_000
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const defaultSubmittingStaleAfterMs = 31 * 60_000

interface ParsedGenerationCall {
  aspectRatio?: string
  duration?: number
  format?: string
  kind: GenerationKind
  model: ValidatedModel
  n?: number
  operationId: string
  outputDirectory: string
  prompt: string
  resolution?: string
  seed?: number
  size?: string
}

interface GenerationOutput {
  content_type?: string
  media_type?: string
  url: string
}

type GenerationJob = AudioJob | ImageJob | VideoJob

interface Operation {
  controller: AbortController
  fingerprint: string
  result: Promise<GenerationArtifact[]>
  settled: boolean
  waiters: Set<symbol>
}

interface PublishedArtifact {
  absolutePath: string
  artifact: GenerationArtifact
}

interface MediaTypeDefinition {
  canonicalMimeType: string
  extension: string
  kind: GenerationKind
  matches: (prefix: Uint8Array) => boolean
  requiresDeclaredMimeType?: true
}

export class LocalMediaReferenceError extends Error {
  override name = "LocalMediaReferenceError"
}

export class GenerationObservationError extends Error {
  override name = "GenerationObservationError"
}

export class GenerationSubmissionError extends Error {
  override name = "GenerationSubmissionError"
}

export class TerminalGenerationError extends Error {
  override name = "TerminalGenerationError"

  constructor(readonly status: "failed" | "cancelled" | "submission_unknown") {
    super("Provider generation ended without a usable result")
  }
}

export class OperationConflictError extends Error {
  override name = "OperationConflictError"
}

export interface GenerationEngineOptions {
  download?: DownloadOpener
  pollIntervalMs?: number
  prepare?: (signal: AbortSignal) => Promise<void>
  requestTimeoutMs?: number
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>
  submissionTimeoutMs?: number
  submittingStaleAfterMs?: number
  now?: () => number
}

function boundedString(value: unknown, label: string, maximum: number) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximum
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`${label} is invalid`)
  }
  return value
}

function capabilityStrings(
  model: ValidatedModel,
  key: string,
  constraintKey?: "aspect_ratio" | "resolution" | "size",
) {
  const rawConstraints = model.capabilities.constraints
  if (constraintKey !== undefined && rawConstraints !== undefined) {
    const constraints = asRecord(rawConstraints, "provider model constraints")
    const rawConstraint = constraints[constraintKey]
    if (rawConstraint !== undefined) {
      const constraint = asRecord(rawConstraint, "provider model constraint")
      if (constraint.kind === "unknown" || constraint.kind === "unsupported") {
        return []
      }
      if (constraint.kind !== "enum" || !Array.isArray(constraint.values)) {
        throw new Error("Provider model constraint is invalid")
      }
      return constraint.values.filter(
        (item): item is string => typeof item === "string",
      )
    }
  }
  const value = model.capabilities[key]
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === "string")
}

function selectedStringCapability(
  input: unknown,
  model: ValidatedModel,
  key: string,
  constraintKey: "aspect_ratio" | "resolution" | "size" | undefined,
  label: string,
  maximum: number,
) {
  if (input === undefined) return undefined
  const value = boundedString(input, label, maximum)
  const supported = capabilityStrings(model, key, constraintKey)
  if (!supported?.includes(value)) {
    throw new Error(`${label} is not supported by the selected model`)
  }
  return value
}

function selectedDuration(input: unknown, model: ValidatedModel) {
  if (input === undefined) return undefined
  if (!Number.isFinite(input) || Number(input) <= 0) {
    throw new Error("Generation duration is invalid")
  }
  const value = Number(input)
  const constraints = model.capabilities.constraints === undefined
    ? undefined
    : asRecord(model.capabilities.constraints, "provider model constraints")
  const rawConstraint = constraints?.duration
  if (rawConstraint !== undefined) {
    const constraint = asRecord(rawConstraint, "provider model constraint")
    if (constraint.kind === "enum" && Array.isArray(constraint.values)) {
      if (!constraint.values.includes(value)) {
        throw new Error("Generation duration is not supported by the selected model")
      }
      return value
    }
    if (constraint.kind === "range") {
      if (
        !Number.isFinite(constraint.min)
        || !Number.isFinite(constraint.max)
        || value < Number(constraint.min)
        || value > Number(constraint.max)
      ) {
        throw new Error("Generation duration is not supported by the selected model")
      }
      if (constraint.step !== undefined) {
        const step = Number(constraint.step)
        const offset = (value - Number(constraint.min)) / step
        if (!Number.isFinite(step) || step <= 0 || Math.abs(offset - Math.round(offset)) > 1e-9) {
          throw new Error("Generation duration is not supported by the selected model")
        }
      }
      return value
    }
    throw new Error("Generation duration is not supported by the selected model")
  }
  const supported = model.capabilities.durations
  if (!Array.isArray(supported) || !supported.includes(value)) {
    throw new Error("Generation duration is not supported by the selected model")
  }
  return value
}

function selectedSeed(input: unknown, model: ValidatedModel) {
  if (input === undefined) return undefined
  if (
    model.capabilities.seed !== true
    || !Number.isSafeInteger(input)
    || Number(input) < 0
    || Number(input) > 4_294_967_295
  ) {
    throw new Error("Generation seed is not supported by the selected model")
  }
  return Number(input)
}

function parseGenerationCall(
  value: unknown,
  expectedKind: GenerationKind,
  catalog: ModelsByKind,
): ParsedGenerationCall {
  const input = asRecord(value, "generation call")
  const optional = expectedKind === "audio"
    ? ["format"]
    : expectedKind === "image"
      ? ["aspect_ratio", "n", "resolution", "size"]
      : ["aspect_ratio", "duration", "resolution", "seed"]
  exactKeys(
    input,
    [
      "schema",
      "operation_id",
      "prompt",
      "output",
      "output_directory",
      "references",
      "model",
    ],
    optional,
  )
  if (input.schema !== generationCallSchema || input.output !== expectedKind) {
    throw new Error("Generation call contract is unsupported")
  }
  if (
    typeof input.operation_id !== "string"
    || !operationIdPattern.test(input.operation_id)
  ) {
    throw new Error("Generation operation id is invalid")
  }
  if (
    typeof input.prompt !== "string"
    || input.prompt.trim() !== input.prompt
    || input.prompt.length === 0
    || Buffer.byteLength(input.prompt, "utf8") > maximumPromptBytes
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(input.prompt)
  ) {
    throw new Error("Generation prompt is invalid")
  }
  if (
    typeof input.output_directory !== "string"
    || input.output_directory.length > 4_096
    || input.output_directory.includes("\0")
    || !path.isAbsolute(input.output_directory)
  ) {
    throw new Error("Generation output directory is invalid")
  }
  if (!Array.isArray(input.references)) {
    throw new Error("Generation references are invalid")
  }
  if (input.references.length !== 0) {
    throw new LocalMediaReferenceError(
      "The provider package cannot consume Convax local media references",
    )
  }
  if (typeof input.model !== "string") {
    throw new Error("Generation model is invalid")
  }
  const model = catalog[expectedKind].find(({ id }) => id === input.model)
  if (!model) throw new Error("Generation model is not in the current catalog")
  const common = {
    kind: expectedKind,
    model,
    operationId: input.operation_id,
    outputDirectory: input.output_directory,
    prompt: input.prompt,
  }
  if (expectedKind === "audio") {
    const format = selectedStringCapability(
      input.format,
      model,
      "audio_formats",
      undefined,
      "Audio format",
      32,
    )
    return {
      ...common,
      ...(format === undefined ? {} : { format }),
    }
  }
  const aspectRatio = selectedStringCapability(
    input.aspect_ratio,
    model,
    "aspect_ratios",
    "aspect_ratio",
    "Aspect ratio",
    16,
  )
  const resolution = selectedStringCapability(
    input.resolution,
    model,
    "resolutions",
    "resolution",
    "Resolution",
    32,
  )
  if (expectedKind === "image") {
    const size = selectedStringCapability(
      input.size,
      model,
      "sizes",
      "size",
      "Size",
      32,
    )
    if (
      input.n !== undefined
      && (!Number.isSafeInteger(input.n) || Number(input.n) < 1 || Number(input.n) > 10)
    ) {
      throw new Error("Image count is invalid")
    }
    return {
      ...common,
      ...(aspectRatio === undefined ? {} : { aspectRatio }),
      ...(input.n === undefined ? {} : { n: Number(input.n) }),
      ...(resolution === undefined ? {} : { resolution }),
      ...(size === undefined ? {} : { size }),
    }
  }
  const duration = selectedDuration(input.duration, model)
  const seed = selectedSeed(input.seed, model)
  return {
    ...common,
    ...(aspectRatio === undefined ? {} : { aspectRatio }),
    ...(duration === undefined ? {} : { duration }),
    ...(resolution === undefined ? {} : { resolution }),
    ...(seed === undefined ? {} : { seed }),
  }
}

function defaultSleep(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, milliseconds)
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

function safeJob(job: GenerationJob, expectedKind: GenerationKind) {
  const createdAt = new Date(job?.created_at).getTime()
  if (
    !job
    || typeof job !== "object"
    || typeof job.id !== "string"
    || job.id.length === 0
    || job.id.length > 512
    || /[\u0000-\u001f\u007f]/u.test(job.id)
    || !Number.isFinite(createdAt)
    || ![
      "submitting",
      "submission_unknown",
      "queued",
      "in_progress",
      "completed",
      "failed",
      "cancelled",
    ].includes(
      job.status,
    )
  ) {
    throw new GenerationObservationError("Provider job response is invalid")
  }
  if (
    job.status === "failed"
    || job.status === "cancelled"
    || job.status === "submission_unknown"
  ) {
    throw new TerminalGenerationError(job.status)
  }
  if (job.status === "completed") {
    const outputs = job.artifacts ?? job.outputs
    if (!Array.isArray(outputs) || outputs.length === 0 || outputs.length > 8) {
      throw new GenerationObservationError(
        `Provider ${expectedKind} result is invalid`,
      )
    }
  }
  return job
}

function bytesEqual(prefix: Uint8Array, expected: readonly number[], offset = 0) {
  return prefix.byteLength >= offset + expected.length
    && expected.every((value, index) => prefix[offset + index] === value)
}

function ascii(prefix: Uint8Array, value: string, offset = 0) {
  return bytesEqual(prefix, [...Buffer.from(value, "ascii")], offset)
}

const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const mediaTypeDefinitions: Readonly<Record<string, MediaTypeDefinition>> = {
  "audio/aac": {
    canonicalMimeType: "audio/aac",
    extension: ".aac",
    kind: "audio",
    matches: (prefix) => ascii(prefix, "ADIF")
      || (
        prefix.byteLength >= 2
        && prefix[0] === 0xff
        && (prefix[1]! & 0xf6) === 0xf0
      ),
  },
  "audio/flac": {
    canonicalMimeType: "audio/flac",
    extension: ".flac",
    kind: "audio",
    matches: (prefix) => ascii(prefix, "fLaC"),
  },
  "audio/l16": {
    canonicalMimeType: "audio/l16",
    extension: ".pcm",
    kind: "audio",
    matches: (prefix) => prefix.byteLength > 0,
    requiresDeclaredMimeType: true,
  },
  "audio/mpeg": {
    canonicalMimeType: "audio/mpeg",
    extension: ".mp3",
    kind: "audio",
    matches: (prefix) => ascii(prefix, "ID3")
      || (
        prefix.byteLength >= 2
        && prefix[0] === 0xff
        && (prefix[1]! & 0xe0) === 0xe0
        && ((prefix[1]! >> 1) & 0x03) !== 0
      ),
  },
  "audio/ogg": {
    canonicalMimeType: "audio/ogg",
    extension: ".ogg",
    kind: "audio",
    matches: (prefix) => ascii(prefix, "OggS"),
  },
  "audio/pcm": {
    canonicalMimeType: "audio/pcm",
    extension: ".pcm",
    kind: "audio",
    matches: (prefix) => prefix.byteLength > 0,
    requiresDeclaredMimeType: true,
  },
  "audio/wav": {
    canonicalMimeType: "audio/wav",
    extension: ".wav",
    kind: "audio",
    matches: (prefix) => ascii(prefix, "RIFF") && ascii(prefix, "WAVE", 8),
  },
  "audio/x-pcm": {
    canonicalMimeType: "audio/pcm",
    extension: ".pcm",
    kind: "audio",
    matches: (prefix) => prefix.byteLength > 0,
    requiresDeclaredMimeType: true,
  },
  "audio/x-wav": {
    canonicalMimeType: "audio/wav",
    extension: ".wav",
    kind: "audio",
    matches: (prefix) => ascii(prefix, "RIFF") && ascii(prefix, "WAVE", 8),
  },
  "image/gif": {
    canonicalMimeType: "image/gif",
    extension: ".gif",
    kind: "image",
    matches: (prefix) => ascii(prefix, "GIF87a") || ascii(prefix, "GIF89a"),
  },
  "image/jpeg": {
    canonicalMimeType: "image/jpeg",
    extension: ".jpg",
    kind: "image",
    matches: (prefix) => bytesEqual(prefix, [0xff, 0xd8, 0xff]),
  },
  "image/png": {
    canonicalMimeType: "image/png",
    extension: ".png",
    kind: "image",
    matches: (prefix) => bytesEqual(prefix, pngMagic),
  },
  "image/webp": {
    canonicalMimeType: "image/webp",
    extension: ".webp",
    kind: "image",
    matches: (prefix) => ascii(prefix, "RIFF") && ascii(prefix, "WEBP", 8),
  },
  "video/mp4": {
    canonicalMimeType: "video/mp4",
    extension: ".mp4",
    kind: "video",
    matches: (prefix) => ascii(prefix, "ftyp", 4),
  },
  "video/quicktime": {
    canonicalMimeType: "video/quicktime",
    extension: ".mov",
    kind: "video",
    matches: (prefix) => ascii(prefix, "ftyp", 4),
  },
  "video/webm": {
    canonicalMimeType: "video/webm",
    extension: ".webm",
    kind: "video",
    matches: (prefix) => bytesEqual(prefix, [0x1a, 0x45, 0xdf, 0xa3]),
  },
}

function mediaTypeDefinition(
  value: unknown,
  kind: GenerationKind,
  label: string,
) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new Error(`${label} is invalid`)
  }
  const mimeType = value.split(";", 1)[0]!.trim().toLowerCase()
  const definition = mediaTypeDefinitions[mimeType]
  if (!definition || definition.kind !== kind) {
    throw new Error(`${label} is invalid`)
  }
  return definition
}

function retireArtifactIterator(iterator: AsyncIterator<Uint8Array>) {
  try {
    const closing = iterator.return?.()
    if (closing) void Promise.resolve(closing).catch(() => undefined)
  } catch {
    // Preserve the primary validation/download error. The close attempt has
    // still been issued to the provider-owned response body.
  }
}

async function publishArtifact(
  output: GenerationOutput,
  kind: GenerationKind,
  directory: string,
  operationId: string,
  index: number,
  download: DownloadOpener,
  requestTimeoutMs: number,
  signal: AbortSignal,
): Promise<PublishedArtifact> {
  if (
    typeof output.url !== "string"
    || output.url.length === 0
    || output.url.length > 16_384
  ) {
    throw new Error("Provider artifact is invalid")
  }
  const source = await boundedCall(
    requestTimeoutMs,
    signal,
    (attemptSignal) => download(output.url, attemptSignal),
  )
  const temporaryPath = path.join(directory, `.convax-download-${randomUUID()}.tmp`)
  let handle
  const prefix = new Uint8Array(16)
  let prefixLength = 0
  const iterator = source.stream[Symbol.asyncIterator]()
  try {
    if (
      source.contentLength !== null
      && source.contentLength > maximumArtifactBytes
    ) {
      throw new Error("Provider artifact is too large")
    }
    const declared = mediaTypeDefinition(
      output.media_type ?? output.content_type,
      kind,
      "Provider artifact declared media type",
    )
    const response = source.contentType === "application/octet-stream"
      ? undefined
      : mediaTypeDefinition(
        source.contentType,
        kind,
        "Provider artifact response media type",
      )
    if (
      declared
      && response
      && declared.canonicalMimeType !== response.canonicalMimeType
    ) {
      throw new Error("Provider artifact media types conflict")
    }
    const definition = response ?? declared
    if (!definition) throw new Error("Provider artifact media type is missing")
    if (definition.requiresDeclaredMimeType && !declared) {
      throw new Error("Raw PCM requires a trusted declared media type")
    }
    const { canonicalMimeType: mimeType, extension } = definition
    handle = await open(
      temporaryPath,
      constants.O_CREAT
        | constants.O_EXCL
        | constants.O_WRONLY
        | constants.O_NOFOLLOW,
      0o600,
    )
    let written = 0
    while (true) {
      const next = await boundedCall(
        requestTimeoutMs,
        signal,
        async () => iterator.next(),
      )
      if (next.done) break
      const chunk = next.value
      if (signal.aborted) throw abortError()
      if (!(chunk instanceof Uint8Array)) {
        throw new Error("Provider artifact stream is invalid")
      }
      if (chunk.byteLength === 0) continue
      if (prefixLength < prefix.byteLength) {
        const count = Math.min(prefix.byteLength - prefixLength, chunk.byteLength)
        prefix.set(chunk.subarray(0, count), prefixLength)
        prefixLength += count
      }
      written += chunk.byteLength
      if (written > maximumArtifactBytes) {
        throw new Error("Provider artifact is too large")
      }
      let offset = 0
      while (offset < chunk.byteLength) {
        const result = await handle.write(
          chunk,
          offset,
          chunk.byteLength - offset,
        )
        if (result.bytesWritten <= 0) {
          throw new Error("Provider artifact could not be stored")
        }
        offset += result.bytesWritten
      }
    }
    if (written === 0 || (source.contentLength !== null && written !== source.contentLength)) {
      throw new Error("Provider artifact was incomplete")
    }
    if (!definition.matches(prefix.subarray(0, prefixLength))) {
      throw new Error("Provider artifact signature does not match its media type")
    }
    await handle.sync()
    await handle.close()
    handle = undefined
    const safeOperationId = operationId.replace(/:/gu, "_")
    for (let suffix = 0; suffix < 100; suffix += 1) {
      const name = `${safeOperationId}-${index + 1}${
        suffix === 0 ? "" : `-${suffix + 1}`
      }${extension}`
      const destination = path.join(directory, name)
      try {
        await link(temporaryPath, destination)
        await rm(temporaryPath, { force: true }).catch(() => undefined)
        return {
          absolutePath: destination,
          artifact: { mimeType, name, path: name },
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      }
    }
    throw new Error("Provider artifact name space is exhausted")
  } finally {
    retireArtifactIterator(iterator)
    await handle?.close().catch(() => undefined)
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

async function outputDirectory(value: string) {
  const resolved = await realpath(value)
  const info = await stat(resolved)
  const originalInfo = await lstat(value)
  if (!info.isDirectory() || !originalInfo.isDirectory()) {
    throw new Error("Generation output directory is invalid")
  }
  return resolved
}

export class GenerationEngine {
  readonly #download: DownloadOpener
  readonly #operations = new Map<string, Operation>()
  readonly #pollIntervalMs: number
  readonly #prepare: ((signal: AbortSignal) => Promise<void>) | undefined
  readonly #now: () => number
  readonly #prospectiveWaiters = new Map<string, Set<symbol>>()
  readonly #requestTimeoutMs: number
  readonly #sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>
  readonly #submittingStaleAfterMs: number
  readonly #submissionTimeoutMs: number

  constructor(
    private readonly provider: ProviderId,
    private readonly router: RouterPort,
    options: GenerationEngineOptions = {},
  ) {
    this.#download = options.download ?? openSafeDownload
    this.#pollIntervalMs = options.pollIntervalMs ?? 2_000
    this.#prepare = options.prepare
    this.#now = options.now ?? Date.now
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 30_000
    this.#sleep = options.sleep ?? defaultSleep
    this.#submissionTimeoutMs = options.submissionTimeoutMs
      ?? this.#requestTimeoutMs
    this.#submittingStaleAfterMs = options.submittingStaleAfterMs
      ?? defaultSubmittingStaleAfterMs
    if (
      !Number.isFinite(this.#pollIntervalMs)
      || this.#pollIntervalMs < 0
      || !Number.isFinite(this.#requestTimeoutMs)
      || this.#requestTimeoutMs <= 0
      || !Number.isFinite(this.#submissionTimeoutMs)
      || this.#submissionTimeoutMs <= 0
      || !Number.isFinite(this.#submittingStaleAfterMs)
      || this.#submittingStaleAfterMs <= 0
    ) {
      throw new Error("Generation polling configuration is invalid")
    }
  }

  async generate(
    kind: GenerationKind,
    value: unknown,
    signal: AbortSignal,
  ) {
    const operationInput = asRecord(value, "generation call")
    const operationId = operationInput.operation_id
    if (typeof operationId !== "string" || !operationIdPattern.test(operationId)) {
      throw new Error("Generation operation id is invalid")
    }
    const prospectiveWaiter = Symbol("prospective-generation-waiter")
    const prospective = this.#prospectiveWaiters.get(operationId) ?? new Set()
    prospective.add(prospectiveWaiter)
    this.#prospectiveWaiters.set(operationId, prospective)
    let prospectiveActive = true
    const releaseProspective = () => {
      if (!prospectiveActive) return
      prospectiveActive = false
      prospective.delete(prospectiveWaiter)
      if (prospective.size === 0) this.#prospectiveWaiters.delete(operationId)
      const current = this.#operations.get(operationId)
      if (current) this.#abortWhenUnobserved(operationId, current)
    }
    try {
      if (signal.aborted) throw abortError()
      await this.#prepare?.(signal)
      const catalog = await loadModelCatalog(this.router, this.provider, signal)
      // A direct tools/call must enforce the same fail-closed catalog validation
      // as tools/list; callers cannot bypass malformed capability data by naming
      // a tool that was not safely advertised.
      generationTools(catalog)
      const call = parseGenerationCall(value, kind, catalog)
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(call))
        .digest("hex")
      const existing = this.#operations.get(call.operationId)
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new OperationConflictError(
            "Generation operation id was reused with different input",
          )
        }
        const waiting = this.#waitForOperation(
          call.operationId,
          existing,
          signal,
        )
        releaseProspective()
        return waiting
      }
      if (this.#operations.size >= maximumOperationHistory) {
        throw new OperationConflictError("Generation operation history is full")
      }
      const controller = new AbortController()
      const operation: Operation = {
        controller,
        fingerprint,
        result: Promise.resolve([]),
        settled: false,
        waiters: new Set(),
      }
      operation.result = this.#execute(call, controller.signal).then(
        (result) => {
          operation.settled = true
          return result
        },
        (error: unknown) => {
          operation.settled = true
          if (this.#operations.get(call.operationId) === operation) {
            this.#operations.delete(call.operationId)
          }
          throw error
        },
      )
      // The operation journal intentionally retains rejection, but it must not
      // become an unhandled process rejection if every caller cancels.
      void operation.result.catch(() => undefined)
      this.#operations.set(call.operationId, operation)
      const waiting = this.#waitForOperation(call.operationId, operation, signal)
      releaseProspective()
      return waiting
    } finally {
      releaseProspective()
    }
  }

  #abortWhenUnobserved(operationId: string, operation: Operation) {
    if (
      !operation.settled
      && operation.waiters.size === 0
      && (this.#prospectiveWaiters.get(operationId)?.size ?? 0) === 0
    ) {
      operation.controller.abort("All generation callers cancelled")
      return true
    }
    return false
  }

  #waitForOperation(
    operationId: string,
    operation: Operation,
    signal: AbortSignal,
  ) {
    if (signal.aborted) {
      this.#abortWhenUnobserved(operationId, operation)
      return Promise.reject(abortError())
    }
    const waiter = Symbol("generation-waiter")
    operation.waiters.add(waiter)
    return new Promise<GenerationArtifact[]>((resolve, reject) => {
      let finished = false
      const finish = (complete: () => void, cancelled: boolean) => {
        if (finished) return
        finished = true
        signal.removeEventListener("abort", onAbort)
        operation.waiters.delete(waiter)
        const abortedOperation = cancelled
          && this.#abortWhenUnobserved(operationId, operation)
        if (abortedOperation) {
          // The last waiter still receives prompt cancellation because every
          // provider/download step is a bounded race, but do not report the
          // cancellation before private partial-file cleanup has completed.
          void operation.result.then(complete, complete)
        } else {
          complete()
        }
      }
      const onAbort = () => finish(
        () => reject(abortError()),
        true,
      )
      signal.addEventListener("abort", onAbort, { once: true })
      if (signal.aborted) {
        onAbort()
        return
      }
      void operation.result.then(
        (artifacts) => finish(() => resolve(artifacts), false),
        (error: unknown) => finish(() => reject(error), false),
      )
    })
  }

  async #execute(call: ParsedGenerationCall, signal: AbortSignal) {
    let job: GenerationJob
    try {
      job = await boundedCall(
        this.#submissionTimeoutMs,
        signal,
        (attemptSignal) => this.#create(call, attemptSignal),
      )
    } catch (error) {
      if (signal.aborted || isAbortError(error)) throw abortError()
      if (error instanceof RouterError && error.category === "conflict") {
        throw new OperationConflictError(
          "Generation operation id conflicts with durable input",
        )
      }
      throw new GenerationSubmissionError("Provider did not accept generation")
    }
    safeJob(job, call.kind)
    while (
      job.status === "submitting"
      || job.status === "queued"
      || job.status === "in_progress"
    ) {
      await this.#sleep(this.#pollIntervalMs, signal)
      let observed: GenerationJob | undefined
      while (observed === undefined) {
        try {
          const submittingIsFresh = job.status === "submitting"
            && this.#now() - new Date(job.created_at).getTime()
              < this.#submittingStaleAfterMs
          // shortdrama-router@0.5.0 turns get(no reference) into
          // submission_unknown. Re-entering the idempotent create path lets a
          // concurrent live claimant finish publishing its reference without
          // submitting twice. Only a claim older than the provider runner's
          // maximum submit window is observed through get.
          const candidate = await boundedCall(
            this.#requestTimeoutMs,
            signal,
            (attemptSignal) => submittingIsFresh
              ? this.#create(call, attemptSignal)
              : this.#get(call.kind, job.id, attemptSignal),
          )
          observed = safeJob(candidate, call.kind)
        } catch (error) {
          if (signal.aborted || isAbortError(error)) throw abortError()
          if (error instanceof TerminalGenerationError) throw error
          if (error instanceof RouterError && error.category === "conflict") {
            throw new OperationConflictError(
              "Generation operation id conflicts with durable input",
            )
          }
          // A bounded observation failure is not a job terminal state. Keep
          // the accepted queued/running operation alive, back off, and retry
          // until the provider reports a canonical terminal state or the
          // caller cancels. Never resubmit the paid generation.
          await this.#sleep(this.#pollIntervalMs, signal)
        }
      }
      job = observed
    }
    const directory = await outputDirectory(call.outputDirectory)
    const outputs = (job.artifacts ?? job.outputs) as readonly GenerationOutput[]
    const artifacts: PublishedArtifact[] = []
    try {
      for (const [index, output] of outputs.entries()) {
        artifacts.push(
          await publishArtifact(
            output,
            call.kind,
            directory,
            call.operationId,
            index,
            this.#download,
            this.#requestTimeoutMs,
            signal,
          ),
        )
      }
      return artifacts.map(({ artifact }) => artifact)
    } catch (error) {
      await Promise.all(
        artifacts.map(({ absolutePath }) =>
          rm(absolutePath, { force: true }).catch(() => undefined),
        ),
      )
      throw error
    }
  }

  #create(call: ParsedGenerationCall, signal: AbortSignal) {
    if (call.kind === "audio") {
      return this.router.createAudio(
        {
          ...(call.format === undefined ? {} : { format: call.format }),
          idempotency_key: call.operationId,
          model: call.model.id,
          prompt: call.prompt,
          provider: this.provider,
        },
        signal,
      )
    }
    if (call.kind === "image") {
      return this.router.createImage(
        {
          ...(call.aspectRatio === undefined
            ? {}
            : { aspect_ratio: call.aspectRatio }),
          idempotency_key: call.operationId,
          model: call.model.id,
          ...(call.n === undefined ? {} : { n: call.n }),
          prompt: call.prompt,
          provider: this.provider,
          ...(call.resolution === undefined
            ? {}
            : { resolution: call.resolution }),
          ...(call.size === undefined ? {} : { size: call.size }),
        },
        signal,
      )
    }
    return this.router.createVideo(
      {
        ...(call.aspectRatio === undefined
          ? {}
          : { aspect_ratio: call.aspectRatio }),
        ...(call.duration === undefined ? {} : { duration: call.duration }),
        idempotency_key: call.operationId,
        model: call.model.id,
        prompt: call.prompt,
        provider: this.provider,
        ...(call.resolution === undefined
          ? {}
          : { resolution: call.resolution }),
        ...(call.seed === undefined ? {} : { seed: call.seed }),
      },
      signal,
    )
  }

  #get(kind: GenerationKind, id: string, signal: AbortSignal) {
    if (kind === "audio") return this.router.getAudio(id, signal)
    if (kind === "image") return this.router.getImage(id, signal)
    return this.router.getVideo(id, signal)
  }
}
