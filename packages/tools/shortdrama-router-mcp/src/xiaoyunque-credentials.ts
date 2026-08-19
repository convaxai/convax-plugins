import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import {
  chmod,
  lstat,
  mkdir,
  open,
  rename,
  rm,
} from "node:fs/promises"
import path from "node:path"

import {
  normalizeWebSession,
  type XiaoYunqueCredentialSnapshot,
  type XiaoYunqueCredentialSource,
  type XiaoYunqueWebSession,
} from "shortdrama-router"

const credentialFileSchema =
  "convax.shortdrama-router-xiaoyunque-credentials/1" as const
const maximumCredentialFileBytes = 96 * 1024

interface StagedCombinedCredential {
  committed: boolean
  session: XiaoYunqueWebSession
}

function credentialError() {
  return new Error("Unable to access the local XiaoYunque authorization")
}

function noFollowFlag() {
  const value = constants.O_NOFOLLOW as number | undefined
  if (!Number.isSafeInteger(value) || value === 0) throw credentialError()
  return value!
}

function strictRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw credentialError()
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw credentialError()
  return value as Record<string, unknown>
}

function normalizedAccessKey(value: unknown) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw credentialError()
  }
  if (value.length > 8_192 || /[\u0000-\u0020\u007f]/u.test(value)) {
    throw credentialError()
  }
  return value
}

function normalizedExpiry(value: unknown) {
  if (typeof value !== "string") throw credentialError()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw credentialError()
  return date.toISOString()
}

function normalizeSnapshot(value: unknown): XiaoYunqueCredentialSnapshot {
  const input = strictRecord(value)
  const allowed = new Set([
    "access_key",
    "access_key_expires_at",
    "schema",
    "web_session",
  ])
  if (
    input.schema !== credentialFileSchema
    || Object.keys(input).some((key) => !allowed.has(key))
  ) {
    throw credentialError()
  }
  const accessKey = input.access_key === undefined
    ? undefined
    : normalizedAccessKey(input.access_key)
  if (input.access_key_expires_at !== undefined && accessKey === undefined) {
    throw credentialError()
  }
  let webSession: XiaoYunqueWebSession | undefined
  try {
    webSession = normalizeWebSession(
      input.web_session as XiaoYunqueWebSession | undefined,
    )
  } catch {
    throw credentialError()
  }
  return {
    ...(accessKey === undefined ? {} : { access_key: accessKey }),
    ...(input.access_key_expires_at === undefined
      ? {}
      : { access_key_expires_at: normalizedExpiry(input.access_key_expires_at) }),
    ...(webSession === undefined ? {} : { web_session: webSession }),
  }
}

async function requirePrivateDirectory(directory: string) {
  await mkdir(directory, { mode: 0o700, recursive: true })
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) throw credentialError()
  await chmod(directory, 0o700)
}

async function inspectExistingFile(filePath: string) {
  try {
    const info = await lstat(filePath)
    if (!info.isFile() || info.isSymbolicLink()) throw credentialError()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}

export class FileXiaoYunqueCredentialSource
implements XiaoYunqueCredentialSource {
  #combined: StagedCombinedCredential | undefined
  readonly #combinedContext = new AsyncLocalStorage<StagedCombinedCredential>()

  constructor(readonly filePath: string) {
    if (!path.isAbsolute(filePath) || filePath.includes("\0")) {
      throw credentialError()
    }
  }

  async read(): Promise<XiaoYunqueCredentialSnapshot> {
    let handle
    try {
      handle = await open(this.filePath, constants.O_RDONLY | noFollowFlag())
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
      throw credentialError()
    }
    try {
      const info = await handle.stat()
      if (
        !info.isFile()
        || (info.mode & 0o077) !== 0
        || info.size <= 0
        || info.size > maximumCredentialFileBytes
      ) {
        throw credentialError()
      }
      const bytes = await handle.readFile()
      if (bytes.byteLength !== info.size) throw credentialError()
      let parsed: unknown
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
        parsed = JSON.parse(text) as unknown
      } catch {
        throw credentialError()
      }
      return normalizeSnapshot(parsed)
    } finally {
      await handle.close()
    }
  }

  async setAccessKey(accessKey: string, expiresAt?: string) {
    const staged = this.#combinedContext.getStore()
    if (
      (staged && this.#combined !== staged)
      || (this.#combined && staged !== this.#combined)
    ) {
      // A timed-out enrollment may continue running because the upstream
      // Promise ignored AbortSignal. Its async context is stale and must never
      // publish an Access Key after the combined transaction was retired.
      throw credentialError()
    }
    const normalized = normalizedAccessKey(accessKey)
    const expiry = expiresAt === undefined ? undefined : normalizedExpiry(expiresAt)
    const current = await this.read()
    const {
      access_key: _oldAccessKey,
      access_key_expires_at: _oldAccessKeyExpiry,
      ...retained
    } = current
    await this.#write({
      ...retained,
      access_key: normalized,
      ...(expiry === undefined ? {} : { access_key_expires_at: expiry }),
      ...(staged === undefined
        ? {}
        : { web_session: staged.session }),
    })
    if (staged) staged.committed = true
  }

  async setWebSession(session: XiaoYunqueWebSession) {
    const normalized = normalizeWebSession(session)
    if (!normalized) throw credentialError()
    await this.#write({ ...(await this.read()), web_session: normalized })
  }

  async completeWithWebSession<T>(
    session: XiaoYunqueWebSession,
    action: () => Promise<T>,
  ): Promise<T | undefined> {
    if (this.#combined) throw credentialError()
    const normalized = normalizeWebSession(session)
    if (!normalized) throw credentialError()
    const staged: StagedCombinedCredential = {
      committed: false,
      session: normalized,
    }
    this.#combined = staged
    try {
      try {
        const result = await this.#combinedContext.run(staged, action)
        if (!staged.committed) {
          throw new Error(
            "XiaoYunque enrollment did not publish an Access Key",
          )
        }
        return result
      } catch (error) {
        // setAccessKey is the single atomic publication point. If the upstream
        // provider reports a later probe failure, retain the complete new
        // snapshot and let the caller's independent status probe describe it.
        if (staged.committed) return undefined
        throw error
      }
    } finally {
      if (this.#combined === staged) this.#combined = undefined
    }
  }

  async clear() {
    this.#combined = undefined
    try {
      const info = await lstat(this.filePath)
      if (!info.isFile() && !info.isSymbolicLink()) throw credentialError()
      await rm(this.filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw credentialError()
    }
  }

  async #write(snapshot: XiaoYunqueCredentialSnapshot) {
    const normalized = normalizeSnapshot({
      ...snapshot,
      schema: credentialFileSchema,
    })
    const serialized = `${JSON.stringify({
      ...normalized,
      schema: credentialFileSchema,
    })}\n`
    if (Buffer.byteLength(serialized, "utf8") > maximumCredentialFileBytes) {
      throw credentialError()
    }
    const directory = path.dirname(this.filePath)
    await requirePrivateDirectory(directory)
    await inspectExistingFile(this.filePath)
    const temporaryPath = path.join(
      directory,
      `.xiaoyunque-credentials-${randomUUID()}.tmp`,
    )
    let handle
    try {
      handle = await open(
        temporaryPath,
        constants.O_CREAT
          | constants.O_EXCL
          | constants.O_WRONLY
          | noFollowFlag(),
        0o600,
      )
      await handle.chmod(0o600)
      await handle.writeFile(serialized, "utf8")
      await handle.sync()
      await handle.close()
      handle = undefined
      await rename(temporaryPath, this.filePath)
      try {
        const directoryHandle = await open(directory, "r")
        try {
          await directoryHandle.sync()
        } finally {
          await directoryHandle.close()
        }
      } catch {
        // The fully fsynced file was already atomically published.
      }
    } catch {
      throw credentialError()
    } finally {
      await handle?.close().catch(() => undefined)
      await rm(temporaryPath, { force: true }).catch(() => undefined)
    }
  }
}

export function defaultCredentialFile(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const xdg = environment.XDG_CONFIG_HOME?.trim()
  if (xdg && path.isAbsolute(xdg)) {
    return path.join(
      xdg,
      "convax",
      "shortdrama-router",
      "xiaoyunque-credentials.json",
    )
  }
  const userHome = environment.HOME?.trim()
  if (!userHome || !path.isAbsolute(userHome)) {
    throw new Error("A valid home directory is required for authorization")
  }
  const directory = process.platform === "darwin"
    ? path.join(
        userHome,
        "Library",
        "Application Support",
        "Convax",
        "ShortDramaRouter",
      )
    : path.join(userHome, ".config", "convax", "shortdrama-router")
  return path.join(directory, "xiaoyunque-credentials.json")
}
