import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  createBuiltInRuntimeService,
  createShortDramaRouter,
  detectRuntimePlatform,
  getManagedRuntimeStatus,
  installManagedRuntime,
  jimengRuntimeDefinition,
  libtvRuntimeDefinition,
  MemoryLibTvConfiguration,
  MemoryXiaoYunqueCredentials,
  type ProviderRuntimeDefinition,
  verifyManagedRuntimeIntegrity,
} from "shortdrama-router"

const temporaryDirectories: string[] = []

function fetchResponse(body: BodyInit): typeof fetch {
  return (async () => new Response(body)) as unknown as typeof fetch
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true })),
  )
})

describe("shortdrama-router 0.6 public contract", () => {
  test("pins archive and executable SHA-256 for every supported provider platform", () => {
    for (const [definition, version] of [
      [jimengRuntimeDefinition, "1.4.17"],
      [libtvRuntimeDefinition, "1.0.2"],
    ] as const) {
      for (const platform of definition.platforms) {
        const release = definition.resolve_trusted_release({ platform, version })
        expect(release?.artifact.sha256).toMatch(/^[a-f0-9]{64}$/u)
        expect(release?.artifact.executable_sha256).toMatch(/^[a-f0-9]{64}$/u)
      }
    }
  })

  test("describes provider auth, configuration, dependencies, and model readiness", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "shortdrama-0.6-"))
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
        actions: ["status", "begin", "complete", "cancel", "clear"],
        management: "managed",
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

  test("rejects legacy and modified managed executables before launch", async () => {
    if (process.platform === "win32") return
    const directory = await mkdtemp(path.join(os.tmpdir(), "shortdrama-integrity-"))
    temporaryDirectories.push(directory)
    const platform = detectRuntimePlatform()
    expect(platform).toBeDefined()
    const executable = Buffer.from("#!/bin/sh\nprintf 'fake 1.0.0\\n'\n")
    const executableSha256 = createHash("sha256").update(executable).digest("hex")
    const release = {
      artifact: {
        archive: "binary" as const,
        executable_sha256: executableSha256,
        sha256: executableSha256,
        url: "https://runtime.example/fake-runtime",
      },
      version: "1.0.0",
    }
    const definition: ProviderRuntimeDefinition = {
      display_name: "Fake runtime",
      executable: "fake-runtime",
      id: "fake-provider",
      platforms: [platform!],
      probe(output) {
        return output.includes("fake 1.0.0")
          ? { compatible: true, version: "1.0.0" }
          : { compatible: false, reason_code: "runtime_version_unrecognized" }
      },
      async resolve_release() {
        return release
      },
      resolve_trusted_release({ version }) {
        return version === release.version ? release : undefined
      },
      version_command: ["--version"],
    }
    const providerDirectory = path.join(directory, definition.id)
    const executablePath = path.join(providerDirectory, definition.executable)
    await mkdir(providerDirectory)
    await writeFile(executablePath, executable, { mode: 0o755 })

    expect(await getManagedRuntimeStatus(definition, {
      platform: platform!,
      rootDir: directory,
    })).toMatchObject({
      compatible: false,
      integrity_verified: false,
      reason_code: "runtime_integrity_failed",
      state: "invalid",
    })

    await expect(installManagedRuntime(definition, {
      fetch: fetchResponse(
        Buffer.concat([executable, Buffer.from("tampered")]),
      ),
      platform: platform!,
      rootDir: directory,
    })).rejects.toMatchObject({ code: "runtime_integrity_failed" })

    const installed = await installManagedRuntime(definition, {
      fetch: fetchResponse(executable),
      platform: platform!,
      rootDir: directory,
    })
    expect(installed).toMatchObject({
      compatible: true,
      executable_sha256: executableSha256,
      integrity_verified: true,
      state: "installed",
    })

    await writeFile(executablePath, "#!/bin/sh\nprintf 'fake 1.0.0\\n'\n# modified\n", {
      mode: 0o755,
    })
    await expect(verifyManagedRuntimeIntegrity(definition, {
      platform: platform!,
      rootDir: directory,
    })).rejects.toMatchObject({ code: "runtime_integrity_failed" })
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
