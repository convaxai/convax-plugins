import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  assertSelectedCandidatesMatchSnapshot,
  packageVersionSnapshot,
} from "./marketplace-release.mjs"

function parsePlan(value, label) {
  if (
    !value ||
    value.schema !== "convax.release-plan/1" ||
    !Array.isArray(value.releases)
  ) {
    throw new Error(`${label} is not a release plan`)
  }
  const tags = new Set()
  for (const release of value.releases) {
    if (
      typeof release?.tag !== "string" ||
      !Array.isArray(release.assets) ||
      release.assets.length === 0
    ) {
      throw new Error(`${label} contains an incomplete Release`)
    }
    if (tags.has(release.tag)) throw new Error(`${label} contains duplicate tag ${release.tag}`)
    tags.add(release.tag)
    for (const asset of release.assets) {
      if (
        typeof asset?.path !== "string" ||
        !asset.path.startsWith(`releases/${release.tag}/`) ||
        asset.path.slice(`releases/${release.tag}/`.length).includes("/")
      ) {
        throw new Error(`${label} ${release.tag} contains an asset outside its exact directory`)
      }
    }
  }
  return value.releases
}

export function composePublicationPlan({ builtin, catalog, selected }) {
  if (!Array.isArray(selected)) throw new Error("selected version changes must be an array")
  const selectedTags = new Set()
  let publishesBuiltin = false
  for (const entry of selected) {
    if (
      !entry ||
      !["plugin", "skill", "mcp-server"].includes(entry.kind) ||
      typeof entry.id !== "string" ||
      typeof entry.version !== "string" ||
      typeof entry.releaseTag !== "string"
    ) {
      throw new Error("selected version change is not a canonical Marketplace Kit selection")
    }
    if (selectedTags.has(entry.releaseTag)) throw new Error(`duplicate selected tag ${entry.releaseTag}`)
    selectedTags.add(entry.releaseTag)
    publishesBuiltin ||= entry.kind === "skill" && entry.id === "canvas-storyboard"
  }
  const catalogReleases = parsePlan(catalog, "Catalog release plan")
  const metadata = catalogReleases.filter((release) =>
    /^registry-v2-[a-f0-9]{64}$/.test(release.tag))
  if (metadata.length !== 1) throw new Error("Catalog must contain exactly one Registry metadata Release")
  const packageReleases = catalogReleases.filter((release) => release !== metadata[0])
  const packageTags = new Set(packageReleases.map((release) => release.tag))
  if (
    packageTags.size !== selectedTags.size ||
    [...selectedTags].some((tag) => !packageTags.has(tag))
  ) {
    throw new Error("Catalog package Releases differ from selected version changes")
  }

  const releases = catalogReleases.map((release) => ({
    directory: `catalog/releases/${release.tag}`,
    tag: release.tag,
  }))
  if (publishesBuiltin) {
    const builtinReleases = parsePlan(builtin, "Builtin release plan")
    if (builtinReleases.length !== 1) throw new Error("Builtin must contain exactly one Release")
    releases.push({
      directory: `builtin/releases/${builtinReleases[0].tag}`,
      tag: builtinReleases[0].tag,
    })
  }
  releases.sort((left, right) => left.tag.localeCompare(right.tag, "en"))
  return { schema: "convax.publication-plan/1", releases }
}

async function main() {
  const [selected, catalog, builtin] = await Promise.all([
    fs.readFile("dist/release-plan.json", "utf8").then(JSON.parse),
    fs.readFile("dist/catalog/release-plan.json", "utf8").then(JSON.parse),
    fs.readFile("dist/builtin/release-plan.json", "utf8").then(JSON.parse),
  ])
  const workspaceRoot = path.resolve(
    fileURLToPath(new URL("..", import.meta.url)),
  )
  assertSelectedCandidatesMatchSnapshot(
    selected,
    await packageVersionSnapshot(workspaceRoot),
  )
  const plan = composePublicationPlan({ builtin, catalog, selected })
  const output = path.resolve("dist/publication-plan.json")
  await fs.writeFile(output, `${JSON.stringify(plan, null, 2)}\n`)
  console.log(`Prepared ${plan.releases.length} immutable Releases for publication.`)
}

if (import.meta.main) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
