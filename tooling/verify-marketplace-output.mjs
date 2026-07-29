import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const releaseBase = "https://github.com/microvoid/convax-plugins/releases/download/"
const digestPattern = /^[a-f0-9]{64}$/

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

async function readJson(file, label) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"))
  } catch (cause) {
    throw new Error(`${label} is not valid JSON`, { cause })
  }
}

function projectedPackages(registry, version) {
  const label = `Registry v${version}`
  const topLevelKeys = version === 1
    ? ["packages", "revision", "schema", "sequence"]
    : ["marketplaceId", "packages", "revision", "schema", "sequence"]
  const actualKeys = Object.keys(registry ?? {}).sort()
  if (
    actualKeys.length !== topLevelKeys.length ||
    actualKeys.some((key, index) => key !== topLevelKeys[index]) ||
    registry.schema !== `convax.registry/${version}` ||
    !Number.isSafeInteger(registry.sequence) ||
    registry.sequence <= 0 ||
    typeof registry.revision !== "string" ||
    !(version === 1 ? /^[a-f0-9]{40}$/ : digestPattern).test(registry.revision) ||
    (version === 2 && registry.marketplaceId !== "convax-official") ||
    !Array.isArray(registry.packages)
  ) {
    throw new Error(`${label} is not a strict Official projection`)
  }

  const packages = new Map()
  for (const entry of registry.packages) {
    const supportedKinds = version === 1
      ? ["plugin", "skill"]
      : ["mcp-server", "plugin", "skill"]
    if (!supportedKinds.includes(entry?.kind)) {
      throw new Error(`${label} contains unsupported kind ${String(entry?.kind)}`)
    }
    if (
      typeof entry.id !== "string" ||
      entry.id.length === 0 ||
      typeof entry.version !== "string" ||
      entry.version.length === 0
    ) {
      throw new Error(`${label} contains an incomplete package identity`)
    }
    const identity = `${entry.kind}/${entry.id}`
    if (packages.has(identity)) throw new Error(`${label} contains duplicate ${identity}`)
    packages.set(identity, entry.version)
  }
  return packages
}

function assertEqualMaps(left, right, identityMessage, versionMessage) {
  if (
    left.size !== right.size ||
    [...left].some(([identity]) => !right.has(identity))
  ) {
    throw new Error(identityMessage)
  }
  if ([...left].some(([identity, version]) => right.get(identity) !== version)) {
    throw new Error(versionMessage)
  }
}

function expectedReleaseTag(entry) {
  if (entry.kind === "mcp-server") {
    const key = sha256(Buffer.from(`mcp-server\0${entry.id}`, "utf8"))
    return `mcp-server-${key.slice(0, 16)}-v${entry.version}`
  }
  return `${entry.kind}-${entry.id}-v${entry.version}`
}

function selectedPackageTags(registryPackages, selectedVersions) {
  const packageTags = new Set(registryPackages.map(expectedReleaseTag))
  if (selectedVersions === undefined) return packageTags
  if (!Array.isArray(selectedVersions)) {
    throw new Error("selected version changes must be an array")
  }

  const registryByIdentity = new Map(
    registryPackages.map((entry) => [`${entry.kind}\0${entry.id}`, entry]),
  )
  const selectedIdentities = new Set()
  const selectedTags = new Set()
  for (const entry of selectedVersions) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      typeof entry.kind !== "string" ||
      typeof entry.id !== "string" ||
      typeof entry.version !== "string" ||
      typeof entry.itemKey !== "string" ||
      typeof entry.releaseTag !== "string" ||
      (entry.previousVersion !== undefined && typeof entry.previousVersion !== "string")
    ) {
      throw new Error("selected version change is incomplete")
    }
    const identity = `${entry.kind}\0${entry.id}`
    const registryEntry = registryByIdentity.get(identity)
    const expectedItemKey = sha256(Buffer.from(identity, "utf8"))
    if (
      !registryEntry ||
      registryEntry.version !== entry.version ||
      entry.itemKey !== expectedItemKey ||
      entry.releaseTag !== expectedReleaseTag(registryEntry)
    ) {
      throw new Error(`selected version change ${entry.kind}/${entry.id} differs from Registry v2`)
    }
    if (selectedIdentities.has(identity) || selectedTags.has(entry.releaseTag)) {
      throw new Error(`selected version change duplicates ${entry.kind}/${entry.id}`)
    }
    selectedIdentities.add(identity)
    selectedTags.add(entry.releaseTag)
  }
  return selectedTags
}

function releaseReference(value, label) {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.url !== "string" ||
    !value.url.startsWith(releaseBase)
  ) {
    return undefined
  }
  if (
    !Number.isSafeInteger(value.size) ||
    value.size <= 0 ||
    typeof value.sha256 !== "string" ||
    !digestPattern.test(value.sha256)
  ) {
    throw new Error(`${label} Release reference must bind positive size and SHA-256`)
  }
  return { url: value.url, size: value.size, sha256: value.sha256 }
}

function collectReleaseReferences(value, label = "Registry") {
  const references = []
  const visit = (candidate, currentLabel) => {
    if (!candidate || typeof candidate !== "object") return
    const reference = releaseReference(candidate, currentLabel)
    if (reference) references.push(reference)
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${currentLabel}[${index}]`))
      return
    }
    for (const [key, item] of Object.entries(candidate)) {
      visit(item, `${currentLabel}.${key}`)
    }
  }
  visit(value, label)
  return references
}

function parseReleaseUrl(url, label) {
  if (!url.startsWith(releaseBase)) throw new Error(`${label} URL is outside Official Releases`)
  const suffix = url.slice(releaseBase.length)
  const separator = suffix.indexOf("/")
  if (separator <= 0 || separator === suffix.length - 1) {
    throw new Error(`${label} URL must contain an exact release tag and asset basename`)
  }
  const tag = suffix.slice(0, separator)
  const name = suffix.slice(separator + 1)
  if (
    name.includes("/") ||
    name === "." ||
    name === ".." ||
    decodeURIComponent(name) !== name
  ) {
    throw new Error(`${label} URL asset must be one literal basename`)
  }
  return { tag, name }
}

async function verifyReleaseAsset(catalogDirectory, catalogRealPath, tag, asset) {
  if (
    !asset ||
    typeof asset !== "object" ||
    typeof asset.name !== "string" ||
    typeof asset.path !== "string" ||
    typeof asset.url !== "string" ||
    !Number.isSafeInteger(asset.size) ||
    asset.size <= 0 ||
    typeof asset.sha256 !== "string" ||
    !digestPattern.test(asset.sha256)
  ) {
    throw new Error(`release-plan ${tag} contains an invalid asset`)
  }
  const expectedPath = `releases/${tag}/${asset.name}`
  if (asset.path !== expectedPath) {
    throw new Error(`release-plan ${tag}/${asset.name} path must be ${expectedPath}`)
  }
  const parsed = parseReleaseUrl(asset.url, `release-plan ${tag}/${asset.name}`)
  if (parsed.tag !== tag || parsed.name !== asset.name) {
    throw new Error(`release-plan ${tag}/${asset.name} URL does not match its path`)
  }
  const absolute = path.join(catalogDirectory, ...asset.path.split("/"))
  const state = await fs.lstat(absolute)
  if (!state.isFile() || state.isSymbolicLink()) {
    throw new Error(`release-plan ${tag}/${asset.name} must be a regular no-follow file`)
  }
  const real = await fs.realpath(absolute)
  if (!real.startsWith(`${catalogRealPath}${path.sep}`)) {
    throw new Error(`release-plan ${tag}/${asset.name} escapes the catalog directory`)
  }
  const bytes = await fs.readFile(real)
  if (bytes.length !== asset.size) {
    throw new Error(`release-plan ${tag}/${asset.name} size does not match`)
  }
  if (sha256(bytes) !== asset.sha256) {
    throw new Error(`release-plan ${tag}/${asset.name} SHA-256 does not match`)
  }
}

async function readExactLocalRelease(catalogDirectory, catalogRealPath, url, expected) {
  const { tag, name } = parseReleaseUrl(url, "Registry")
  const relativePath = `releases/${tag}/${name}`
  const absolute = path.join(catalogDirectory, ...relativePath.split("/"))
  const state = await fs.lstat(absolute).catch((cause) => {
    if (cause?.code === "ENOENT") return undefined
    throw cause
  })
  if (!state?.isFile() || state.isSymbolicLink()) {
    throw new Error(`${url} has no exact local Release asset`)
  }
  const real = await fs.realpath(absolute)
  if (!real.startsWith(`${catalogRealPath}${path.sep}`)) {
    throw new Error(`${url} local Release asset escapes the catalog directory`)
  }
  const bytes = await fs.readFile(real)
  if (bytes.length !== expected.size) throw new Error(`${url} local size differs from Registry`)
  if (sha256(bytes) !== expected.sha256) throw new Error(`${url} local SHA-256 differs from Registry`)
}

async function readExactCatalogFile(
  catalogDirectory,
  catalogRealPath,
  relativePath,
  label,
) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.includes("\\") ||
    path.posix.isAbsolute(relativePath) ||
    relativePath.split("/").some((segment) =>
      segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} has an unsafe catalog path`)
  }
  const absolute = path.join(catalogDirectory, ...relativePath.split("/"))
  const state = await fs.lstat(absolute).catch((cause) => {
    if (cause?.code === "ENOENT") return undefined
    throw cause
  })
  if (!state?.isFile() || state.isSymbolicLink()) {
    throw new Error(`${label} must be an exact regular no-follow file`)
  }
  const real = await fs.realpath(absolute)
  if (!real.startsWith(`${catalogRealPath}${path.sep}`)) {
    throw new Error(`${label} escapes the catalog directory`)
  }
  return fs.readFile(real)
}

export async function verifyMarketplaceOutput(
  catalogDirectory,
  { selectedVersions } = {},
) {
  const [descriptor, registryV2, registryV1, showcaseV2, releasePlan] = await Promise.all([
    readJson(path.join(catalogDirectory, "marketplace.json"), "Marketplace descriptor"),
    readJson(path.join(catalogDirectory, "registry-v2.json"), "Registry v2"),
    readJson(path.join(catalogDirectory, "registry-v1.json"), "Registry v1"),
    readJson(path.join(catalogDirectory, "showcase-v2.json"), "Showcase v2"),
    readJson(path.join(catalogDirectory, "release-plan.json"), "release-plan"),
  ])
  if (
    !Array.isArray(registryV2.packages) ||
    descriptor?.schema !== "convax.marketplace/1" ||
    descriptor?.id !== "convax-official" ||
    descriptor.repository?.owner !== "microvoid" ||
    descriptor.repository?.name !== "convax-plugins" ||
    descriptor.registry?.v1?.url !== "https://microvoid.github.io/convax-plugins/registry/v1/index.json" ||
    descriptor.registry?.v2?.url !== "https://microvoid.github.io/convax-plugins/registry/v2/index.json" ||
    descriptor.showcase?.v2?.url !== "https://microvoid.github.io/convax-plugins/showcase/v2/index.json" ||
    descriptor.delivery?.kind !== "github-pages-releases" ||
    showcaseV2?.schema !== "convax.showcase/2" ||
    showcaseV2?.marketplaceId !== "convax-official" ||
    showcaseV2.revision !== registryV2.revision ||
    !Array.isArray(showcaseV2.packages) ||
    releasePlan?.schema !== "convax.release-plan/1" ||
    !Array.isArray(releasePlan.releases)
  ) {
    throw new Error("Official descriptor, Registry, Showcase, and release-plan are inconsistent")
  }
  const v2Packages = projectedPackages(registryV2, 2)
  const v1Packages = projectedPackages(registryV1, 1)
  const v2Projection = new Map(
    [...v2Packages].filter(([identity]) =>
      identity.startsWith("plugin/") || identity.startsWith("skill/")),
  )
  assertEqualMaps(
    v2Projection,
    v1Packages,
    "v1 Plugin/Skill identity set differs from Registry v2",
    "v1 Plugin/Skill versions differ from Registry v2",
  )

  const publishedPackageTags = selectedPackageTags(registryV2.packages, selectedVersions)
  const metadataTag = `registry-v2-${registryV2.revision}`
  const admittedPlanTags = new Set([...publishedPackageTags, metadataTag])
  const assetsByUrl = new Map()
  const actualTags = new Set()
  const catalogRealPath = await fs.realpath(catalogDirectory)
  let releaseAssets = 0
  for (const entry of releasePlan.releases) {
    if (
      !entry ||
      typeof entry.tag !== "string" ||
      !Array.isArray(entry.assets) ||
      entry.assets.length === 0
    ) {
      throw new Error("release-plan entries require one tag and at least one asset")
    }
    if (actualTags.has(entry.tag)) throw new Error(`release-plan contains duplicate tag ${entry.tag}`)
    actualTags.add(entry.tag)
    for (const asset of entry.assets) {
      await verifyReleaseAsset(catalogDirectory, catalogRealPath, entry.tag, asset)
      if (assetsByUrl.has(asset.url)) throw new Error(`release-plan contains duplicate URL ${asset.url}`)
      assetsByUrl.set(asset.url, asset)
      releaseAssets += 1
    }
  }
  if (
    actualTags.size !== admittedPlanTags.size ||
    [...actualTags].some((tag) => !admittedPlanTags.has(tag))
  ) {
    throw new Error("release-plan tags differ from Registry v2")
  }
  if (!actualTags.has(metadataTag)) {
    throw new Error("release-plan omits the immutable Registry metadata Release")
  }
  const metadataRelease = releasePlan.releases.find((entry) => entry.tag === metadataTag)
  const metadataByName = new Map(
    metadataRelease.assets.map((asset) => [asset.name, asset]),
  )
  for (const [name, label] of [
    ["marketplace.json", "Marketplace descriptor"],
    ["registry-v2.json", "Registry v2"],
    ["showcase-v2.json", "Showcase v2"],
  ]) {
    const releaseAsset = metadataByName.get(name)
    if (!releaseAsset) {
      throw new Error(`Registry metadata Release omits ${name}`)
    }
    const flatBytes = await readExactCatalogFile(
      catalogDirectory,
      catalogRealPath,
      name,
      `flat ${label}`,
    )
    const releaseBytes = await readExactCatalogFile(
      catalogDirectory,
      catalogRealPath,
      releaseAsset.path,
      `Release ${label}`,
    )
    if (!flatBytes.equals(releaseBytes)) {
      throw new Error(`Release ${label} differs from its verified flat catalog`)
    }
  }

  for (const [sitePath, flatPath, label] of [
    ["site/marketplace.json", "marketplace.json", "descriptor"],
    ["site/registry/v1/index.json", "registry-v1.json", "registry v1"],
    ["site/registry/v2/index.json", "registry-v2.json", "registry v2"],
    ["site/showcase/v2/index.json", "showcase-v2.json", "showcase v2"],
  ]) {
    const [siteBytes, flatBytes] = await Promise.all([
      readExactCatalogFile(
        catalogDirectory,
        catalogRealPath,
        sitePath,
        `Pages ${label}`,
      ),
      readExactCatalogFile(
        catalogDirectory,
        catalogRealPath,
        flatPath,
        `flat ${label}`,
      ),
    ])
    if (!siteBytes.equals(flatBytes)) {
      throw new Error(`Pages ${label} differs from its verified flat catalog`)
    }
  }

  for (const entry of registryV2.packages) {
    const expectedTag = expectedReleaseTag(entry)
    for (const reference of collectReleaseReferences(entry)) {
      const { tag } = parseReleaseUrl(reference.url, "Registry")
      if (tag !== expectedTag) {
        throw new Error(`${entry.kind}/${entry.id} does not use its immutable Release tag`)
      }
      if (!publishedPackageTags.has(tag)) continue
      await readExactLocalRelease(catalogDirectory, catalogRealPath, reference.url, reference)
      const asset = assetsByUrl.get(reference.url)
      if (!asset) {
        throw new Error(`${reference.url} is absent from the release-plan`)
      }
      if (asset.size !== reference.size || asset.sha256 !== reference.sha256) {
        throw new Error(`${reference.url} Registry metadata differs from release-plan bytes`)
      }
    }
  }
  for (const tag of publishedPackageTags) {
    const releaseDirectory = path.join(catalogDirectory, "releases", tag)
    const state = await fs.lstat(releaseDirectory).catch((cause) => {
      if (cause?.code === "ENOENT") return undefined
      throw cause
    })
    if (!state?.isDirectory() || state.isSymbolicLink()) {
      throw new Error(`Registry package has no exact local Release directory ${tag}`)
    }
  }

  return {
    packages: registryV2.packages.length,
    releaseAssets,
    releaseTags: actualTags.size,
    v1Packages: v1Packages.size,
  }
}

async function main(argv) {
  if (argv.length > 1) throw new Error("Usage: verify-marketplace-output [catalog-directory]")
  const directory = path.resolve(argv[0] ?? "dist/catalog")
  const selectedVersions = process.env.CONVAX_MARKETPLACE_CHANGED
    ? await readJson(
        path.resolve(process.env.CONVAX_MARKETPLACE_CHANGED),
        "selected version changes",
      )
    : undefined
  const result = await verifyMarketplaceOutput(directory, { selectedVersions })
  console.log(
    `Verified ${result.packages} packages, ${result.v1Packages} v1 identities, ` +
    `${result.releaseTags} immutable Releases, and ${result.releaseAssets} exact assets.`,
  )
}

if (import.meta.main) {
  await main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
