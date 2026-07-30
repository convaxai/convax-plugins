import { promises as fs } from "node:fs"
import path from "node:path"
import {
  assertPackagesPublishable,
  assetNameFor,
  createDeterministicZip,
  discoverPackages,
  loadCompanionArtifacts,
  parseArgs,
  root,
  sha256,
  showcaseAssetNameFor,
  tagFor,
} from "./lib.mjs"
import { generateSkillApiReferences } from "./generate-skill-api-references.mjs"

function filesWithGeneratedReferences(pkg, referencePlan) {
  const generated = []
  for (const reference of referencePlan?.references ?? []) {
    if (pkg.metadata.kind === "skill" && reference.skillName === pkg.metadata.id) {
      for (const file of reference.files) {
        generated.push({
          data: Buffer.from(file.bytes),
          mode: 0o644,
          relativePath: file.path,
        })
      }
    }
    if (pkg.metadata.kind === "plugin" && reference.pluginId === pkg.metadata.id) {
      for (const file of reference.files) {
        generated.push({
          data: Buffer.from(file.bytes),
          mode: 0o644,
          relativePath: `${reference.bundlePath}/${file.path}`,
        })
      }
    }
  }
  const sourcePaths = new Set(
    pkg.files.map((file) => file.relativePath.toLocaleLowerCase("en-US")),
  )
  const collision = generated.find((file) =>
    sourcePaths.has(file.relativePath.toLocaleLowerCase("en-US")))
  if (collision) {
    throw new Error(
      `${pkg.metadata.kind}/${pkg.metadata.id}: generated Skill reference collides with source ${collision.relativePath}`,
    )
  }
  return [...pkg.files, ...generated].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, "en"))
}

export async function packPackages(packages, outputDirectory, options = {}) {
  if (
    typeof options.referencePlan?.catalogDigest !== "string" ||
    typeof options.referencePlan?.catalogVersion !== "string" ||
    !Array.isArray(options.referencePlan?.references)
  ) {
    throw new Error("pack: a catalog-bound Skill reference plan is required")
  }
  assertPackagesPublishable(packages, "pack")
  if (options.preserveOtherPackages) {
    await fs.mkdir(outputDirectory, { recursive: true })
    await Promise.all(packages.map((pkg) =>
      fs.rm(path.join(outputDirectory, tagFor(pkg.metadata)), { recursive: true, force: true })))
  } else {
    await fs.rm(outputDirectory, { recursive: true, force: true })
  }
  const results = []
  for (const pkg of packages) {
    const tag = tagFor(pkg.metadata)
    const directory = path.join(outputDirectory, tag)
    const assetName = assetNameFor(pkg.metadata)
    const zip = createDeterministicZip(
      filesWithGeneratedReferences(pkg, options.referencePlan),
    )
    const companions = await loadCompanionArtifacts(pkg)
    await fs.mkdir(directory, { recursive: true })
    const zipPath = path.join(directory, assetName)
    await fs.writeFile(zipPath, zip)
    const companionAssets = []
    for (const companion of companions) {
      for (const target of companion.targets) {
        const assetPath = path.join(directory, target.assetName)
        await fs.writeFile(assetPath, target.data, { mode: target.platform === "win32" ? 0o644 : 0o755 })
        const written = await fs.readFile(assetPath)
        if (written.length !== target.artifact.size || sha256(written) !== target.artifact.sha256) {
          throw new Error(`${pkg.metadata.kind}/${pkg.metadata.id}: written companion artifact does not match its Registry metadata`)
        }
        companionAssets.push({
          arch: target.arch,
          assetName: target.assetName,
          command: companion.command,
          data: target.data,
          path: assetPath,
          platform: target.platform,
          version: companion.version,
        })
      }
    }
    const showcaseAssets = []
    if (pkg.showcase) {
      for (const role of ["poster", "animation"]) {
        const media = pkg.showcase[role]
        if (!media) continue
        const name = showcaseAssetNameFor(pkg.metadata, role, media.mime)
        const assetPath = path.join(directory, name)
        await fs.writeFile(assetPath, media.data)
        showcaseAssets.push({ assetName: name, data: media.data, path: assetPath, role })
      }
    }
    results.push({
      assetName,
      ...(options.referencePlan
        ? {
            catalogDigest: options.referencePlan.catalogDigest,
            catalogVersion: options.referencePlan.catalogVersion,
          }
        : {}),
      companionAssets,
      directory,
      pkg,
      showcaseAssets,
      tag,
      zip,
      zipPath,
    })
  }
  return results
}

function selectionForTag(tag) {
  if (typeof tag !== "string") return undefined
  const match = /^(plugin|skill)-([a-z0-9]+(?:-[a-z0-9]+)*)-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(tag)
  return match ? { kind: match[1], id: match[2] } : undefined
}

export async function packFromArgs(argv, options = {}) {
  const normalizedArgv = argv.filter((argument) => argument !== "--")
  const catalogArgumentCount = normalizedArgv.filter(
    (argument) => argument === "--catalog",
  ).length
  if (
    (options.catalogPath === undefined && catalogArgumentCount !== 1) ||
    (options.catalogPath !== undefined && catalogArgumentCount !== 0)
  ) {
    throw new Error("arguments: exactly one --catalog path is required")
  }
  const args = parseArgs(normalizedArgv)
  const supported = new Set(["catalog", "kind", "id", "tag"])
  const unknown = Object.keys(args).find((key) => !supported.has(key))
  if (unknown) throw new Error(`arguments: unsupported --${unknown}`)
  if ((args.kind && !args.id) || (args.id && !args.kind) || (args.tag && (args.kind || args.id))) {
    throw new Error("arguments: use --tag or the --kind/--id pair")
  }
  const workspaceRoot = options.workspaceRoot ?? root
  const outputDirectory = options.outputDirectory ?? path.join(workspaceRoot, "dist", "packages")
  const catalogPath =
    options.catalogPath === undefined
      ? path.resolve(args.catalog)
      : path.resolve(workspaceRoot, options.catalogPath)
  const referencePlan = await generateSkillApiReferences({
    catalogPath,
    check: true,
    workspaceRoot,
  })
  const selection = args.kind ? { kind: args.kind, id: args.id } : selectionForTag(args.tag)
  if (args.tag && !selection) throw new Error("arguments: tag must identify one versioned Plugin or Skill")
  let packages = await discoverPackages({ ...selection, workspaceRoot })
  assertPackagesPublishable(packages, "pack")
  if (args.tag) packages = packages.filter((pkg) => tagFor(pkg.metadata) === args.tag)
  if (args.kind) packages = packages.filter((pkg) => pkg.metadata.kind === args.kind && pkg.metadata.id === args.id)
  if (packages.length === 0) throw new Error("No package matches the requested identity/tag")
  const results = await packPackages(packages, outputDirectory, {
    preserveOtherPackages: Boolean(args.kind || args.tag),
    referencePlan,
  })
  return results
}

if (import.meta.main) {
  const results = await packFromArgs(process.argv.slice(2))
  for (const result of results) {
    const showcase = result.showcaseAssets.length > 0 ? `, ${result.showcaseAssets.length} showcase assets` : ""
    const companions = result.companionAssets.length > 0 ? `, ${result.companionAssets.length} companion assets` : ""
    console.log(`${result.tag}: ${path.relative(root, result.zipPath)} (${result.zip.length} bytes${showcase}${companions})`)
  }
}
