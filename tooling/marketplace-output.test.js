import { afterAll, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { verifyMarketplaceOutput } from "./verify-marketplace-output.mjs"

const temporaryDirectories = []

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "convax-marketplace-output-"))
  temporaryDirectories.push(directory)
  return directory
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

function mcpTag(id, version) {
  const key = sha256(Buffer.from(`mcp-server\0${id}`, "utf8"))
  return `mcp-server-${key.slice(0, 16)}-v${version}`
}

async function writeFixture() {
  const catalogDirectory = await temporaryDirectory()
  const repository = "https://github.com/microvoid/convax-plugins/releases/download"
  const definitions = [
    { kind: "plugin", id: "fixture-plugin", version: "1.0.0" },
    { kind: "skill", id: "fixture-skill", version: "2.0.0" },
    { kind: "mcp-server", id: "io.example/fixture", version: "2026.07" },
  ]
  const releasePlan = []
  const packages = []
  for (const definition of definitions) {
    const tag = definition.kind === "mcp-server"
      ? mcpTag(definition.id, definition.version)
      : `${definition.kind}-${definition.id}-v${definition.version}`
    const name = `${definition.kind}-${definition.version}.bin`
    const bytes = Buffer.from(`${definition.kind}/${definition.id}@${definition.version}`)
    const relativePath = `releases/${tag}/${name}`
    const url = `${repository}/${tag}/${name}`
    await fs.mkdir(path.join(catalogDirectory, "releases", tag), { recursive: true })
    await fs.writeFile(path.join(catalogDirectory, relativePath), bytes)
    const artifact = {
      path: relativePath,
      name,
      size: bytes.length,
      sha256: sha256(bytes),
      url,
    }
    releasePlan.push({ tag, assets: [artifact] })
    packages.push({
      ...definition,
      compatibility: { convax: ">=0.1.0" },
      presentation: { name: definition.id },
      yanked: false,
      delivery: definition.kind === "mcp-server"
        ? {
            kind: "mcp-managed-stdio",
            serverJson: {},
            serverJsonSha256: "0".repeat(64),
            extension: {},
            extensionSha256: "1".repeat(64),
            companions: [{
              target: "darwin-arm64",
              command: name,
              url,
              size: bytes.length,
              sha256: sha256(bytes),
            }],
          }
        : {
            kind: "artifact",
            url,
            size: bytes.length,
            sha256: sha256(bytes),
          },
    })
  }
  const registryV2Bytes = Buffer.from(
    `${JSON.stringify({
      schema: "convax.registry/2",
      marketplaceId: "convax-official",
      sequence: 1,
      revision: "a".repeat(64),
      packages,
    })}\n`,
  )
  const registryV1Bytes = Buffer.from(
    `${JSON.stringify({
      schema: "convax.registry/1",
      sequence: 1,
      revision: "a".repeat(40),
      packages: packages
        .filter((entry) => entry.kind !== "mcp-server")
        .map(({ kind, id, version }) => ({ kind, id, version })),
    })}\n`,
  )
  const marketplaceBytes = Buffer.from(`${JSON.stringify({
    schema: "convax.marketplace/1",
    id: "convax-official",
    name: "Convax Official",
    publisher: { name: "Microvoid" },
    repository: { owner: "microvoid", name: "convax-plugins" },
    registry: {
      v1: { url: "https://microvoid.github.io/convax-plugins/registry/v1/index.json" },
      v2: { url: "https://microvoid.github.io/convax-plugins/registry/v2/index.json" },
    },
    showcase: {
      v2: { url: "https://microvoid.github.io/convax-plugins/showcase/v2/index.json" },
    },
    compatibility: { convax: ">=0.1.0" },
    delivery: { kind: "github-pages-releases" },
  })}\n`)
  const showcaseBytes = Buffer.from(`${JSON.stringify({
    schema: "convax.showcase/2",
    marketplaceId: "convax-official",
    revision: "a".repeat(64),
    packages: [],
  })}\n`)
  await fs.writeFile(path.join(catalogDirectory, "marketplace.json"), marketplaceBytes)
  await fs.writeFile(path.join(catalogDirectory, "registry-v2.json"), registryV2Bytes)
  await fs.writeFile(path.join(catalogDirectory, "registry-v1.json"), registryV1Bytes)
  await fs.writeFile(path.join(catalogDirectory, "showcase-v2.json"), showcaseBytes)
  const metadataTag = `registry-v2-${"a".repeat(64)}`
  const metadataAssets = []
  for (const [name, bytes] of [
    ["marketplace.json", marketplaceBytes],
    ["registry-v2.json", registryV2Bytes],
    ["showcase-v2.json", showcaseBytes],
  ]) {
    const relativePath = `releases/${metadataTag}/${name}`
    const url = `${repository}/${metadataTag}/${name}`
    await fs.mkdir(path.join(catalogDirectory, "releases", metadataTag), { recursive: true })
    await fs.writeFile(path.join(catalogDirectory, relativePath), bytes)
    metadataAssets.push({
      path: relativePath,
      name,
      size: bytes.length,
      sha256: sha256(bytes),
      url,
    })
  }
  releasePlan.push({ tag: metadataTag, assets: metadataAssets })
  await fs.writeFile(
    path.join(catalogDirectory, "release-plan.json"),
    `${JSON.stringify({
      schema: "convax.release-plan/1",
      releases: releasePlan,
    })}\n`,
  )
  for (const [relativePath, bytes] of [
    ["marketplace.json", marketplaceBytes],
    ["registry/v1/index.json", registryV1Bytes],
    ["registry/v2/index.json", registryV2Bytes],
    ["showcase/v2/index.json", showcaseBytes],
  ]) {
    const output = path.join(catalogDirectory, "site", ...relativePath.split("/"))
    await fs.mkdir(path.dirname(output), { recursive: true })
    await fs.writeFile(output, bytes)
  }
  return { catalogDirectory, releasePlan }
}

async function rewriteMetadataFixture(catalogDirectory, name, value, sitePath) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`)
  const registry = JSON.parse(await fs.readFile(
    path.join(catalogDirectory, "registry-v2.json"),
    "utf8",
  ))
  const tag = `registry-v2-${registry.revision}`
  await fs.writeFile(path.join(catalogDirectory, name), bytes)
  await fs.writeFile(path.join(catalogDirectory, sitePath), bytes)
  await fs.writeFile(path.join(catalogDirectory, "releases", tag, name), bytes)
  const planPath = path.join(catalogDirectory, "release-plan.json")
  const plan = JSON.parse(await fs.readFile(planPath, "utf8"))
  const asset = plan.releases
    .find((release) => release.tag === tag)
    .assets.find((candidate) => candidate.name === name)
  asset.size = bytes.length
  asset.sha256 = sha256(bytes)
  await fs.writeFile(planPath, `${JSON.stringify(plan)}\n`)
}

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) =>
    fs.rm(directory, { recursive: true, force: true })))
})

describe("published Marketplace output closure", () => {
  test("binds v1 identities and every Registry Release URL to exact local bytes", async () => {
    const fixture = await writeFixture()
    await expect(verifyMarketplaceOutput(fixture.catalogDirectory)).resolves.toEqual({
      packages: 3,
      releaseAssets: 6,
      releaseTags: 4,
      v1Packages: 2,
    })
  })

  test("rejects silent v1 projection loss", async () => {
    const fixture = await writeFixture()
    const registryPath = path.join(fixture.catalogDirectory, "registry-v1.json")
    const registry = JSON.parse(await fs.readFile(registryPath, "utf8"))
    registry.packages.pop()
    const bytes = `${JSON.stringify(registry)}\n`
    await fs.writeFile(registryPath, bytes)
    await fs.writeFile(
      path.join(fixture.catalogDirectory, "site/registry/v1/index.json"),
      bytes,
    )
    await expect(verifyMarketplaceOutput(fixture.catalogDirectory))
      .rejects.toThrow("v1 Plugin/Skill identity set differs from Registry v2")
  })

  test("rejects a non-strict or lossy v1 projection", async () => {
    const fixture = await writeFixture()
    const registryPath = path.join(fixture.catalogDirectory, "registry-v1.json")
    const sitePath = path.join(fixture.catalogDirectory, "site/registry/v1/index.json")
    const registry = JSON.parse(await fs.readFile(registryPath, "utf8"))

    registry.schema = "convax.registry/2"
    let bytes = `${JSON.stringify(registry)}\n`
    await fs.writeFile(registryPath, bytes)
    await fs.writeFile(sitePath, bytes)
    await expect(verifyMarketplaceOutput(fixture.catalogDirectory))
      .rejects.toThrow("Registry v1 is not a strict Official projection")

    registry.schema = "convax.registry/1"
    registry.packages[0].version = "9.9.9"
    bytes = `${JSON.stringify(registry)}\n`
    await fs.writeFile(registryPath, bytes)
    await fs.writeFile(sitePath, bytes)
    await expect(verifyMarketplaceOutput(fixture.catalogDirectory))
      .rejects.toThrow("v1 Plugin/Skill versions differ from Registry v2")

    registry.packages[0].version = "1.0.0"
    registry.packages.push({
      kind: "mcp-server",
      id: "io.example/fixture",
      version: "2026.07",
    })
    bytes = `${JSON.stringify(registry)}\n`
    await fs.writeFile(registryPath, bytes)
    await fs.writeFile(sitePath, bytes)
    await expect(verifyMarketplaceOutput(fixture.catalogDirectory))
      .rejects.toThrow("Registry v1 contains unsupported kind mcp-server")
  })

  test("requires every current Registry package Release and referenced asset in the plan", async () => {
    const fixture = await writeFixture()
    const planPath = path.join(fixture.catalogDirectory, "release-plan.json")
    const plan = JSON.parse(await fs.readFile(planPath, "utf8"))
    plan.releases.shift()
    await fs.writeFile(planPath, `${JSON.stringify(plan)}\n`)

    await expect(verifyMarketplaceOutput(fixture.catalogDirectory))
      .rejects.toThrow("release-plan tags differ from Registry v2")
  })

  test("rejects a descriptor or Showcase that changes the Official publication identity", async () => {
    const descriptorFixture = await writeFixture()
    const descriptor = JSON.parse(await fs.readFile(
      path.join(descriptorFixture.catalogDirectory, "marketplace.json"),
      "utf8",
    ))
    descriptor.repository = { owner: "attacker", name: "mirror" }
    await rewriteMetadataFixture(
      descriptorFixture.catalogDirectory,
      "marketplace.json",
      descriptor,
      "site/marketplace.json",
    )
    await expect(verifyMarketplaceOutput(descriptorFixture.catalogDirectory))
      .rejects.toThrow("Official descriptor, Registry, Showcase, and release-plan are inconsistent")

    const showcaseFixture = await writeFixture()
    const showcase = JSON.parse(await fs.readFile(
      path.join(showcaseFixture.catalogDirectory, "showcase-v2.json"),
      "utf8",
    ))
    showcase.schema = "convax.showcase/999"
    await rewriteMetadataFixture(
      showcaseFixture.catalogDirectory,
      "showcase-v2.json",
      showcase,
      "site/showcase/v2/index.json",
    )
    await expect(verifyMarketplaceOutput(showcaseFixture.catalogDirectory))
      .rejects.toThrow("Official descriptor, Registry, Showcase, and release-plan are inconsistent")
  })

  test("rejects missing, misplaced, or changed Release bytes", async () => {
    const fixture = await writeFixture()
    const asset = fixture.releasePlan[0].assets[0]
    await fs.writeFile(path.join(fixture.catalogDirectory, asset.path), "changed")
    await expect(verifyMarketplaceOutput(fixture.catalogDirectory))
      .rejects.toThrow("size does not match")

    await fs.writeFile(
      path.join(fixture.catalogDirectory, asset.path),
      Buffer.from("plugin/fixture-plugin@1.0.0"),
    )
    const registryPath = path.join(fixture.catalogDirectory, "registry-v2.json")
    const registry = JSON.parse(await fs.readFile(registryPath, "utf8"))
    registry.packages[0].delivery.url = registry.packages[0].delivery.url.replace(
      "plugin-fixture-plugin-v1.0.0",
      "plugin-wrong-v1.0.0",
    )
    const changedRegistry = `${JSON.stringify(registry)}\n`
    await fs.writeFile(registryPath, changedRegistry)
    await fs.writeFile(
      path.join(fixture.catalogDirectory, "site/registry/v2/index.json"),
      changedRegistry,
    )
    await fs.writeFile(
      path.join(
        fixture.catalogDirectory,
        "releases",
        `registry-v2-${"a".repeat(64)}`,
        "registry-v2.json",
      ),
      changedRegistry,
    )
    const planPath = path.join(fixture.catalogDirectory, "release-plan.json")
    const plan = JSON.parse(await fs.readFile(planPath, "utf8"))
    const registryAsset = plan.releases
      .find((entry) => entry.tag === `registry-v2-${"a".repeat(64)}`)
      .assets.find((entry) => entry.name === "registry-v2.json")
    registryAsset.size = Buffer.byteLength(changedRegistry)
    registryAsset.sha256 = sha256(Buffer.from(changedRegistry))
    await fs.writeFile(planPath, `${JSON.stringify(plan)}\n`)
    await expect(verifyMarketplaceOutput(fixture.catalogDirectory))
      .rejects.toThrow("has no exact local Release asset")
  })

  test("rejects a Pages tree that differs from the descriptor-addressed flat catalogs", async () => {
    const fixture = await writeFixture()
    await fs.writeFile(
      path.join(fixture.catalogDirectory, "site/registry/v2/index.json"),
      "changed",
    )
    await expect(verifyMarketplaceOutput(fixture.catalogDirectory))
      .rejects.toThrow("Pages registry v2 differs from its verified flat catalog")
  })
})
