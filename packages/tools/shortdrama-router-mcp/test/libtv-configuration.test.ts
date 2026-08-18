import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { FileLibTvConfigurationSource } from "../src/libtv-configuration.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true })),
  )
})

describe("LibTV configuration source", () => {
  test("persists one validated project in a private file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "libtv-config-"))
    temporaryDirectories.push(directory)
    const filePath = path.join(directory, "private", "configuration.json")
    const source = new FileLibTvConfigurationSource(filePath)
    expect(await source.read()).toEqual({})

    await source.write({
      project: { id: "project-1", name: "Film", type: "project" },
    })
    expect(await new FileLibTvConfigurationSource(filePath).read()).toEqual({
      project: { id: "project-1", name: "Film", type: "project" },
    })
    expect((await stat(filePath)).mode & 0o077).toBe(0)

    await source.clear()
    expect(await source.read()).toEqual({})
  })
})
