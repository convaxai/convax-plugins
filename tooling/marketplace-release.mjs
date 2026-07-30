import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  changedMarketplaceVersions,
  discoverMarketplacePackages,
  releaseTagForPackage,
} from "@convax/marketplace-kit"
import { renderPluginApiJson } from "@convax/plugin-api/generator"
import {
  discoverPackages,
} from "./lib.mjs"
import {
  createOwnedSkillReferenceFiles,
  generateSkillApiReferences,
} from "./generate-skill-api-references.mjs"
import { verifyPendingHostCapabilityHistory } from "./host-capability-history.mjs"
import { effectivePackagePublications } from "./publication-eligibility.mjs"

function sha256(input) {
  return createHash("sha256").update(input).digest("hex")
}

const catalogSnapshotBytes = Buffer.from(renderPluginApiJson())

async function collectPackageFiles(directory, relative = "") {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name, "en"))) {
    if (
      entry.name === "dist" ||
      entry.name === "node_modules" ||
      entry.name === ".DS_Store"
    ) {
      continue
    }
    const absolute = path.join(directory, entry.name)
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name
    if (
      nextRelative === ".git" ||
      nextRelative === "vendor/build" ||
      nextRelative.startsWith("vendor/build/")
    ) {
      continue
    }
    if (entry.isDirectory()) {
      files.push(...await collectPackageFiles(absolute, nextRelative))
    } else if (entry.isFile()) {
      files.push({ path: nextRelative, bytes: await fs.readFile(absolute) })
    } else {
      throw new Error(
        `${absolute}: package source must contain only regular files and directories`,
      )
    }
  }
  return files
}

async function collectOptionalFiles(directory, label) {
  const state = await fs.lstat(directory).catch((cause) => {
    if (cause?.code === "ENOENT") return undefined
    throw cause
  })
  if (!state) return []
  if (!state.isDirectory() || state.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory`)
  }
  return collectPackageFiles(directory)
}

async function collectPackageAuthoringFiles(candidate) {
  const files = []
  for (const name of ["convax-package.json", "package.json"]) {
    files.push({
      path: name,
      bytes: await fs.readFile(path.join(candidate.root, name)),
    })
  }
  files.push(...await collectOptionalFiles(
    path.join(candidate.root, "showcase"),
    `${candidate.kind}/${candidate.id} showcase`,
  ).then((entries) => entries.map((file) => ({
    path: `showcase/${file.path}`,
    bytes: file.bytes,
  }))))
  return files
}

async function collectTrackedSourceFiles(workspaceRoot, relativeRoot) {
  let output
  try {
    output = execFileSync(
      "git",
      ["ls-files", "-z", "--", relativeRoot],
      { cwd: workspaceRoot, encoding: "utf8" },
    )
  } catch {
    return collectPackageFiles(path.join(workspaceRoot, relativeRoot))
  }
  const prefix = `${relativeRoot.replaceAll(path.sep, "/")}/`
  const files = []
  for (const relativePath of output.split("\0").filter(Boolean).sort()) {
    const source = path.join(workspaceRoot, relativePath)
    const state = await fs.lstat(source)
    if (!state.isFile() || state.isSymbolicLink()) {
      throw new Error(
        `${relativePath}: tracked companion source must be a regular no-follow file`,
      )
    }
    files.push({
      path: relativePath.startsWith(prefix)
        ? relativePath.slice(prefix.length)
        : relativePath,
      bytes: await fs.readFile(source),
    })
  }
  return files
}

function digestFiles(files) {
  const hash = createHash("sha256")
  for (const file of files.sort((left, right) =>
    left.path.localeCompare(right.path, "en"))) {
    const pathBytes = Buffer.from(file.path, "utf8")
    const size = Buffer.alloc(8)
    size.writeBigUInt64BE(BigInt(file.bytes.length))
    hash.update(pathBytes)
    hash.update(Buffer.from([0]))
    hash.update(size)
    hash.update(file.bytes)
  }
  return hash.digest("hex")
}

function itemKey(kind, id) {
  return sha256(Buffer.from(`${kind}\0${id}`, "utf8"))
}

function generatedReferenceFiles(pkg, authoredByIdentity) {
  const files = []
  if (pkg.metadata.kind === "plugin") {
    for (const skill of pkg.manifest.contributes.skills ?? []) {
      for (const reference of createOwnedSkillReferenceFiles({
        manifest: pkg.manifest,
        skill,
      })) {
        files.push({
          path: `.generated/${skill.path}/${reference.path}`,
          bytes: Buffer.from(reference.bytes),
        })
      }
    }
  } else if (pkg.metadata.ownerPluginId) {
    const owner = authoredByIdentity.get(
      `plugin/${pkg.metadata.ownerPluginId}`,
    )
    const skill = owner?.manifest.contributes.skills?.find(
      (item) => item.name === pkg.metadata.id,
    )
    if (!owner || !skill) {
      throw new Error(
        `skill/${pkg.metadata.id}: missing canonical owner contribution`,
      )
    }
    for (const reference of createOwnedSkillReferenceFiles({
      manifest: owner.manifest,
      skill,
    })) {
      files.push({
        path: `.generated/${reference.path}`,
        bytes: Buffer.from(reference.bytes),
      })
    }
  }
  if (files.length > 0) {
    files.push({
      path: ".generated/plugin-api-catalog.json",
      bytes: catalogSnapshotBytes,
    })
  }
  return files
}

export async function packageVersionSnapshot(workspaceRoot) {
  const authored = await discoverPackages({ workspaceRoot })
  const effectivePublications = effectivePackagePublications(authored)
  const authoredByIdentity = new Map(
    authored.map((pkg) => [
      `${pkg.metadata.kind}/${pkg.metadata.id}`,
      pkg,
    ]),
  )
  const discovered = await discoverMarketplacePackages(workspaceRoot)
  const result = new Map()
  for (const candidate of discovered) {
    const key = `${candidate.kind}\0${candidate.id}`
    if (result.has(key)) {
      throw new Error(
        `${candidate.kind}/${candidate.id}: duplicate package identity`,
      )
    }
    const files = []
    if (candidate.kind === "plugin" || candidate.kind === "skill") {
      const pkg = authoredByIdentity.get(`${candidate.kind}/${candidate.id}`)
      if (!pkg) {
        throw new Error(
          `${candidate.kind}/${candidate.id}: missing admitted package`,
        )
      }
      files.push(...(await collectPackageAuthoringFiles(candidate)).map((file) => ({
        path: `.source/${candidate.kind}/${candidate.id}/${file.path}`,
        bytes: file.bytes,
      })))
      files.push(...pkg.files.map((file) => ({
        path: `${candidate.kind}/${candidate.id}/${file.relativePath}`,
        bytes: file.data,
      })))
      files.push(...generatedReferenceFiles(pkg, authoredByIdentity))
      if (candidate.kind === "plugin") {
        for (const companion of pkg.metadata.companions ?? []) {
          files.push(...(await collectTrackedSourceFiles(
            workspaceRoot,
            companion.source,
          )).map((file) => ({
            path: `${companion.source}/${file.path}`,
            bytes: file.bytes,
          })))
          for (const target of companion.targets) {
            const targetPath = path.join(
              workspaceRoot,
              companion.source,
              target.path,
            )
            const state = await fs.lstat(targetPath)
            if (!state.isFile() || state.isSymbolicLink()) {
              throw new Error(
                `${companion.source}/${target.path}: companion target must be a regular no-follow file`,
              )
            }
            files.push({
              path: `.built/${companion.source}/${target.path}`,
              bytes: await fs.readFile(targetPath),
            })
          }
        }
      }
    } else {
      files.push(...(await collectPackageFiles(candidate.root)).map((file) => ({
        path: `mcp-server/${candidate.id}/${file.path}`,
        bytes: file.bytes,
      })))
      const companionRoot = `.marketplace/companion-inputs/${itemKey(
        candidate.kind,
        candidate.id,
      )}`
      files.push(...(await collectOptionalFiles(
        path.join(workspaceRoot, companionRoot),
        "managed MCP companion input",
      )).map((file) => ({
        path: `${companionRoot}/${file.path}`,
        bytes: file.bytes,
      })))
    }
    result.set(key, {
      digest: digestFiles(files),
      id: candidate.id,
      itemKey: itemKey(candidate.kind, candidate.id),
      kind: candidate.kind,
      publication:
        effectivePublications.get(`${candidate.kind}/${candidate.id}`) ??
        { status: "ready", blockers: [], blockedBy: [] },
      releaseTag: releaseTagForPackage(candidate),
      version: candidate.version,
    })
  }
  return result
}

export function assertSelectedCandidatesMatchSnapshot(
  selected,
  current,
  { allowBlocked = false } = {},
) {
  if (!Array.isArray(selected)) {
    throw new Error("selected version changes must be an array")
  }
  const identities = new Set()
  for (const entry of selected) {
    if (
      !entry ||
      typeof entry.kind !== "string" ||
      typeof entry.id !== "string" ||
      typeof entry.version !== "string" ||
      typeof entry.releaseTag !== "string"
    ) {
      throw new Error("selected version change is incomplete")
    }
    const key = `${entry.kind}\0${entry.id}`
    if (identities.has(key)) {
      throw new Error(
        `selected version change duplicates ${entry.kind}/${entry.id}`,
      )
    }
    identities.add(key)
    const candidate = current.get(key)
    if (!candidate) {
      throw new Error(
        `selected version change ${entry.kind}/${entry.id} is absent from current source`,
      )
    }
    for (const field of ["id", "kind", "releaseTag", "version"]) {
      if (entry[field] !== candidate[field]) {
        throw new Error(
          `selected version change ${entry.kind}/${entry.id} ${field} differs from current source`,
        )
      }
    }
    if (!allowBlocked && candidate.publication.status === "blocked") {
      const blockers = candidate.publication.blockers
        .map((blocker) => `${blocker.code}: ${blocker.note}`)
        .join("; ")
      throw new Error(
        `selected version change ${entry.kind}/${entry.id}@${entry.version} is publication-blocked (${blockers})`,
      )
    }
  }
}

export function createReleaseSelectionPlan(selected, current) {
  assertSelectedCandidatesMatchSnapshot(selected, current, {
    allowBlocked: true,
  })
  const ready = []
  const omitted = []
  for (const entry of selected) {
    const candidate = current.get(`${entry.kind}\0${entry.id}`)
    if (candidate.publication.status === "blocked") {
      omitted.push({
        ...entry,
        publication: candidate.publication,
      })
    } else {
      ready.push(entry)
    }
  }
  return {
    omissions: {
      schema: "convax.release-omissions/1",
      omitted,
    },
    selected: ready,
  }
}

function parseCliArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument ${argument}`)
    }
    const key = argument.slice(2)
    if (
      !["base", "catalog", "governance-base", "head", "omissions-output", "output"].includes(key) ||
      result[key] !== undefined
    ) {
      throw new Error(`Unsupported or duplicate argument ${argument}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`)
    }
    result[key] = value
    index += 1
  }
  if (
    !result.base ||
    !result.catalog ||
    !result["governance-base"] ||
    !result.output ||
    !result["omissions-output"]
  ) {
    throw new Error(
      "Usage: marketplace-release --base <sha> --governance-base <protected-main-sha> --catalog <external-plugin-api.json> --output <ready-file> --omissions-output <diagnostics-file> [--head <sha>]",
    )
  }
  return result
}

async function main(argv) {
  const args = parseCliArgs(argv)
  const repositoryRoot = path.resolve(
    fileURLToPath(new URL("..", import.meta.url)),
  )
  await generateSkillApiReferences({
    catalogPath: path.resolve(repositoryRoot, args.catalog),
    check: true,
    workspaceRoot: repositoryRoot,
  })
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim()
  if (args.head && args.head !== head) {
    throw new Error(`--head ${args.head} does not equal checked out HEAD ${head}`)
  }
  await verifyPendingHostCapabilityHistory(
    repositoryRoot,
    args["governance-base"],
  )
  const current = await packageVersionSnapshot(repositoryRoot)
  const changed = await changedMarketplaceVersions(
    repositoryRoot,
    args.base,
  )
  const plan = createReleaseSelectionPlan(changed, current)
  const output = path.resolve(repositoryRoot, args.output)
  const omissionsOutput = path.resolve(
    repositoryRoot,
    args["omissions-output"],
  )
  await Promise.all([
    fs.mkdir(path.dirname(output), { recursive: true }),
    fs.mkdir(path.dirname(omissionsOutput), { recursive: true }),
  ])
  await Promise.all([
    fs.writeFile(output, `${JSON.stringify(plan.selected, null, 2)}\n`),
    fs.writeFile(
      omissionsOutput,
      `${JSON.stringify(plan.omissions, null, 2)}\n`,
    ),
  ])
  console.log(
    `Selected ${plan.selected.length} ready version-change release${plan.selected.length === 1 ? "" : "s"}; omitted ${plan.omissions.omitted.length} publication-blocked.`,
  )
  for (const entry of plan.omissions.omitted) {
    console.log(
      `OMITTED ${entry.kind}/${entry.id}@${entry.version}: ${entry.publication.blockers
        .map((blocker) => `${blocker.code}: ${blocker.note}`)
        .join("; ")}`,
    )
  }
}

if (import.meta.main) await main(process.argv.slice(2))
