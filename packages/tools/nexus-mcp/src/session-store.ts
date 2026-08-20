/*
import { randomBytes } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  workspaceSlug,
  type HostedRefreshGrant,
  type HostedSession,
} from "./contracts.ts"

function sessionPath(environment: Readonly<Record<string, string | undefined>>) {
  const configured = environment.XDG_CONFIG_HOME
  const root = configured && path.isAbsolute(configured)
    ? configured
    : path.join(environment.HOME || os.homedir(), ".config")
  return path.join(root, "convax", "service-credentials", "nexus-service.json")
}

function validNexusOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    return (
      url.href === `${url.origin}/` &&
      (url.protocol === "https:" || url.origin === "http://localhost:3000")
    )
  } catch {
    return false
  }
}

function validRefreshGrant(value: unknown): value is HostedRefreshGrant {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const input = value as Partial<HostedRefreshGrant>
  return (
    input.schema === "convax.nexus-refresh-grant/1" &&
    input.workspaceSlug === workspaceSlug &&
    validNexusOrigin(input.nexusOrigin) &&
    typeof input.refreshToken === "string" &&
    input.refreshToken.length > 20
  )
}

function legacyRefreshGrant(value: unknown): HostedRefreshGrant | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const input = value as Partial<HostedSession>
  if (
    input.schema !== "convax.nexus-session/1" ||
    input.workspaceSlug !== workspaceSlug ||
    !validNexusOrigin(input.nexusOrigin) ||
    typeof input.refreshToken !== "string" ||
    input.refreshToken.length <= 20
  ) {
    return undefined
  }
  return {
    nexusOrigin: input.nexusOrigin,
    refreshToken: input.refreshToken,
    schema: "convax.nexus-refresh-grant/1",
    workspaceSlug,
  }
}

export class NexusSessionStore {
  readonly path: string

  constructor(environment: Readonly<Record<string, string | undefined>> = process.env) {
    this.path = sessionPath(environment)
  }

  async read(): Promise<HostedRefreshGrant | null> {
    try {
      const stat = await fs.stat(this.path)
      if (!stat.isFile() || (stat.mode & 0o077) !== 0) {
        throw new Error("Nexus session file permissions are not private")
      }
      const value = JSON.parse(await fs.readFile(this.path, "utf8")) as unknown
      if (validRefreshGrant(value)) return value
      const migrated = legacyRefreshGrant(value)
      if (!migrated) throw new Error("Nexus session file is invalid")
      await this.write(migrated)
      return migrated
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    }
  }

  async write(session: HostedRefreshGrant): Promise<void> {
    if (!validRefreshGrant(session)) throw new Error("Nexus refresh grant is invalid")
    const directory = path.dirname(this.path)
    await fs.mkdir(directory, { mode: 0o700, recursive: true })
    await fs.chmod(directory, 0o700)
    const temporary = path.join(directory, `.nexus-service-${randomBytes(8).toString("hex")}.tmp`)
    try {
      await fs.writeFile(temporary, `${JSON.stringify(session)}\n`, {
        encoding: "utf8",
        flag: fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
        mode: 0o600,
      })
      await fs.rename(temporary, this.path)
      await fs.chmod(this.path, 0o600)
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined)
    }
  }

  async clear(): Promise<void> {
    await fs.rm(this.path, { force: true })
  }
}
*/

export {
  LocalDevelopmentCredentialStore,
  MemoryCredentialStore,
  UserDataCredentialStore as NexusSessionStore,
  createCredentialStore,
  createProductionCredentialStore,
} from "./credential-store.ts";
export type { NexusCredentialStore } from "./credential-store.ts";
