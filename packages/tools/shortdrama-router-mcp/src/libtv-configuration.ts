import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises"
import path from "node:path"

import type {
  LibTvConfigurationSnapshot,
  LibTvConfigurationSource,
  ProviderResource,
} from "shortdrama-router"

const configurationSchema =
  "convax.shortdrama-router-libtv-configuration/1" as const
const maximumConfigurationBytes = 32 * 1024

function configurationError() {
  return new Error("Unable to access the local LibTV configuration")
}

function normalizedResource(value: unknown): ProviderResource {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw configurationError()
  }
  const input = value as Record<string, unknown>
  if (
    Object.keys(input).some((key) => !["id", "name", "type"].includes(key))
    || typeof input.id !== "string"
    || input.id.length === 0
    || input.id.length > 512
    || typeof input.name !== "string"
    || input.name.length === 0
    || input.name.length > 512
    || typeof input.type !== "string"
    || input.type.length === 0
    || input.type.length > 128
    || /[\u0000-\u001f\u007f]/u.test(`${input.id}${input.name}${input.type}`)
  ) {
    throw configurationError()
  }
  return { id: input.id, name: input.name, type: input.type }
}

async function privateDirectory(directory: string) {
  await mkdir(directory, { mode: 0o700, recursive: true })
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) throw configurationError()
  await chmod(directory, 0o700)
}

export class FileLibTvConfigurationSource implements LibTvConfigurationSource {
  constructor(readonly filePath: string) {
    if (!path.isAbsolute(filePath) || filePath.includes("\0")) {
      throw configurationError()
    }
  }

  async read(): Promise<LibTvConfigurationSnapshot> {
    let handle
    try {
      handle = await open(
        this.filePath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
      throw configurationError()
    }
    try {
      const info = await handle.stat()
      if (
        !info.isFile()
        || (info.mode & 0o077) !== 0
        || info.size <= 0
        || info.size > maximumConfigurationBytes
      ) {
        throw configurationError()
      }
      let input: Record<string, unknown>
      try {
        input = JSON.parse(await handle.readFile("utf8")) as Record<string, unknown>
      } catch {
        throw configurationError()
      }
      if (
        !input
        || typeof input !== "object"
        || Array.isArray(input)
        || input.schema !== configurationSchema
        || Object.keys(input).some((key) => !["project", "schema"].includes(key))
      ) {
        throw configurationError()
      }
      return input.project === undefined
        ? {}
        : { project: normalizedResource(input.project) }
    } finally {
      await handle.close()
    }
  }

  async write(snapshot: LibTvConfigurationSnapshot) {
    if (!snapshot.project) throw configurationError()
    const project = normalizedResource(snapshot.project)
    const serialized = `${JSON.stringify({
      project,
      schema: configurationSchema,
    })}\n`
    const directory = path.dirname(this.filePath)
    await privateDirectory(directory)
    const temporaryPath = path.join(
      directory,
      `.libtv-configuration-${randomUUID()}.tmp`,
    )
    let handle
    try {
      handle = await open(
        temporaryPath,
        constants.O_CREAT
          | constants.O_EXCL
          | constants.O_WRONLY
          | constants.O_NOFOLLOW,
        0o600,
      )
      await handle.writeFile(serialized, "utf8")
      await handle.sync()
      await handle.close()
      handle = undefined
      await rename(temporaryPath, this.filePath)
    } catch {
      throw configurationError()
    } finally {
      await handle?.close().catch(() => undefined)
      await rm(temporaryPath, { force: true }).catch(() => undefined)
    }
  }

  async clear() {
    try {
      const info = await lstat(this.filePath)
      if (!info.isFile() && !info.isSymbolicLink()) throw configurationError()
      await rm(this.filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw configurationError()
    }
  }
}
