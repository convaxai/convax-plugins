import { createHash, randomBytes } from "node:crypto"
import { constants, createReadStream } from "node:fs"
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import path from "node:path"

import {
  generationLroAcknowledgementSchema,
  generationLroResultSchema,
  type GenerationArtifact,
  type GenerationKind,
  type ProviderId,
  type ToolResult,
} from "./contracts.ts"

export const generationJournalSchema =
  "convax.shortdrama-generation-operation/1" as const

const maximumRecordBytes = 1024 * 1024
const maximumArtifactBytes = 1024 * 1024 * 1024
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u
const digestPattern = /^[a-f0-9]{64}$/u
const safeTaskIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u
const unsafeTaskIdSegment =
  /(?:^|[._:-])(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|access[-_]?key|ak|sk)(?:[._:-]|$)/iu
const statuses = new Set([
  "prepared",
  "submitted",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
])

export interface StoredGenerationArtifact extends GenerationArtifact {
  byteDigest: string
  size: number
  storedFile: string
}

export interface GenerationJournalRecord {
  call: Record<string, unknown>
  callFingerprint: string
  createdAt: string
  error?: { code: string; message: string }
  jobId?: string
  kind: GenerationKind
  operationId: string
  provider: ProviderId
  requestDigest: string
  result?: {
    artifacts: StoredGenerationArtifact[]
    resultDigest: string
  }
  schema: typeof generationJournalSchema
  status:
    | "prepared"
    | "submitted"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "unknown"
  taskId: string
  updatedAt: string
}

export class GenerationOperationJournal {
  readonly directory: string

  constructor(
    readonly provider: ProviderId,
    directory: string,
  ) {
    if (!path.isAbsolute(directory) || directory.includes("\0")) {
      throw new Error("Generation recovery directory is invalid")
    }
    this.directory = path.normalize(directory)
  }

  async authority() {
    const metadata = await lstat(this.directory)
    if (
      !metadata.isDirectory()
      || metadata.isSymbolicLink()
      || (metadata.mode & 0o077) !== 0
    ) {
      throw new Error("Generation recovery directory is not private")
    }
    return realpath(this.directory)
  }

  async binding() {
    return `shortdrama.${createHash("sha256")
      .update(`${this.provider}\0${await this.authority()}`)
      .digest("hex")}`
  }

  async create(record: GenerationJournalRecord) {
    await this.authority()
    validateRecord(record, this.provider)
    const existing = await this.read(record.operationId)
    if (existing) {
      assertSameIdentity(existing, record)
      return existing
    }
    await mkdir(this.artifactDirectory(record.operationId), {
      mode: 0o700,
      recursive: false,
    }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error
    })
    await chmod(this.artifactDirectory(record.operationId), 0o700)
    await this.#write(record, true)
    return record
  }

  async read(operationId: string): Promise<GenerationJournalRecord | null> {
    const target = this.#recordPath(operationId)
    try {
      const metadata = await lstat(target)
      if (
        !metadata.isFile()
        || metadata.isSymbolicLink()
        || (metadata.mode & 0o077) !== 0
        || metadata.size < 1
        || metadata.size > maximumRecordBytes
      ) {
        throw new Error("Generation recovery record is invalid")
      }
      const serialized = await readFile(target, "utf8")
      const parsed = JSON.parse(serialized) as unknown
      validateRecord(parsed, this.provider)
      if (parsed.operationId !== operationId) {
        throw new Error("Generation recovery record identity is invalid")
      }
      return parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    }
  }

  async write(record: GenerationJournalRecord) {
    validateRecord(record, this.provider)
    const existing = await this.read(record.operationId)
    if (!existing) throw new Error("Generation recovery record is missing")
    assertSameIdentity(existing, record)
    await this.#write(record, false)
  }

  artifactDirectory(operationId: string) {
    return path.join(this.directory, `${operationKey(operationId)}.artifacts`)
  }

  async captureResult(
    record: GenerationJournalRecord,
    artifacts: readonly GenerationArtifact[],
  ) {
    if (artifacts.length < 1 || artifacts.length > 8) {
      throw new Error("Generation recovery artifacts are invalid")
    }
    const artifactDirectory = await realpath(
      this.artifactDirectory(record.operationId),
    )
    const stored: StoredGenerationArtifact[] = []
    for (const artifact of artifacts) {
      if (
        typeof artifact.path !== "string"
        || typeof artifact.name !== "string"
        || typeof artifact.mimeType !== "string"
        || artifact.path !== artifact.name
        || !portableFileName(artifact.path)
      ) {
        throw new Error("Generation recovery artifact identity is invalid")
      }
      const filePath = path.join(artifactDirectory, artifact.path)
      const resolved = await realpath(filePath)
      if (path.dirname(resolved) !== artifactDirectory) {
        throw new Error("Generation recovery artifact escaped its directory")
      }
      const metadata = await lstat(filePath)
      if (
        !metadata.isFile()
        || metadata.isSymbolicLink()
        || metadata.size < 1
        || metadata.size > maximumArtifactBytes
      ) {
        throw new Error("Generation recovery artifact is invalid")
      }
      stored.push({
        byteDigest: await fileDigest(filePath),
        mimeType: artifact.mimeType,
        name: artifact.name,
        path: artifact.path,
        size: metadata.size,
        storedFile: artifact.path,
      })
    }
    return {
      artifacts: stored,
      resultDigest: recoveryResultDigest(stored),
    }
  }

  async materialize(
    record: GenerationJournalRecord,
    outputDirectory: string,
  ) {
    if (!record.result) throw new Error("Generation recovery result is unavailable")
    const destinationRoot = await validateOutputDirectory(outputDirectory)
    const sourceRoot = await realpath(this.artifactDirectory(record.operationId))
    for (const artifact of record.result.artifacts) {
      const source = path.join(sourceRoot, artifact.storedFile)
      const sourceMetadata = await lstat(source)
      if (
        !sourceMetadata.isFile()
        || sourceMetadata.isSymbolicLink()
        || sourceMetadata.size !== artifact.size
        || path.dirname(await realpath(source)) !== sourceRoot
        || await fileDigest(source) !== artifact.byteDigest
      ) {
        throw new Error("Generation recovery stored artifact is invalid")
      }
      const destination = path.join(destinationRoot, artifact.path)
      try {
        await copyFile(source, destination, constants.COPYFILE_EXCL)
        await chmod(destination, 0o600)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      }
      const destinationMetadata = await lstat(destination)
      if (
        !destinationMetadata.isFile()
        || destinationMetadata.isSymbolicLink()
        || destinationMetadata.size !== artifact.size
        || await fileDigest(destination) !== artifact.byteDigest
      ) {
        await rm(destination, { force: true }).catch(() => undefined)
        throw new Error("Generation recovery output conflicts")
      }
    }
    return generationToolResult(record.result.artifacts)
  }

  async remove(record: GenerationJournalRecord) {
    await rm(this.#recordPath(record.operationId), { force: true })
    await rm(this.artifactDirectory(record.operationId), {
      force: true,
      recursive: true,
    })
  }

  async #write(record: GenerationJournalRecord, exclusive: boolean) {
    await this.authority()
    const target = this.#recordPath(record.operationId)
    const temporary = path.join(
      this.directory,
      `.shortdrama-operation-${randomBytes(12).toString("hex")}.tmp`,
    )
    const serialized = `${JSON.stringify(record)}\n`
    if (Buffer.byteLength(serialized, "utf8") > maximumRecordBytes) {
      throw new Error("Generation recovery record is too large")
    }
    try {
      await writeFile(temporary, serialized, {
        encoding: "utf8",
        flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        mode: 0o600,
      })
      const handle = await open(temporary, constants.O_RDONLY)
      try {
        await handle.sync()
      } finally {
        await handle.close()
      }
      if (exclusive) {
        try {
          const targetHandle = await open(
            target,
            constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
            0o600,
          )
          try {
            await targetHandle.writeFile(serialized)
            await targetHandle.sync()
          } finally {
            await targetHandle.close()
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
          const existing = await this.read(record.operationId)
          if (!existing) throw new Error("Generation recovery record conflicts")
          assertSameIdentity(existing, record)
        }
      } else {
        await rename(temporary, target)
      }
      await chmod(target, 0o600)
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined)
    }
  }

  #recordPath(operationId: string) {
    return path.join(this.directory, `${operationKey(operationId)}.json`)
  }
}

export function generationToolResult(
  artifacts: readonly Pick<GenerationArtifact, "mimeType" | "name" | "path">[],
): ToolResult {
  return {
    content: [
      {
        text: "Generation completed and artifacts were stored locally.",
        type: "text",
      },
    ],
    structuredContent: {
      artifacts: artifacts.map(({ mimeType, name, path: artifactPath }) => ({
        mimeType,
        name,
        path: artifactPath,
      })),
    },
  }
}

export function recoveryResultDigest(
  artifacts: readonly StoredGenerationArtifact[],
) {
  const result = generationToolResult(artifacts)
  return createHash("sha256")
    .update(stableJson({
      artifacts: artifacts.map((artifact) => ({
        file: {
          relativePath: artifact.path,
          sha256: artifact.byteDigest,
          size: artifact.size,
        },
        mimeType: artifact.mimeType,
        name: artifact.name,
        path: artifact.path,
      })),
      content: result.content,
    }))
    .digest("hex")
}

export function recoveryResultEnvelope(
  result: ToolResult,
  resultDigest: string,
) {
  return {
    result,
    resultDigest,
    schema: generationLroResultSchema,
  }
}

export function recoveryAcknowledgement() {
  return {
    acknowledged: true,
    schema: generationLroAcknowledgementSchema,
  }
}

function operationKey(operationId: string) {
  if (!operationIdPattern.test(operationId)) {
    throw new Error("Generation recovery operation id is invalid")
  }
  return createHash("sha256").update(operationId).digest("hex")
}

function assertSameIdentity(
  left: GenerationJournalRecord,
  right: GenerationJournalRecord,
) {
  if (
    left.requestDigest !== right.requestDigest
    || left.callFingerprint !== right.callFingerprint
    || left.kind !== right.kind
    || left.provider !== right.provider
  ) {
    throw new Error("Generation recovery operation identity conflicts")
  }
}

function validateRecord(
  value: unknown,
  provider: ProviderId,
): asserts value is GenerationJournalRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Generation recovery record is invalid")
  }
  const input = value as Partial<GenerationJournalRecord>
  if (
    input.schema !== generationJournalSchema
    || input.provider !== provider
    || typeof input.operationId !== "string"
    || !operationIdPattern.test(input.operationId)
    || typeof input.requestDigest !== "string"
    || !digestPattern.test(input.requestDigest)
    || typeof input.callFingerprint !== "string"
    || !digestPattern.test(input.callFingerprint)
    || !["audio", "image", "video"].includes(String(input.kind))
    || !statuses.has(String(input.status))
    || !validDate(input.createdAt)
    || !validDate(input.updatedAt)
    || typeof input.taskId !== "string"
    || !safeTaskIdPattern.test(input.taskId)
    || unsafeTaskIdSegment.test(input.taskId)
    || !validCall(input.call, input.operationId, input.kind)
    || !optionalText(input.jobId, 512)
    || !optionalError(input.error)
    || !optionalResult(input.result)
  ) {
    throw new Error("Generation recovery record is invalid")
  }
  if (
    typeof input.status === "string"
    && ["submitted", "running", "succeeded"].includes(input.status)
    && input.jobId === undefined
  ) {
    throw new Error("Generation recovery receipt is missing")
  }
  if (input.status === "succeeded" && input.result === undefined) {
    throw new Error("Generation recovery result is incomplete")
  }
}

function validCall(
  value: unknown,
  operationId: unknown,
  kind: unknown,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const call = value as Record<string, unknown>
  if (
    call.operation_id !== operationId
    || call.output !== kind
    || call.output_directory !== undefined
    || !Array.isArray(call.references)
    || call.references.length !== 0
  ) {
    return false
  }
  try {
    const serialized = JSON.stringify(call)
    return Buffer.byteLength(serialized, "utf8") <= 128 * 1024
  } catch {
    return false
  }
}

function optionalResult(value: unknown) {
  if (value === undefined) return true
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  if (
    typeof result.resultDigest !== "string"
    || !digestPattern.test(result.resultDigest)
    || !Array.isArray(result.artifacts)
    || result.artifacts.length < 1
    || result.artifacts.length > 8
  ) {
    return false
  }
  return result.artifacts.every((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const artifact = value as Record<string, unknown>
    return (
      typeof artifact.byteDigest === "string"
      && digestPattern.test(artifact.byteDigest)
      && typeof artifact.size === "number"
      && Number.isSafeInteger(artifact.size)
      && artifact.size >= 1
      && artifact.size <= maximumArtifactBytes
      && typeof artifact.mimeType === "string"
      && artifact.mimeType.length <= 128
      && typeof artifact.name === "string"
      && artifact.name === artifact.path
      && artifact.path === artifact.storedFile
      && portableFileName(artifact.name)
    )
  })
}

function optionalError(value: unknown) {
  if (value === undefined) return true
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const error = value as Record<string, unknown>
  return (
    Object.keys(error).length === 2
    && typeof error.code === "string"
    && /^[a-z][a-z0-9._-]{0,63}$/u.test(error.code)
    && typeof error.message === "string"
    && error.message.length >= 1
    && error.message.length <= 512
    && error.message.trim() === error.message
    && !/[\u0000-\u001f\u007f]/u.test(error.message)
  )
}

function optionalText(value: unknown, maximum: number) {
  return value === undefined || (
    typeof value === "string"
    && value.length >= 1
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/u.test(value)
  )
}

function validDate(value: unknown) {
  return typeof value === "string"
    && Number.isFinite(new Date(value).getTime())
    && new Date(value).toISOString() === value
}

function portableFileName(value: string) {
  return value.length >= 1
    && value.length <= 191
    && value !== "."
    && value !== ".."
    && !value.includes("/")
    && !value.includes("\\")
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

async function validateOutputDirectory(value: string) {
  if (
    !path.isAbsolute(value)
    || value.includes("\0")
    || value.length > 4_096
  ) {
    throw new Error("Generation recovery output directory is invalid")
  }
  const metadata = await lstat(value)
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Generation recovery output directory is invalid")
  }
  return realpath(value)
}

async function fileDigest(filePath: string) {
  const digest = createHash("sha256")
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on("data", (chunk) => digest.update(chunk))
    stream.once("error", reject)
    stream.once("end", resolve)
  })
  return digest.digest("hex")
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>
    return `{${Object.keys(input)
      .filter((key) => input[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(input[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}
