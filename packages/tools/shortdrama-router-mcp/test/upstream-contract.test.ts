import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  createShortDramaRouter,
  MemoryLibTvConfiguration,
  MemoryXiaoYunqueCredentials,
} from "shortdrama-router"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true })),
  )
})

describe("shortdrama-router 0.3 public contract", () => {
  test("describes provider auth, configuration, dependencies, and model readiness", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "shortdrama-0.3-"))
    temporaryDirectories.push(directory)
    const router = createShortDramaRouter({
      jimeng: { configDir: path.join(directory, "jimeng") },
      libtv: {
        configDir: path.join(directory, "libtv"),
        configuration: new MemoryLibTvConfiguration(),
      },
      xiaoyunque: { credentials: new MemoryXiaoYunqueCredentials() },
    })

    const descriptors = await router.listProviders()
    const byId = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]))
    expect([...byId.keys()].sort()).toEqual(["jimeng", "libtv", "xiaoyunque"])
    expect(byId.get("libtv")?.capabilities.authorization_methods).toEqual([
      {
        actions: ["status", "clear"],
        management: "external",
        method: "oauth",
      },
    ])
    expect(byId.get("libtv")?.capabilities.configuration).toBe(true)
    expect(byId.get("libtv")?.dependencies?.[0]).toMatchObject({
      id: "libtv-cli",
      source_url: "https://github.com/libtv-labs/libtv-skills",
      version_command: ["--version"],
    })

    const models = await router.listProviderModels("xiaoyunque")
    expect(models).toHaveLength(13)
    expect(models.every(({ availability }) =>
      availability?.state === "unavailable")).toBe(true)
    const video = models.find(({ id }) => id === "xiaoyunque/seedance-2.5")
    expect(video?.capabilities.constraints?.duration).toEqual({
      kind: "range",
      max: 60,
      min: 1,
      step: 1,
    })
    expect(video?.capabilities.output_media_types).toContain("video/mp4")
  })
})
