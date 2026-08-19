import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  createBuiltInRuntimeService,
  createShortDramaRouter,
  detectRuntimePlatform,
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

describe("shortdrama-router 0.5 public contract", () => {
  test("describes provider auth, configuration, dependencies, and model readiness", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "shortdrama-0.5-"))
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
      managed_install: true,
      source_url: "https://liblibai-web-static.liblib.cloud/cli/",
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

  test("binds provider installation and execution through one runtime root", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "shortdrama-runtime-"))
    temporaryDirectories.push(directory)
    const platform = detectRuntimePlatform()
    expect(platform).toBeDefined()
    const runtimes = createBuiltInRuntimeService({
      platform: platform!,
      rootDir: directory,
    })

    expect(runtimes.supports("jimeng")).toBe(true)
    expect(runtimes.supports("libtv")).toBe(true)
    expect(await runtimes.getStatus("jimeng")).toMatchObject({
      compatible: false,
      id: "jimeng",
      managed: true,
      state: "not_installed",
    })
    expect(await runtimes.getStatus("libtv")).toMatchObject({
      compatible: false,
      id: "libtv",
      managed: true,
      state: "not_installed",
    })

    const router = createShortDramaRouter({
      jimeng: { configDir: path.join(directory, "jimeng-config") },
      libtv: false,
      runtimeRootDir: directory,
      xiaoyunque: false,
    })
    const descriptor = await router.getProvider("jimeng", {
      probeDependencies: true,
    })
    expect(descriptor.dependency_statuses?.[0]).toMatchObject({
      available: false,
      id: "dreamina-cli",
      managed_install: true,
      reason_code: "dependency_unavailable",
    })
  })
})
