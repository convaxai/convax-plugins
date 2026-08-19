import { Database } from "bun:sqlite"
import { constants } from "node:fs"
import { chmod, lstat, mkdir, open } from "node:fs/promises"
import path from "node:path"

import type {
  AudioJobStore,
  ImageJobStore,
  StoredAudioJob,
  StoredImageJob,
  StoredVideoJob,
  VideoJobStore,
} from "shortdrama-router"

import type { GenerationKind } from "./contracts.ts"

type StoredGenerationJob = StoredAudioJob | StoredImageJob | StoredVideoJob
type DurableJobStore = AudioJobStore & ImageJobStore & VideoJobStore

const maximumStoredJobBytes = 1024 * 1024
const digestPattern = /^[a-f0-9]{64}$/u
const jobStatuses = new Set([
  "submitting",
  "submission_unknown",
  "queued",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
])

interface StoredRow {
  idempotency_key: string | null
  job_id: string
  payload: string
  request_hash: string | null
  version: number
}

function storeError() {
  return new Error("Unable to access the durable generation journal")
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw storeError()
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw storeError()
  return value as Record<string, unknown>
}

function boundedText(value: unknown, maximum: number) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximum
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw storeError()
  }
  return value
}

function normalizedStoredJob(
  value: unknown,
  expectedId?: string,
): StoredGenerationJob {
  const stored = plainRecord(value)
  const job = plainRecord(stored.job)
  const id = boundedText(job.id, 512)
  if (expectedId !== undefined && id !== expectedId) throw storeError()
  boundedText(job.model, 512)
  boundedText(job.provider, 128)
  boundedText(job.created_at, 64)
  boundedText(job.updated_at, 64)
  if (typeof job.status !== "string" || !jobStatuses.has(job.status)) {
    throw storeError()
  }
  if (
    stored.version !== undefined
    && (!Number.isSafeInteger(stored.version) || Number(stored.version) < 1)
  ) {
    throw storeError()
  }
  for (const key of ["idempotency_key", "request_hash"] as const) {
    const item = stored[key]
    if (item !== undefined && (typeof item !== "string" || !digestPattern.test(item))) {
      throw storeError()
    }
  }
  if (stored.idempotency_key !== undefined && stored.request_hash === undefined) {
    throw storeError()
  }
  if (stored.reference !== undefined) plainRecord(stored.reference)
  return structuredClone(value) as StoredGenerationJob
}

function serializedStoredJob(value: StoredGenerationJob) {
  const normalized = normalizedStoredJob(value)
  const serialized = JSON.stringify(normalized)
  if (Buffer.byteLength(serialized, "utf8") > maximumStoredJobBytes) {
    throw storeError()
  }
  return serialized
}

function rowValue(row: StoredRow | null): StoredGenerationJob | undefined {
  if (!row) return undefined
  if (
    !Number.isSafeInteger(row.version)
    || row.version < 1
    || row.payload.length === 0
    || Buffer.byteLength(row.payload, "utf8") > maximumStoredJobBytes
  ) {
    throw storeError()
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(row.payload) as unknown
  } catch {
    throw storeError()
  }
  const value = normalizedStoredJob(parsed, row.job_id)
  if (
    value.version !== row.version
    || (value.idempotency_key ?? null) !== row.idempotency_key
    || (value.request_hash ?? null) !== row.request_hash
  ) {
    throw storeError()
  }
  return value
}

async function privateDatabaseFile(filePath: string) {
  if (!path.isAbsolute(filePath) || filePath.includes("\0")) throw storeError()
  const directory = path.dirname(filePath)
  await mkdir(directory, { mode: 0o700, recursive: true })
  const directoryInfo = await lstat(directory)
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
    throw storeError()
  }
  await chmod(directory, 0o700)
  let handle
  try {
    handle = await open(
      filePath,
      constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
      0o600,
    )
    const info = await handle.stat()
    if (!info.isFile()) throw storeError()
    await handle.chmod(0o600)
  } catch {
    throw storeError()
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

class SqliteJobStore implements DurableJobStore {
  readonly #findById
  readonly #findByIdempotency
  readonly #database: Database

  private constructor(
    readonly kind: GenerationKind,
    database: Database,
  ) {
    this.#database = database
    this.#findById = database.query<StoredRow, [string, string]>(
      `SELECT job_id, idempotency_key, request_hash, version, payload
       FROM generation_jobs WHERE kind = ? AND job_id = ?`,
    )
    this.#findByIdempotency = database.query<StoredRow, [string, string]>(
      `SELECT job_id, idempotency_key, request_hash, version, payload
       FROM generation_jobs WHERE kind = ? AND idempotency_key = ?`,
    )
  }

  static async open(kind: GenerationKind, filePath: string) {
    await privateDatabaseFile(filePath)
    let database: Database | undefined
    try {
      database = new Database(filePath, {
        create: true,
        readwrite: true,
        strict: true,
      })
      database.run("PRAGMA busy_timeout = 5000")
      database.run("PRAGMA journal_mode = WAL")
      database.run("PRAGMA synchronous = FULL")
      database.run(`CREATE TABLE IF NOT EXISTS generation_jobs (
        kind TEXT NOT NULL CHECK (kind IN ('audio', 'image', 'video')),
        job_id TEXT NOT NULL,
        idempotency_key TEXT,
        request_hash TEXT,
        version INTEGER NOT NULL CHECK (version >= 1),
        payload TEXT NOT NULL,
        PRIMARY KEY (kind, job_id),
        UNIQUE (kind, idempotency_key)
      ) STRICT`)
      return new SqliteJobStore(kind, database)
    } catch {
      database?.close()
      throw storeError()
    }
  }

  async claim(value: StoredGenerationJob) {
    const input = normalizedStoredJob(value)
    const claimed = this.#database.transaction(() => {
      const existing = input.idempotency_key
        ? rowValue(this.#findByIdempotency.get(this.kind, input.idempotency_key))
        : rowValue(this.#findById.get(this.kind, input.job.id))
      if (existing) {
        if (existing.request_hash !== input.request_hash) {
          throw new Error("Generation idempotency key conflicts with existing input")
        }
        return { created: false, value: existing }
      }
      const created = { ...input, version: 1 }
      this.#insert(created)
      return { created: true, value: created }
    }).immediate()
    return structuredClone(claimed)
  }

  async compareAndSet(
    id: string,
    expectedVersion: number,
    value: StoredGenerationJob,
  ) {
    const input = normalizedStoredJob(value, id)
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw storeError()
    }
    const next = { ...input, version: expectedVersion + 1 }
    const payload = serializedStoredJob(next)
    const result = this.#database.run(
      `UPDATE generation_jobs
       SET idempotency_key = ?, request_hash = ?, version = ?, payload = ?
       WHERE kind = ? AND job_id = ? AND version = ?`,
      [
        next.idempotency_key ?? null,
        next.request_hash ?? null,
        next.version,
        payload,
        this.kind,
        id,
        expectedVersion,
      ],
    )
    return result.changes === 1
  }

  async get(id: string) {
    boundedText(id, 512)
    return rowValue(this.#findById.get(this.kind, id))
  }

  async getByIdempotencyKey(key: string) {
    if (!digestPattern.test(key)) throw storeError()
    return rowValue(this.#findByIdempotency.get(this.kind, key))
  }

  async put(value: StoredGenerationJob) {
    const input = normalizedStoredJob(value)
    this.#database.transaction(() => {
      const current = rowValue(this.#findById.get(this.kind, input.job.id))
      const next = {
        ...input,
        version: input.version ?? (current?.version ?? 0) + 1,
      }
      const payload = serializedStoredJob(next)
      this.#database.run(
        `INSERT INTO generation_jobs
          (kind, job_id, idempotency_key, request_hash, version, payload)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (kind, job_id) DO UPDATE SET
          idempotency_key = excluded.idempotency_key,
          request_hash = excluded.request_hash,
          version = excluded.version,
          payload = excluded.payload`,
        [
          this.kind,
          next.job.id,
          next.idempotency_key ?? null,
          next.request_hash ?? null,
          next.version,
          payload,
        ],
      )
    }).immediate()
  }

  close() {
    this.#database.close()
  }

  #insert(value: StoredGenerationJob & { version: number }) {
    this.#database.run(
      `INSERT INTO generation_jobs
        (kind, job_id, idempotency_key, request_hash, version, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        this.kind,
        value.job.id,
        value.idempotency_key ?? null,
        value.request_hash ?? null,
        value.version,
        serializedStoredJob(value),
      ],
    )
  }
}

export async function openProviderJobStores(filePath: string) {
  const opened: SqliteJobStore[] = []
  try {
    const audio = await SqliteJobStore.open("audio", filePath)
    opened.push(audio)
    const image = await SqliteJobStore.open("image", filePath)
    opened.push(image)
    const video = await SqliteJobStore.open("video", filePath)
    opened.push(video)
    return {
      audio,
      close() {
        for (const store of opened.splice(0)) store.close()
      },
      image,
      video,
    }
  } catch (error) {
    for (const store of opened) store.close()
    throw error
  }
}
