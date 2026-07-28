import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const collections = [
  { directory: "mcp-servers", kind: "mcp-server", metadata: "server.json" },
  { directory: "plugins", kind: "plugin", metadata: "convax-package.json" },
  { directory: "skills", kind: "skill", metadata: "convax-package.json" },
]

function sha256(input) {
  return createHash("sha256").update(input).digest("hex")
}

function itemKey(kind, id) {
  return sha256(Buffer.from(`${kind}\0${id}`, "utf8"))
}

async function collectPackageFiles(directory, relative = "") {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    if (entry.name === "dist" || entry.name === "node_modules" || entry.name === ".DS_Store") continue
    const absolute = path.join(directory, entry.name)
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...await collectPackageFiles(absolute, nextRelative))
    else if (entry.isFile()) files.push({ path: nextRelative, bytes: await fs.readFile(absolute) })
    else throw new Error(`${absolute}: package source must contain only regular files and directories`)
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

function digestFiles(files) {
  const hash = createHash("sha256")
  for (const file of files) {
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

function parseIdentity(kind, metadata, label) {
  const id = kind === "mcp-server" ? metadata.name : metadata.id
  if (typeof id !== "string" || id.length === 0) throw new Error(`${label}: missing package identity`)
  if (typeof metadata.version !== "string" || metadata.version.length === 0) {
    throw new Error(`${label}: missing package version`)
  }
  if (kind !== "mcp-server" && metadata.kind !== kind) {
    throw new Error(`${label}: metadata kind does not match its collection`)
  }
  return { id, version: metadata.version }
}

function pluginCompanionSourceRoots(metadata, label) {
  if (metadata.companions === undefined) return []
  if (!Array.isArray(metadata.companions)) throw new Error(`${label}: companions must be an array`)
  return metadata.companions.map((companion, index) => {
    const source = companion?.source
    if (
      typeof source !== "string" ||
      !/^packages\/tools\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(source)
    ) {
      throw new Error(`${label}: companion ${index} source must name one packages/tools directory`)
    }
    return source
  })
}

function pluginOwnedSkillNames(manifest, label) {
  const skills = manifest?.contributes?.skills
  if (skills === undefined) return []
  if (!Array.isArray(skills)) throw new Error(`${label}: contributes.skills must be an array`)
  return skills.map((skill, index) => {
    if (
      typeof skill?.name !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(skill.name)
    ) {
      throw new Error(`${label}: owned Skill ${index} has an invalid name`)
    }
    return skill.name
  })
}

async function readOptionalJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8").catch((cause) => {
    if (cause?.code === "ENOENT") return "null"
    throw cause
  }))
}

async function pluginLinkedSourceRoots(workspaceRoot, packageRoot, metadata, label) {
  const roots = pluginCompanionSourceRoots(metadata, label)
  const manifest = await readOptionalJson(path.join(packageRoot, "package", "manifest.json"))
  for (const skillName of pluginOwnedSkillNames(manifest, label)) {
    const skillRoot = `packages/skills/${skillName}`
    const skillMetadata = await readOptionalJson(path.join(
      workspaceRoot,
      skillRoot,
      "convax-package.json",
    ))
    if (
      skillMetadata?.kind !== "skill" ||
      skillMetadata.id !== skillName ||
      skillMetadata.ownerPluginId !== metadata.id
    ) {
      throw new Error(`${label}: owned Skill ${skillName} does not bind back to ${metadata.id}`)
    }
    roots.push(skillRoot)
  }
  return [...new Set(roots)].sort((left, right) => left.localeCompare(right, "en"))
}

export async function packageVersionSnapshot(workspaceRoot) {
  const result = new Map()
  for (const collection of collections) {
    const collectionRoot = path.join(workspaceRoot, "packages", collection.directory)
    const directories = await fs.readdir(collectionRoot, { withFileTypes: true }).catch((cause) => {
      if (cause?.code === "ENOENT") return []
      throw cause
    })
    for (const directory of directories.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      if (!directory.isDirectory() || directory.name.startsWith(".")) continue
      const packageRoot = path.join(collectionRoot, directory.name)
      const metadataPath = path.join(packageRoot, collection.metadata)
      const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"))
      const label = `${collection.directory}/${directory.name}`
      const identity = parseIdentity(collection.kind, metadata, label)
      const key = `${collection.kind}\0${identity.id}`
      if (result.has(key)) throw new Error(`${label}: duplicate package identity`)
      const sourceFiles = (await collectPackageFiles(packageRoot)).map((file) => ({
        ...file,
        path: `${label}/${file.path}`,
      }))
      if (collection.kind === "plugin") {
        for (const linkedRoot of await pluginLinkedSourceRoots(
          workspaceRoot,
          packageRoot,
          metadata,
          label,
        )) {
          sourceFiles.push(...(await collectPackageFiles(path.join(workspaceRoot, linkedRoot)))
            .map((file) => ({ ...file, path: `${linkedRoot}/${file.path}` })))
        }
      }
      const keyDigest = itemKey(collection.kind, identity.id)
      if (collection.kind === "mcp-server") {
        const companionRoot = `.marketplace/companion-inputs/${keyDigest}`
        sourceFiles.push(...(await collectOptionalFiles(
          path.join(workspaceRoot, companionRoot),
          "managed MCP companion input",
        ))
          .map((file) => ({ ...file, path: `${companionRoot}/${file.path}` })))
      }
      result.set(key, {
        digest: digestFiles(sourceFiles.sort((left, right) =>
          left.path.localeCompare(right.path, "en"))),
        directory: label,
        id: identity.id,
        itemKey: keyDigest,
        kind: collection.kind,
        version: identity.version,
      })
    }
  }
  return result
}

function releaseTagFor(item) {
  return item.kind === "mcp-server"
    ? `mcp-server-${item.itemKey.slice(0, 16)}-v${item.version}`
    : `${item.kind}-${item.id}-v${item.version}`
}

export function changedPackageVersions(previous, current) {
  for (const [key, item] of previous) {
    if (!current.has(key)) {
      throw new Error(
        `${item.kind}/${item.id}@${item.version} was removed; publish a reviewed yanked version instead`,
      )
    }
  }
  const changes = []
  for (const [key, item] of current) {
    const old = previous.get(key)
    if (old?.version === item.version) {
      if (old.digest !== item.digest) {
        throw new Error(`${item.kind}/${item.id}@${item.version} changed without a version change`)
      }
      continue
    }
    changes.push({
      id: item.id,
      itemKey: item.itemKey,
      kind: item.kind,
      previousVersion: old?.version,
      releaseTag: releaseTagFor(item),
      version: item.version,
    })
  }
  return changes.sort((left, right) =>
    `${left.kind}\0${left.id}`.localeCompare(`${right.kind}\0${right.id}`, "en"))
}

function git(repositoryRoot, args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: args.includes("-z") ? "buffer" : "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
}

export function gitTreePackageSnapshot(repositoryRoot, revision) {
  const tree = git(repositoryRoot, [
    "ls-tree",
    "-r",
    "-z",
    revision,
    "--",
    "packages/plugins",
    "packages/skills",
    "packages/mcp-servers",
    "packages/tools",
    ".marketplace/companion-inputs",
  ])
  const filesByPackage = new Map()
  const companionFilesByItemKey = new Map()
  for (const record of tree.toString("utf8").split("\0").filter(Boolean)) {
    const match = /^[0-7]{6} blob ([a-f0-9]{40})\t(.+)$/.exec(record)
    if (!match) continue
    const [, blob, file] = match
    const parts = file.split("/")
    if (
      parts[0] === ".marketplace" &&
      parts[1] === "companion-inputs" &&
      parts.length >= 5
    ) {
      const files = companionFilesByItemKey.get(parts[2]) ?? []
      files.push({ blob, path: parts.slice(3).join("/") })
      companionFilesByItemKey.set(parts[2], files)
      continue
    }
    if (parts.length < 4 || parts[2].startsWith(".")) continue
    const packageRoot = parts.slice(0, 3).join("/")
    const files = filesByPackage.get(packageRoot) ?? []
    files.push({ blob, path: parts.slice(3).join("/") })
    filesByPackage.set(packageRoot, files)
  }
  const result = new Map()
  for (const [packageRoot, files] of filesByPackage) {
    const [, collection, directory] = packageRoot.split("/")
    const definition = collections.find((item) => item.directory === collection)
    if (!definition) continue
    const metadataRecord = files.find((item) => item.path === definition.metadata)
    if (!metadataRecord) {
      throw new Error(`${packageRoot}: missing ${definition.metadata}`)
    }
    const metadata = JSON.parse(git(repositoryRoot, [
      "show",
      `${revision}:${packageRoot}/${definition.metadata}`,
    ]))
    const identity = parseIdentity(definition.kind, metadata, packageRoot)
    const key = `${definition.kind}\0${identity.id}`
    if (result.has(key)) throw new Error(`${packageRoot}: duplicate package identity`)
    const sourceFiles = files.map((file) => ({
      ...file,
      path: `${packageRoot}/${file.path}`,
    }))
    if (definition.kind === "plugin") {
      for (const linkedRoot of pluginCompanionSourceRoots(metadata, packageRoot)) {
        const linked = filesByPackage.get(linkedRoot)
        if (!linked) throw new Error(`${packageRoot}: missing linked companion source ${linkedRoot}`)
        sourceFiles.push(...linked.map((file) => ({
          ...file,
          path: `${linkedRoot}/${file.path}`,
        })))
      }
      const manifestRecord = files.find((file) => file.path === "package/manifest.json")
      const manifest = manifestRecord
        ? JSON.parse(git(repositoryRoot, [
            "show",
            `${revision}:${packageRoot}/package/manifest.json`,
          ]))
        : undefined
      for (const skillName of pluginOwnedSkillNames(manifest, packageRoot)) {
        const skillRoot = `packages/skills/${skillName}`
        const linked = filesByPackage.get(skillRoot)
        if (!linked) throw new Error(`${packageRoot}: missing owned Skill ${skillName}`)
        const skillMetadataRecord = linked.find((file) => file.path === "convax-package.json")
        if (!skillMetadataRecord) throw new Error(`${skillRoot}: missing convax-package.json`)
        const skillMetadata = JSON.parse(git(repositoryRoot, [
          "show",
          `${revision}:${skillRoot}/convax-package.json`,
        ]))
        if (
          skillMetadata.kind !== "skill" ||
          skillMetadata.id !== skillName ||
          skillMetadata.ownerPluginId !== metadata.id
        ) {
          throw new Error(`${packageRoot}: owned Skill ${skillName} does not bind back to ${metadata.id}`)
        }
        sourceFiles.push(...linked.map((file) => ({
          ...file,
          path: `${skillRoot}/${file.path}`,
        })))
      }
    }
    const keyDigest = itemKey(definition.kind, identity.id)
    if (definition.kind === "mcp-server") {
      const companionRoot = `.marketplace/companion-inputs/${keyDigest}`
      sourceFiles.push(...(companionFilesByItemKey.get(keyDigest) ?? []).map((file) => ({
        ...file,
        path: `${companionRoot}/${file.path}`,
      })))
    }
    const digest = sha256(sourceFiles
      .sort((left, right) => left.path.localeCompare(right.path, "en"))
      .map((file) => `${file.path}\0${file.blob}\n`)
      .join(""))
    result.set(key, {
      digest,
      directory: `${collection}/${directory}`,
      id: identity.id,
      itemKey: keyDigest,
      kind: definition.kind,
      version: identity.version,
    })
  }
  return result
}

function parseCliArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument ${argument}`)
    const key = argument.slice(2)
    if (!["base", "head", "output"].includes(key) || result[key] !== undefined) {
      throw new Error(`Unsupported or duplicate argument ${argument}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`)
    result[key] = value
    index += 1
  }
  if (!result.base || !result.output) throw new Error("Usage: marketplace-release --base <sha> --output <file> [--head <sha>]")
  return result
}

async function main(argv) {
  const args = parseCliArgs(argv)
  const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
  const head = args.head ?? "HEAD"
  const changes = changedPackageVersions(
    gitTreePackageSnapshot(repositoryRoot, args.base),
    gitTreePackageSnapshot(repositoryRoot, head),
  )
  const output = path.resolve(repositoryRoot, args.output)
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, `${JSON.stringify(changes, null, 2)}\n`)
  console.log(`Selected ${changes.length} version-change release${changes.length === 1 ? "" : "s"}.`)
}

if (import.meta.main) await main(process.argv.slice(2))
