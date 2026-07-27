import { promises as fs } from "node:fs"
import path from "node:path"
import {
  discoverPackages,
  parseArgs,
  parseRegistry,
  parseRegistryEntry,
  readJson,
  root,
  tagFor,
} from "./lib.mjs"

async function findReleaseEntries(directory) {
  const entries = []
  let children
  try {
    children = await fs.readdir(directory, { withFileTypes: true })
  } catch (cause) {
    if (cause?.code === "ENOENT") return entries
    throw cause
  }
  for (const child of children) {
    if (!child.isDirectory()) continue
    const file = path.join(directory, child.name, "registry-entry.json")
    try {
      const entry = parseRegistryEntry(await readJson(file), path.relative(root, file))
      if (child.name !== tagFor(entry)) {
        throw new Error(`${path.relative(root, file)}: directory tag does not match Registry entry`)
      }
      entries.push({ entry, tag: child.name })
    } catch (cause) {
      if (cause.cause?.code === "ENOENT") continue
      throw cause
    }
  }
  entries.sort((left, right) => left.tag.localeCompare(right.tag))
  return entries
}

function packageIdentity(value) {
  return `${value.kind}/${value.id}`
}

export function selectCatalogReleaseTags({ entries, packages, previousRegistry }) {
  const availableTags = new Set(entries.map(({ tag }) => tag))
  const groupedIdentities = new Set()
  const selectedTags = new Set()
  const withheldGroups = []

  for (const plugin of packages.filter((pkg) =>
    pkg.metadata.kind === "plugin" &&
    Array.isArray(pkg.manifest.contributes.skills) &&
    pkg.manifest.contributes.skills.length > 0)) {
    const skills = plugin.manifest.contributes.skills.map((contribution) => {
      const skill = packages.find((pkg) =>
        pkg.metadata.kind === "skill" &&
        pkg.metadata.id === contribution.name &&
        pkg.metadata.ownerPluginId === plugin.metadata.id)
      if (!skill) {
        throw new Error(`plugin/${plugin.metadata.id}: owned Skill ${contribution.name} is missing from source packages`)
      }
      return skill
    })
    const group = [plugin, ...skills]
    const groupIdentities = new Set(group.map((pkg) => packageIdentity(pkg.metadata)))
    for (const identity of groupIdentities) groupedIdentities.add(identity)

    const currentTags = group.map((pkg) => tagFor(pkg.metadata))
    const complete = currentTags.every((tag) => availableTags.has(tag))
    if (complete) {
      for (const tag of currentTags) selectedTags.add(tag)
    } else {
      withheldGroups.push({
        missing: currentTags.filter((tag) => !availableTags.has(tag)),
        ownerPluginId: plugin.metadata.id,
      })
    }

    for (const previous of previousRegistry?.packages ?? []) {
      if (groupIdentities.has(packageIdentity(previous))) {
        const tag = tagFor(previous)
        if (!availableTags.has(tag)) {
          throw new Error(`Previous Registry package ${tag} has no fetched immutable Release entry`)
        }
        selectedTags.add(tag)
      }
    }
  }

  for (const { entry, tag } of entries) {
    if (!groupedIdentities.has(packageIdentity(entry))) selectedTags.add(tag)
  }

  return {
    selectedTags: [...selectedTags].sort(),
    withheldGroups,
  }
}

export async function prepareReleaseCatalog({ entriesDirectory, packages, previousRegistry }) {
  const entries = await findReleaseEntries(entriesDirectory)
  const selection = selectCatalogReleaseTags({ entries, packages, previousRegistry })
  const selected = new Set(selection.selectedTags)
  await Promise.all(entries
    .filter(({ tag }) => !selected.has(tag))
    .map(({ tag }) => fs.rm(path.join(entriesDirectory, tag), { force: true, recursive: true })))
  return selection
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2).filter((argument) => argument !== "--"))
  const supported = new Set(["entries", "previous"])
  const unknown = Object.keys(args).find((key) => !supported.has(key))
  if (unknown) throw new Error(`arguments: unsupported --${unknown}`)
  const previousRegistry = args.previous === undefined
    ? undefined
    : parseRegistry(await readJson(path.resolve(root, args.previous), args.previous), "Previous Registry")
  const result = await prepareReleaseCatalog({
    entriesDirectory: path.resolve(root, args.entries ?? "dist/release-entries"),
    packages: await discoverPackages(),
    previousRegistry,
  })
  for (const group of result.withheldGroups) {
    console.log(`Withheld incomplete owned-Skill update for ${group.ownerPluginId}; missing Releases: ${group.missing.join(", ")}`)
  }
  console.log(`Prepared ${result.selectedTags.length} independently publishable Release entries.`)
}
