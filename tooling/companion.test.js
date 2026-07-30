import { afterAll, describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import path from "node:path"

import {
  loadCompanionArtifacts,
  root,
  sha256,
} from "./lib.mjs"

const cleanup = []

afterAll(async () => {
  await Promise.all(cleanup.map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

function sourceMetadata(companions) {
  return {
    schema: "convax.package/2",
    kind: "plugin",
    id: "example-generation",
    name: "Example Generation",
    description: "Generates media through a separately published executable.",
    version: "1.0.0",
    companions,
    yanked: false,
  }
}

function sourceCompanion(overrides = {}) {
  return {
    command: "example-generation-mcp",
    version: "2.3.4",
    source: "packages/tools/ffmpeg-mcp",
    targets: [{ platform: "darwin", arch: "arm64", path: "dist/darwin-arm64/convax-ffmpeg-mcp" }],
    ...overrides,
  }
}

describe("companion executable publishing", () => {
  test("normalizes reviewed companion source metadata", () => {
    const source = sourceMetadata([sourceCompanion()])
    expect(source.companions).toEqual([sourceCompanion()])
  })

  test("reads the declared target as bytes and rejects a symlinked artifact", async () => {
    const sourceRoot = path.join(root, "packages/tools/ffmpeg-mcp")
    await fs.mkdir(path.join(sourceRoot, "dist"), { recursive: true })
    const fixtureDirectory = await fs.mkdtemp(path.join(sourceRoot, "dist/companion-fixture-"))
    cleanup.push(fixtureDirectory)
    const fixtureArtifact = path.join(fixtureDirectory, "tool")
    await fs.writeFile(fixtureArtifact, Buffer.from("#!/bin/sh\nexit 0\n"))
    await fs.chmod(fixtureArtifact, 0o755)
    const fixtureRelativePath = path.relative(sourceRoot, fixtureArtifact).split(path.sep).join("/")
    const metadata = sourceMetadata([sourceCompanion({
      targets: [{ platform: "darwin", arch: "arm64", path: fixtureRelativePath }],
    })])
    const [built] = await loadCompanionArtifacts({ metadata })
    expect(built.targets[0].data.length).toBe(built.targets[0].artifact.size)
    expect(sha256(built.targets[0].data)).toBe(built.targets[0].artifact.sha256)

    const directory = await fs.mkdtemp(path.join(sourceRoot, "dist/companion-symlink-test-"))
    cleanup.push(directory)
    await fs.symlink(
      fixtureArtifact,
      path.join(directory, "tool"),
    )
    const relative = path.relative(sourceRoot, path.join(directory, "tool"))
      .split(path.sep).join("/")
    const symlinked = sourceMetadata([sourceCompanion({
      targets: [{ platform: "darwin", arch: "arm64", path: relative }],
    })])
    await expect(loadCompanionArtifacts({ metadata: symlinked })).rejects.toThrow("symlink is forbidden")
  })
})
