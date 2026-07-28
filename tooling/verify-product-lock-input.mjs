import { createHash } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import { promises as fs } from "node:fs"
import path from "node:path"

const releaseBase = "https://github.com/microvoid/convax-plugins/releases/download/"
const digestPattern = /^[a-f0-9]{64}$/
const metadataLimit = 8 * 1024 * 1024
const manifestLimit = 1024 * 1024
const packageLimit = 512 * 1024 * 1024
const builtinLimit = 256 * 1024 * 1024

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"))
  } catch (cause) {
    throw new Error(`${label} is not valid JSON`, { cause })
  }
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} has unsupported or missing fields`)
  }
}

function parseReleaseUrl(url, label) {
  if (typeof url !== "string" || !url.startsWith(releaseBase)) {
    throw new Error(`${label} must use the Official immutable Release origin`)
  }
  const suffix = url.slice(releaseBase.length)
  const separator = suffix.indexOf("/")
  if (separator <= 0 || separator === suffix.length - 1) {
    throw new Error(`${label} must contain one exact Release tag and asset basename`)
  }
  const tag = suffix.slice(0, separator)
  const name = suffix.slice(separator + 1)
  if (
    name.includes("/") ||
    name === "." ||
    name === ".." ||
    decodeURIComponent(name) !== name
  ) {
    throw new Error(`${label} asset must be one literal basename`)
  }
  return { tag, name }
}

function validateRelativePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} must stay below the product lock output`)
  }
  return value
}

async function readBounded(handle, maximumSize, label) {
  const chunks = []
  let offset = 0
  while (true) {
    const capacity = Math.min(64 * 1024, maximumSize + 1 - offset)
    if (capacity <= 0) throw new Error(`${label} exceeds its maximum admitted size`)
    const chunk = Buffer.allocUnsafe(capacity)
    const { bytesRead } = await handle.read(chunk, 0, capacity, offset)
    if (bytesRead === 0) break
    chunks.push(chunk.subarray(0, bytesRead))
    offset += bytesRead
  }
  return Buffer.concat(chunks, offset)
}

function sameFileSnapshot(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  )
}

async function readStableFile(
  root,
  rootRealPath,
  relativePath,
  label,
  maximumSize = packageLimit,
) {
  validateRelativePath(relativePath, label)
  const absolute = path.join(root, ...relativePath.split("/"))
  const before = await fs.lstat(absolute).catch((cause) => {
    if (cause?.code === "ENOENT") return undefined
    throw cause
  })
  if (!before?.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    throw new Error(`${label} must be an existing single-link regular no-follow file`)
  }
  if (before.size > maximumSize) {
    throw new Error(`${label} exceeds its maximum admitted size`)
  }
  const real = await fs.realpath(absolute)
  if (!real.startsWith(`${rootRealPath}${path.sep}`)) {
    throw new Error(`${label} must stay below the product lock output`)
  }
  const handle = await fs.open(
    absolute,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
  ).catch((cause) => {
    throw new Error(`${label} changed before it could be opened safely`, { cause })
  })
  try {
    const opened = await handle.stat()
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      !sameFileSnapshot(opened, before) ||
      opened.size > maximumSize
    ) {
      throw new Error(`${label} changed before it could be opened safely`)
    }
    const bytes = await readBounded(handle, maximumSize, label)
    const [afterOpen, afterPath] = await Promise.all([
      handle.stat(),
      fs.lstat(absolute),
    ])
    if (
      !sameFileSnapshot(afterOpen, opened) ||
      afterPath.isSymbolicLink() ||
      !afterPath.isFile() ||
      afterPath.nlink !== 1 ||
      !sameFileSnapshot(afterPath, opened)
    ) {
      throw new Error(`${label} changed while its immutable bytes were being verified`)
    }
    return bytes
  } finally {
    await handle.close()
  }
}

function releasePlanIndex(plan, area) {
  if (
    plan?.schema !== "convax.release-plan/1" ||
    !Array.isArray(plan.releases)
  ) {
    throw new Error(`${area} release-plan is invalid`)
  }
  const assets = new Map()
  for (const release of plan.releases) {
    if (
      !release ||
      typeof release.tag !== "string" ||
      !Array.isArray(release.assets)
    ) {
      throw new Error(`${area} release-plan contains an invalid Release`)
    }
    for (const asset of release.assets) {
      if (
        !asset ||
        typeof asset.name !== "string" ||
        typeof asset.path !== "string" ||
        typeof asset.url !== "string" ||
        !Number.isSafeInteger(asset.size) ||
        asset.size <= 0 ||
        typeof asset.sha256 !== "string" ||
        !digestPattern.test(asset.sha256)
      ) {
        throw new Error(`${area} release-plan contains an invalid asset`)
      }
      const expectedPath = `releases/${release.tag}/${asset.name}`
      if (asset.path !== expectedPath) {
        throw new Error(`${area} release-plan asset path differs from its Release`)
      }
      if (assets.has(asset.url)) {
        throw new Error(`${area} release-plan contains a duplicate asset URL`)
      }
      assets.set(asset.url, asset)
    }
  }
  return assets
}

async function verifyLockedArtifact({
  root,
  rootRealPath,
  area,
  lock,
  releaseAssets,
  label,
  expected,
  allowExistingRelease = false,
}) {
  exactKeys(lock, ["path", "url"], label)
  const relativePath = validateRelativePath(lock.path, `${label}.path`)
  if (expected && lock.url !== expected.url) {
    throw new Error(`${label} differs from Registry v2`)
  }
  const { tag, name } = parseReleaseUrl(lock.url, `${label}.url`)
  if (relativePath !== `${area}/releases/${tag}/${name}`) {
    throw new Error(`${label} path and URL identify different immutable bytes`)
  }
  const releaseAsset = releaseAssets.get(lock.url)
  if (!releaseAsset && (!allowExistingRelease || !expected)) {
    throw new Error(`${label} is absent from the ${area} release-plan`)
  }
  if (releaseAsset) {
    if (releaseAsset.path !== `releases/${tag}/${name}`) {
      throw new Error(`${label} release-plan path differs from its URL`)
    }
    if (expected && (
      releaseAsset.size !== expected.size ||
      releaseAsset.sha256 !== expected.sha256
    )) {
      throw new Error(`${label} differs from Registry v2`)
    }
  }
  const maximumSize = area === "builtin"
    ? builtinLimit
    : ["marketplace.json", "registry-v2.json", "showcase-v2.json"].includes(name)
      ? metadataLimit
      : packageLimit
  const bytes = await readStableFile(
    root,
    rootRealPath,
    relativePath,
    label,
    maximumSize,
  )
  const admitted = releaseAsset ?? expected
  if (bytes.length !== admitted.size || sha256(bytes) !== admitted.sha256) {
    throw new Error(
      releaseAsset
        ? `${label} bytes differ from the immutable release-plan`
        : `${label} bytes differ from Registry v2`,
    )
  }
  return bytes
}

function registryArtifact(entry, label) {
  const delivery = entry?.delivery
  if (
    !delivery ||
    delivery.kind !== "artifact" ||
    typeof delivery.url !== "string" ||
    !Number.isSafeInteger(delivery.size) ||
    delivery.size <= 0 ||
    typeof delivery.sha256 !== "string" ||
    !digestPattern.test(delivery.sha256)
  ) {
    throw new Error(`${label} has no immutable artifact delivery`)
  }
  return delivery
}

export async function verifyProductLockInput(inputFile) {
  const lockPath = path.resolve(inputFile)
  const root = path.dirname(lockPath)
  const rootRealPath = await fs.realpath(root)
  const lockRelativePath = path.basename(lockPath)
  const lock = parseJson(
    await readStableFile(
      root,
      rootRealPath,
      lockRelativePath,
      "product-lock-input",
      manifestLimit,
    ),
    "product-lock-input",
  )
  exactKeys(
    lock,
    [
      "builtinBundle",
      "builtinManifestPath",
      "builtinReservations",
      "official",
      "packages",
      "schema",
    ],
    "product-lock-input",
  )
  if (lock.schema !== "convax.product-lock-input/1") {
    throw new Error("product-lock-input schema is unsupported")
  }
  if (
    !Array.isArray(lock.builtinReservations) ||
    lock.builtinReservations.length !== 1 ||
    lock.builtinReservations[0]?.kind !== "skill" ||
    lock.builtinReservations[0]?.id !== "canvas-storyboard"
  ) {
    throw new Error("Builtin reservations must exactly contain skill/canvas-storyboard")
  }
  if (!Array.isArray(lock.packages) || lock.packages.length !== 1) {
    throw new Error("product lock must contain exactly one ffmpeg-tools preinstall")
  }

  const [catalogPlan, builtinPlan, registry] = await Promise.all([
    readStableFile(
      root,
      rootRealPath,
      "catalog/release-plan.json",
      "Catalog release-plan",
      metadataLimit,
    ).then((bytes) => parseJson(bytes, "Catalog release-plan")),
    readStableFile(
      root,
      rootRealPath,
      "builtin/release-plan.json",
      "Builtin release-plan",
      metadataLimit,
    ).then((bytes) => parseJson(bytes, "Builtin release-plan")),
    readStableFile(
      root,
      rootRealPath,
      "catalog/registry-v2.json",
      "Registry v2",
      metadataLimit,
    ).then((bytes) => parseJson(bytes, "Registry v2")),
  ])
  const catalogAssets = releasePlanIndex(catalogPlan, "catalog")
  const builtinAssets = releasePlanIndex(builtinPlan, "builtin")
  if (
    registry?.schema !== "convax.registry/2" ||
    registry.marketplaceId !== "convax-official" ||
    typeof registry.revision !== "string" ||
    !digestPattern.test(registry.revision) ||
    !Array.isArray(registry.packages)
  ) {
    throw new Error("Registry v2 is not the strict Official registry")
  }

  const builtinBundle = await verifyLockedArtifact({
    root,
    rootRealPath,
    area: "builtin",
    lock: lock.builtinBundle,
    releaseAssets: builtinAssets,
    label: "Builtin bundle",
  })
  const manifestPath = validateRelativePath(
    lock.builtinManifestPath,
    "builtinManifestPath",
  )
  if (manifestPath !== "builtin/bundle.json") {
    throw new Error("builtinManifestPath must identify builtin/bundle.json")
  }
  const manifest = JSON.parse(
    (await readStableFile(
      root,
      rootRealPath,
      manifestPath,
      "Builtin manifest",
      manifestLimit,
    )).toString("utf8"),
  )
  if (
    manifest?.schema !== "convax.builtin-bundle/1" ||
    !Array.isArray(manifest.members) ||
    manifest.members.length !== 1 ||
    manifest.members[0]?.kind !== "skill" ||
    manifest.members[0]?.id !== "canvas-storyboard" ||
    builtinBundle.length === 0
  ) {
    throw new Error("Builtin manifest must exactly close skill/canvas-storyboard")
  }

  exactKeys(lock.official, ["descriptor", "registry", "revision", "showcase"], "Official lock")
  if (lock.official.revision !== registry.revision) {
    throw new Error("Official lock revision differs from Registry v2")
  }
  const metadata = [
    ["descriptor", "marketplace.json"],
    ["registry", "registry-v2.json"],
    ["showcase", "showcase-v2.json"],
  ]
  for (const [slot, name] of metadata) {
    const releaseBytes = await verifyLockedArtifact({
      root,
      rootRealPath,
      area: "catalog",
      lock: lock.official[slot],
      releaseAssets: catalogAssets,
      label: `Official ${slot}`,
    })
    const flatBytes = await readStableFile(
      root,
      rootRealPath,
      `catalog/${name}`,
      `Official flat ${name}`,
      metadataLimit,
    )
    if (!releaseBytes.equals(flatBytes)) {
      throw new Error(`Official ${slot} Release differs from flat ${name}`)
    }
  }
  const descriptor = parseJson(
    await readStableFile(
      root,
      rootRealPath,
      "catalog/marketplace.json",
      "Marketplace descriptor",
      metadataLimit,
    ),
    "Marketplace descriptor",
  )
  if (
    descriptor?.id !== "convax-official" ||
    descriptor.registry?.v2?.url !== "https://microvoid.github.io/convax-plugins/registry/v2/index.json" ||
    descriptor.registry?.v1?.url !== "https://microvoid.github.io/convax-plugins/registry/v1/index.json" ||
    descriptor.showcase?.v2?.url !== "https://microvoid.github.io/convax-plugins/showcase/v2/index.json"
  ) {
    throw new Error("Official descriptor public endpoints differ from the approved contract")
  }

  const preinstalled = lock.packages[0]
  exactKeys(
    preinstalled,
    [
      "artifact",
      "companions",
      "id",
      "kind",
      "marketplaceId",
      "ownedSkills",
      "setup",
      "version",
    ],
    "preinstalled package",
  )
  if (
    preinstalled.marketplaceId !== "convax-official" ||
    preinstalled.kind !== "plugin" ||
    preinstalled.id !== "ffmpeg-tools" ||
    preinstalled.setup !== "explicit" ||
    !Array.isArray(preinstalled.ownedSkills) ||
    preinstalled.ownedSkills.length !== 1 ||
    !Array.isArray(preinstalled.companions) ||
    preinstalled.companions.length !== 1
  ) {
    throw new Error("product lock must contain exactly one ffmpeg-tools preinstall")
  }
  const plugin = registry.packages.find(
    (entry) => entry?.kind === "plugin" && entry.id === "ffmpeg-tools",
  )
  if (!plugin || preinstalled.version !== plugin.version) {
    throw new Error("preinstalled ffmpeg-tools version differs from Registry v2")
  }
  await verifyLockedArtifact({
    root,
    rootRealPath,
    area: "catalog",
    lock: preinstalled.artifact,
    releaseAssets: catalogAssets,
    label: "preinstalled Plugin artifact",
    expected: registryArtifact(plugin, "ffmpeg-tools"),
    allowExistingRelease: true,
  })

  const declaredOwnedSkills = plugin.manifest?.contributes?.skills
  if (
    !Array.isArray(declaredOwnedSkills) ||
    declaredOwnedSkills.length !== 1 ||
    declaredOwnedSkills[0]?.name !== "ffmpeg-canvas"
  ) {
    throw new Error("ffmpeg-tools must declare exactly one owned Skill")
  }
  const ownedSkill = registry.packages.find(
    (entry) => entry?.kind === "skill" && entry.id === "ffmpeg-canvas",
  )
  await verifyLockedArtifact({
    root,
    rootRealPath,
    area: "catalog",
    lock: preinstalled.ownedSkills[0],
    releaseAssets: catalogAssets,
    label: "preinstalled owned Skill artifact",
    expected: registryArtifact(ownedSkill, "ffmpeg-canvas"),
    allowExistingRelease: true,
  })

  const lockedCompanion = preinstalled.companions[0]
  exactKeys(lockedCompanion, ["arch", "path", "platform", "url"], "preinstalled companion")
  if (lockedCompanion.platform !== "darwin" || lockedCompanion.arch !== "arm64") {
    throw new Error("preinstalled companion must target only darwin-arm64")
  }
  const companionTarget = plugin.companions
    ?.flatMap((entry) => entry.targets ?? [])
    .find((target) => target.platform === "darwin" && target.arch === "arm64")
  if (!companionTarget?.artifact) {
    throw new Error("Registry v2 has no ffmpeg-tools darwin-arm64 companion")
  }
  await verifyLockedArtifact({
    root,
    rootRealPath,
    area: "catalog",
    lock: { path: lockedCompanion.path, url: lockedCompanion.url },
    releaseAssets: catalogAssets,
    label: "preinstalled companion artifact",
    expected: companionTarget.artifact,
    allowExistingRelease: true,
  })

  return {
    builtinReservations: 1,
    preinstalledPackages: 1,
    verifiedArtifacts: 7,
  }
}

async function main(argv) {
  if (argv.length > 1) throw new Error("Usage: verify-product-lock-input [input-file]")
  const result = await verifyProductLockInput(
    path.resolve(argv[0] ?? "dist/product-lock-input.json"),
  )
  console.log(
    `Verified ${result.builtinReservations} Builtin reservation, ` +
    `${result.preinstalledPackages} preinstalled package, and ` +
    `${result.verifiedArtifacts} immutable product-lock artifacts.`,
  )
}

if (import.meta.main) {
  await main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
