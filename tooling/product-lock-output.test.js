import { afterAll, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { verifyProductLockInput } from "./verify-product-lock-input.mjs"

const temporaryDirectories = []
const repository = "https://github.com/microvoid/convax-plugins/releases/download"

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

async function writeRelease(root, area, tag, name, bytes) {
  const relativePath = `${area}/releases/${tag}/${name}`
  await fs.mkdir(path.join(root, area, "releases", tag), { recursive: true })
  await fs.writeFile(path.join(root, relativePath), bytes)
  return {
    path: relativePath,
    url: `${repository}/${tag}/${name}`,
    size: bytes.length,
    sha256: sha256(bytes),
  }
}

async function writeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "convax-product-lock-output-"))
  temporaryDirectories.push(root)
  const revision = "a".repeat(64)
  const metadataTag = `registry-v2-${revision}`
  const pluginTag = "plugin-ffmpeg-tools-v0.3.1"
  const skillTag = "skill-ffmpeg-canvas-v0.3.1"
  const builtinTag = `builtin-${"b".repeat(64)}`
  const plugin = await writeRelease(root, "catalog", pluginTag, "convax-plugin-ffmpeg-tools-0.3.1.zip", Buffer.from("plugin"))
  const skill = await writeRelease(root, "catalog", skillTag, "convax-skill-ffmpeg-canvas-0.3.1.zip", Buffer.from("skill"))
  const companion = await writeRelease(root, "catalog", pluginTag, "convax-companion-convax-ffmpeg-mcp-0.2.0-darwin-arm64", Buffer.from("companion"))
  const descriptorValue = {
    schema: "convax.marketplace/1",
    id: "convax-official",
    registry: {
      v2: { url: "https://microvoid.github.io/convax-plugins/registry/v2/index.json" },
      v1: { url: "https://microvoid.github.io/convax-plugins/registry/v1/index.json" },
    },
    showcase: {
      v2: { url: "https://microvoid.github.io/convax-plugins/showcase/v2/index.json" },
    },
  }
  const registryValue = {
    schema: "convax.registry/2",
    marketplaceId: "convax-official",
    sequence: 45,
    revision,
    packages: [
      {
        kind: "plugin",
        id: "ffmpeg-tools",
        version: "0.3.1",
        delivery: { kind: "artifact", url: plugin.url, size: plugin.size, sha256: plugin.sha256 },
        companions: [{
          command: "convax-ffmpeg-mcp",
          version: "0.2.0",
          targets: [{
            platform: "darwin",
            arch: "arm64",
            artifact: { url: companion.url, size: companion.size, sha256: companion.sha256 },
          }],
        }],
        manifest: { contributes: { skills: [{ name: "ffmpeg-canvas", path: "skills/ffmpeg-canvas" }] } },
      },
      {
        kind: "skill",
        id: "ffmpeg-canvas",
        version: "0.3.1",
        delivery: { kind: "artifact", url: skill.url, size: skill.size, sha256: skill.sha256 },
      },
    ],
  }
  const showcaseValue = { schema: "convax.showcase/2", revision, packages: [] }
  const metadata = {}
  for (const [name, value] of [
    ["marketplace.json", descriptorValue],
    ["registry-v2.json", registryValue],
    ["showcase-v2.json", showcaseValue],
  ]) {
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`)
    await fs.mkdir(path.join(root, "catalog"), { recursive: true })
    await fs.writeFile(path.join(root, "catalog", name), bytes)
    metadata[name] = await writeRelease(root, "catalog", metadataTag, name, bytes)
  }
  const builtin = await writeRelease(
    root,
    "builtin",
    builtinTag,
    "convax-builtin-bundle.zip",
    Buffer.from("builtin"),
  )
  await fs.writeFile(
    path.join(root, "builtin", "bundle.json"),
    `${JSON.stringify({
      schema: "convax.builtin-bundle/1",
      release: { id: "b".repeat(64) },
      members: [{ kind: "skill", id: "canvas-storyboard", version: "0.1.0" }],
    })}\n`,
  )
  const writePlan = async (area, artifacts) => {
    const releases = new Map()
    for (const artifact of artifacts) {
      const { tag, name } = (() => {
        const suffix = artifact.url.slice(`${repository}/`.length)
        const separator = suffix.indexOf("/")
        return {
          tag: suffix.slice(0, separator),
          name: suffix.slice(separator + 1),
        }
      })()
      const release = releases.get(tag) ?? { tag, assets: [] }
      release.assets.push({
        path: artifact.path.slice(`${area}/`.length),
        name,
        size: artifact.size,
        sha256: artifact.sha256,
        url: artifact.url,
      })
      releases.set(tag, release)
    }
    await fs.writeFile(
      path.join(root, area, "release-plan.json"),
      `${JSON.stringify({
        schema: "convax.release-plan/1",
        releases: [...releases.values()],
      })}\n`,
    )
  }
  await writePlan("catalog", [
    plugin,
    skill,
    companion,
    metadata["marketplace.json"],
    metadata["registry-v2.json"],
    metadata["showcase-v2.json"],
  ])
  await writePlan("builtin", [builtin])
  await fs.writeFile(
    path.join(root, "product-lock-input.json"),
    `${JSON.stringify({
      schema: "convax.product-lock-input/1",
      builtinBundle: { path: builtin.path, url: builtin.url },
      builtinManifestPath: "builtin/bundle.json",
      builtinReservations: [{ kind: "skill", id: "canvas-storyboard" }],
      official: {
        descriptor: { path: metadata["marketplace.json"].path, url: metadata["marketplace.json"].url },
        registry: { path: metadata["registry-v2.json"].path, url: metadata["registry-v2.json"].url },
        revision,
        showcase: { path: metadata["showcase-v2.json"].path, url: metadata["showcase-v2.json"].url },
      },
      packages: [{
        marketplaceId: "convax-official",
        kind: "plugin",
        id: "ffmpeg-tools",
        version: "0.3.1",
        setup: "explicit",
        artifact: { path: plugin.path, url: plugin.url },
        ownedSkills: [{ path: skill.path, url: skill.url }],
        companions: [{
          path: companion.path,
          url: companion.url,
          platform: "darwin",
          arch: "arm64",
        }],
      }],
    })}\n`,
  )
  return { root }
}

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) =>
    fs.rm(directory, { recursive: true, force: true })))
})

describe("Convax product lock input closure", () => {
  test("closes the Builtin reservation, Official metadata, and only approved preinstall", async () => {
    const fixture = await writeFixture()
    await expect(verifyProductLockInput(path.join(fixture.root, "product-lock-input.json")))
      .resolves.toEqual({
        builtinReservations: 1,
        preinstalledPackages: 1,
        verifiedArtifacts: 7,
      })
  })

  test("verifies an existing preinstall outside a selected package release-plan", async () => {
    const fixture = await writeFixture()
    const planPath = path.join(fixture.root, "catalog", "release-plan.json")
    const plan = JSON.parse(await fs.readFile(planPath, "utf8"))
    plan.releases = plan.releases.filter((release) =>
      release.tag.startsWith("registry-v2-"))
    await fs.writeFile(planPath, `${JSON.stringify(plan)}\n`)
    const lockPath = path.join(fixture.root, "product-lock-input.json")
    const lock = JSON.parse(await fs.readFile(lockPath, "utf8"))
    const originalPluginPath = lock.packages[0].artifact.path
    const pluginBytes = await fs.readFile(path.join(fixture.root, originalPluginPath))
    const inheritedPluginPath = `catalog/inherited/${sha256(pluginBytes)}/${path.basename(originalPluginPath)}`
    await fs.mkdir(path.dirname(path.join(fixture.root, inheritedPluginPath)), { recursive: true })
    await fs.writeFile(path.join(fixture.root, inheritedPluginPath), pluginBytes)
    lock.packages[0].artifact.path = inheritedPluginPath
    await fs.writeFile(lockPath, `${JSON.stringify(lock)}\n`)

    await expect(verifyProductLockInput(lockPath)).resolves.toEqual({
      builtinReservations: 1,
      preinstalledPackages: 1,
      verifiedArtifacts: 7,
    })

    const pluginPath = path.join(fixture.root, inheritedPluginPath)
    await fs.writeFile(pluginPath, "PLUGIN")
    await expect(verifyProductLockInput(lockPath))
      .rejects.toThrow("preinstalled Plugin artifact bytes differ from Registry v2")
  })

  test("rejects a source swap or widened preinstall policy", async () => {
    const fixture = await writeFixture()
    const lockPath = path.join(fixture.root, "product-lock-input.json")
    const lock = JSON.parse(await fs.readFile(lockPath, "utf8"))
    lock.packages[0].artifact.url = lock.packages[0].artifact.url.replace(
      "plugin-ffmpeg-tools-v0.3.1",
      "plugin-other-v0.3.1",
    )
    await fs.writeFile(lockPath, `${JSON.stringify(lock)}\n`)
    await expect(verifyProductLockInput(lockPath))
      .rejects.toThrow("preinstalled Plugin artifact differs from Registry v2")

    const clean = await writeFixture()
    const cleanPath = path.join(clean.root, "product-lock-input.json")
    const widened = JSON.parse(await fs.readFile(cleanPath, "utf8"))
    widened.packages.push(widened.packages[0])
    await fs.writeFile(cleanPath, `${JSON.stringify(widened)}\n`)
    await expect(verifyProductLockInput(cleanPath))
      .rejects.toThrow("exactly one ffmpeg-tools preinstall")
  })

  test("rejects metadata or Builtin paths that escape the composed output", async () => {
    const fixture = await writeFixture()
    const lockPath = path.join(fixture.root, "product-lock-input.json")
    const lock = JSON.parse(await fs.readFile(lockPath, "utf8"))
    lock.official.registry.path = "../registry-v2.json"
    await fs.writeFile(lockPath, `${JSON.stringify(lock)}\n`)
    await expect(verifyProductLockInput(lockPath))
      .rejects.toThrow("must stay below the product lock output")
  })

  test("rejects filesystem aliases and oversized immutable inputs before hashing", async () => {
    const hardlinked = await writeFixture()
    const descriptor = path.join(
      hardlinked.root,
      "catalog",
      "releases",
      `registry-v2-${"a".repeat(64)}`,
      "marketplace.json",
    )
    await fs.link(descriptor, path.join(hardlinked.root, "descriptor-hardlink.json"))
    await expect(verifyProductLockInput(path.join(hardlinked.root, "product-lock-input.json")))
      .rejects.toThrow("single-link regular no-follow file")

    const symlinked = await writeFixture()
    const pluginPath = path.join(
      symlinked.root,
      "catalog",
      "releases",
      "plugin-ffmpeg-tools-v0.3.1",
      "convax-plugin-ffmpeg-tools-0.3.1.zip",
    )
    const replacement = path.join(symlinked.root, "same-plugin-bytes.zip")
    await fs.writeFile(replacement, "plugin")
    await fs.unlink(pluginPath)
    await fs.symlink(replacement, pluginPath)
    await expect(verifyProductLockInput(path.join(symlinked.root, "product-lock-input.json")))
      .rejects.toThrow("single-link regular no-follow file")

    const oversized = await writeFixture()
    const builtinPath = path.join(
      oversized.root,
      "builtin",
      "releases",
      `builtin-${"b".repeat(64)}`,
      "convax-builtin-bundle.zip",
    )
    await fs.truncate(builtinPath, 256 * 1024 * 1024 + 1)
    await expect(verifyProductLockInput(path.join(oversized.root, "product-lock-input.json")))
      .rejects.toThrow("exceeds its maximum admitted size")
  })

  test("rejects a same-size in-place byte rewrite", async () => {
    const fixture = await writeFixture()
    const pluginPath = path.join(
      fixture.root,
      "catalog",
      "releases",
      "plugin-ffmpeg-tools-v0.3.1",
      "convax-plugin-ffmpeg-tools-0.3.1.zip",
    )
    await fs.writeFile(pluginPath, "PLUGIN")
    await expect(verifyProductLockInput(path.join(fixture.root, "product-lock-input.json")))
      .rejects.toThrow("bytes differ from the immutable release-plan")
  })
})
