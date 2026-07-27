import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { NexusSessionStore } from "../src/session-store.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe("NexusSessionStore", () => {
  test("atomically persists the rotating grant in a private plugin-owned file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "convax-nexus-session-"))
    roots.push(root)
    const store = new NexusSessionStore({ XDG_CONFIG_HOME: root })
    const grant = {
      nexusOrigin: "http://localhost:3000",
      refreshToken: "refresh-token-with-sufficient-length",
      schema: "convax.nexus-refresh-grant/1" as const,
      workspaceSlug: "convax" as const,
    }
    await store.write(grant)
    expect(await store.read()).toEqual(grant)
    expect(await fs.readFile(store.path, "utf8")).not.toContain("accessToken")
    expect(await fs.readFile(store.path, "utf8")).not.toContain("dataToken")
    expect((await fs.stat(store.path)).mode & 0o777).toBe(0o600)
    expect((await fs.stat(path.dirname(store.path))).mode & 0o777).toBe(0o700)
    expect((await fs.readdir(path.dirname(store.path))).filter((name) => name.endsWith(".tmp"))).toEqual([])

    await store.clear()
    expect(await store.read()).toBeNull()
  })

  test("removes ephemeral tokens while migrating a private legacy session", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "convax-nexus-session-"))
    roots.push(root)
    const store = new NexusSessionStore({ XDG_CONFIG_HOME: root })
    await fs.mkdir(path.dirname(store.path), { mode: 0o700, recursive: true })
    await fs.writeFile(
      store.path,
      JSON.stringify({
        accessToken: "legacy-access-token-with-sufficient-length",
        accessTokenExpiresAt: "2026-07-26T08:15:00.000Z",
        dataToken: "legacy-data-token-with-sufficient-length",
        dataTokenExpiresAt: "2026-07-26T08:10:00.000Z",
        nexusOrigin: "http://localhost:3000",
        refreshToken: "legacy-refresh-token-with-sufficient-length",
        schema: "convax.nexus-session/1",
        workspaceSlug: "convax",
      }),
      { mode: 0o600 },
    )

    expect(await store.read()).toEqual({
      nexusOrigin: "http://localhost:3000",
      refreshToken: "legacy-refresh-token-with-sufficient-length",
      schema: "convax.nexus-refresh-grant/1",
      workspaceSlug: "convax",
    })
    const migrated = JSON.parse(await fs.readFile(store.path, "utf8")) as Record<string, unknown>
    expect(migrated).not.toHaveProperty("accessToken")
    expect(migrated).not.toHaveProperty("dataToken")
  })
})
