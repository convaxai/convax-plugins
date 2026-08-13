import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

const repositoryRoot = path.resolve(import.meta.dirname, "..")
const catalogRoot = path.resolve(repositoryRoot, "dist/catalog")
const builtinRoot = path.resolve(repositoryRoot, "dist/builtin")
const outputRoot = path.resolve(
  repositoryRoot,
  process.env.CONVAX_LOCAL_PRODUCT_LOCK_ROOT ?? ".local/convax-nexus-product",
)
const selectedIds = (
  process.env.CONVAX_LOCAL_PRODUCT_LOCK_PLUGINS ?? "ffmpeg-tools,nexus-service"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)

if (selectedIds.length < 1 || new Set(selectedIds).size !== selectedIds.length) {
  throw new Error("Local product-lock Plugin selection must be unique and non-empty")
}

const [descriptor, registry, showcase, catalogPlan, builtinInput, builtinPlan] =
  await Promise.all([
    readJson(path.join(catalogRoot, "marketplace.json")),
    readJson(path.join(catalogRoot, "registry-v2.json")),
    readJson(path.join(catalogRoot, "showcase-v2.json")),
    readJson(path.join(catalogRoot, "release-plan.json")),
    readJson(path.join(builtinRoot, "builtin-lock-input.json")),
    readJson(path.join(builtinRoot, "release-plan.json")),
  ])

if (
  descriptor.schema !== "convax.marketplace/1" ||
  descriptor.id !== "convax-official" ||
  registry.schema !== "convax.registry/2" ||
  registry.marketplaceId !== descriptor.id ||
  showcase.schema !== "convax.showcase/2" ||
  showcase.revision !== registry.revision ||
  catalogPlan.schema !== "convax.release-plan/1" ||
  builtinInput.schema !== "convax.builtin-lock-input/1" ||
  builtinPlan.schema !== "convax.release-plan/1"
) {
  throw new Error("Built Marketplace output is not a compatible complete closure")
}

const catalogAssets = releaseAssets(catalogPlan)
const builtinAssets = releaseAssets(builtinPlan)
await fs.rm(outputRoot, { force: true, recursive: true })
await fs.mkdir(outputRoot, { mode: 0o700, recursive: true })
const selected = []
for (const id of selectedIds) {
  const entry = registry.packages.find(
    (candidate) => candidate.kind === "plugin" && candidate.id === id,
  )
  if (
    !entry ||
    entry.yanked === true ||
    entry.delivery?.kind !== "artifact"
  ) {
    throw new Error(`Selected local Plugin is unavailable: ${id}`)
  }
  const artifact = await copyArtifact(
    catalogRoot,
    catalogAssets,
    entry.delivery,
    `catalog/${releasePath(entry.delivery.url)}`,
  )
  const ownedNames = Array.isArray(entry.manifest?.contributes?.skills)
    ? entry.manifest.contributes.skills.map((skill) => skill.name)
    : []
  const ownedSkills = []
  for (const name of ownedNames) {
    const skill = registry.packages.find(
      (candidate) =>
        candidate.kind === "skill" &&
        candidate.id === name &&
        candidate.ownerPluginId === entry.id &&
        candidate.delivery?.kind === "artifact",
    )
    if (!skill) throw new Error(`Selected Plugin owned Skill is unavailable: ${name}`)
    ownedSkills.push(
      await copyArtifact(
        catalogRoot,
        catalogAssets,
        skill.delivery,
        `catalog/${releasePath(skill.delivery.url)}`,
      ),
    )
  }
  const companions = []
  for (const declaration of entry.companions ?? []) {
    for (const target of declaration.targets ?? []) {
      if (target.platform !== "darwin" || target.arch !== "arm64") continue
      companions.push({
        ...(await copyArtifact(
          catalogRoot,
          catalogAssets,
          target.artifact,
          `catalog/${releasePath(target.artifact.url)}`,
        )),
        arch: target.arch,
        platform: target.platform,
      })
    }
  }
  if ((entry.companions?.length ?? 0) > 0 && companions.length !== 1) {
    throw new Error(`Selected Plugin does not close darwin-arm64 companion: ${id}`)
  }
  selected.push({
    artifact,
    companions,
    id: entry.id,
    kind: "plugin",
    marketplaceId: registry.marketplaceId,
    ownedSkills,
    setup: "explicit",
    version: entry.version,
  })
}

const metadataTag = `registry-v2-${registry.revision}`
const official = {
  descriptor: await copyNamedArtifact(
    catalogRoot,
    catalogAssets,
    metadataTag,
    "marketplace.json",
    "catalog",
  ),
  registry: await copyNamedArtifact(
    catalogRoot,
    catalogAssets,
    metadataTag,
    "registry-v2.json",
    "catalog",
  ),
  revision: registry.revision,
  showcase: await copyNamedArtifact(
    catalogRoot,
    catalogAssets,
    metadataTag,
    "showcase-v2.json",
    "catalog",
  ),
}
const builtinBundle = await copyArtifact(
  builtinRoot,
  builtinAssets,
  assetForUrl(builtinAssets, builtinInput.builtinBundle.url),
  `builtin/${builtinInput.builtinBundle.path}`,
)
const builtinManifestPath = "builtin/bundle.json"
await copyRegularFile(
  path.join(builtinRoot, "bundle.json"),
  path.join(outputRoot, builtinManifestPath),
)

const input = {
  builtinBundle,
  builtinManifestPath,
  builtinReservations: builtinInput.builtinReservations,
  official,
  packages: selected,
  schema: "convax.product-lock-input/1",
}
const inputPath = path.join(outputRoot, "product-lock-input.json")
await writePrivateJson(inputPath, input)
await writePrivateJson(path.join(outputRoot, "catalog/release-plan.json"), {
  releases: catalogPlan.releases.filter((release) =>
    [
      metadataTag,
      ...selected.flatMap((entry) => [
        tagFromUrl(entry.artifact.url),
        ...entry.ownedSkills.map((artifact) => tagFromUrl(artifact.url)),
        ...entry.companions.map((artifact) => tagFromUrl(artifact.url)),
      ]),
    ].includes(release.tag),
  ),
  schema: "convax.release-plan/1",
})
await writePrivateJson(
  path.join(outputRoot, "builtin/release-plan.json"),
  builtinPlan,
)
await copyRegularFile(
  path.join(catalogRoot, "marketplace.json"),
  path.join(outputRoot, "catalog/marketplace.json"),
)
await copyRegularFile(
  path.join(catalogRoot, "registry-v2.json"),
  path.join(outputRoot, "catalog/registry-v2.json"),
)
await copyRegularFile(
  path.join(catalogRoot, "showcase-v2.json"),
  path.join(outputRoot, "catalog/showcase-v2.json"),
)

console.log(
  JSON.stringify(
    {
      packages: selected.map(({ id, version }) => ({ id, version })),
      productLockInputPath: inputPath,
      registryRevision: registry.revision,
      schema: input.schema,
    },
    null,
    2,
  ),
)

function releaseAssets(plan) {
  return new Map(
    plan.releases.flatMap((release) =>
      release.assets.map((asset) => [
        asset.url,
        { ...asset, releaseTag: release.tag },
      ]),
    ),
  )
}

function assetForUrl(assets, url) {
  const asset = assets.get(url)
  if (!asset) throw new Error(`Release plan is missing immutable asset: ${url}`)
  return asset
}

async function copyNamedArtifact(root, assets, tag, name, area) {
  const url =
    `https://github.com/convaxai/convax-plugins/releases/download/${tag}/${name}`
  return copyArtifact(root, assets, assetForUrl(assets, url), `${area}/releases/${tag}/${name}`)
}

async function copyArtifact(root, assets, expected, outputPath) {
  const artifact = assetForUrl(
    assets,
    typeof expected === "string" ? expected : expected.url,
  )
  if (
    typeof expected === "object" &&
    (expected.size !== artifact.size || expected.sha256 !== artifact.sha256)
  ) {
    throw new Error(`Registry artifact does not match its Release plan: ${artifact.url}`)
  }
  const source = path.join(root, artifact.path)
  const bytes = await readRegularFile(source)
  if (
    bytes.byteLength !== artifact.size ||
    sha256(bytes) !== artifact.sha256 ||
    outputPath !== `${root === catalogRoot ? "catalog" : "builtin"}/${releasePath(artifact.url)}`
  ) {
    throw new Error(`Immutable Release artifact does not match its plan: ${artifact.url}`)
  }
  await writePrivateBytes(path.join(outputRoot, outputPath), bytes)
  return { path: outputPath, url: artifact.url }
}

async function copyRegularFile(source, target) {
  await writePrivateBytes(target, await readRegularFile(source))
}

async function readRegularFile(file) {
  const metadata = await fs.lstat(file)
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    throw new Error(`Local product-lock source is not a single-link regular file: ${file}`)
  }
  return fs.readFile(file)
}

async function writePrivateBytes(file, bytes) {
  await fs.mkdir(path.dirname(file), { mode: 0o700, recursive: true })
  await fs.writeFile(file, bytes, { mode: 0o600 })
  await fs.chmod(file, 0o600)
}

function writePrivateJson(file, value) {
  return writePrivateBytes(file, Buffer.from(`${JSON.stringify(value)}\n`))
}

async function readJson(file) {
  return JSON.parse((await readRegularFile(file)).toString("utf8"))
}

function releasePath(url) {
  const parsed = new URL(url)
  const prefix = "/convaxai/convax-plugins/releases/download/"
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    !parsed.pathname.startsWith(prefix) ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Artifact URL is not an immutable Official Release URL")
  }
  return `releases/${parsed.pathname.slice(prefix.length)}`
}

function tagFromUrl(url) {
  return releasePath(url).split("/")[1]
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}
