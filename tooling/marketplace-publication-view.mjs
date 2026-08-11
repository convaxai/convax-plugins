import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { effectiveCatalogExclusionIdentities } from "./catalog-exclusions.mjs"
import { partitionPackagePublications } from "./publication-eligibility.mjs"

function containedRelativePath(workspaceRoot, source) {
  const relative = path.relative(workspaceRoot, source)
  if (
    relative === "" ||
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`publication view source escapes the workspace: ${source}`)
  }
  return relative
}

async function copyNoFollow(source, target, label, depth = 0) {
  const state = await fs.lstat(source)
  if (state.isSymbolicLink()) {
    throw new Error(`${label}: symlinks are forbidden in the publication view`)
  }
  if (state.isDirectory()) {
    await fs.mkdir(target, { recursive: true, mode: state.mode & 0o777 })
    const entries = await fs.readdir(source)
    for (const entry of entries.sort((left, right) =>
      left.localeCompare(right, "en"))) {
      if (
        entry === ".git" ||
        entry === "node_modules" ||
        (depth === 0 && entry === "dist") ||
        (entry === "build" && label.endsWith("/vendor"))
      ) {
        continue
      }
      await copyNoFollow(
        path.join(source, entry),
        path.join(target, entry),
        `${label}/${entry}`,
        depth + 1,
      )
    }
    return
  }
  if (!state.isFile()) {
    throw new Error(`${label}: only regular files and directories are allowed`)
  }
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, await fs.readFile(source), {
    mode: state.mode & 0o777,
  })
}

async function copyWorkspacePath(workspaceRoot, viewRoot, source, copied) {
  const relative = containedRelativePath(workspaceRoot, source)
  if (copied.has(relative)) return
  copied.add(relative)
  await copyNoFollow(
    source,
    path.join(viewRoot, relative),
    relative.split(path.sep).join("/"),
  )
}

export async function createMarketplacePublicationView({
  candidates,
  excluded = [],
  packages,
  workspaceRoot,
}) {
  const publication = partitionPackagePublications(packages)
  const admittedByIdentity = new Map(
    packages.map((pkg) => [
      `${pkg.metadata.kind}/${pkg.metadata.id}`,
      pkg,
    ]),
  )
  const excludedIdentities = effectiveCatalogExclusionIdentities(
    packages.map(({ metadata }) => metadata),
    excluded,
  )
  const viewRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "convax-marketplace-publication-"),
  )
  const copied = new Set()
  try {
    for (const relative of [
      "marketplace.json",
      "catalogs",
      "registry/config.json",
    ]) {
      await copyWorkspacePath(
        workspaceRoot,
        viewRoot,
        path.join(workspaceRoot, relative),
        copied,
      )
    }
    const companionInputs = path.join(
      workspaceRoot,
      ".marketplace",
      "companion-inputs",
    )
    if (await fs.lstat(companionInputs).catch(() => undefined)) {
      await copyWorkspacePath(
        workspaceRoot,
        viewRoot,
        companionInputs,
        copied,
      )
    }
    for (const candidate of candidates) {
      const identity = `${candidate.kind}/${candidate.id}`
      if (excludedIdentities.has(identity)) continue
      const pkg = admittedByIdentity.get(identity)
      if (pkg && publication.effective.get(identity).status === "blocked") continue
      await copyWorkspacePath(
        workspaceRoot,
        viewRoot,
        candidate.root,
        copied,
      )
      for (const companion of pkg?.metadata.companions ?? []) {
        await copyWorkspacePath(
          workspaceRoot,
          viewRoot,
          path.join(workspaceRoot, companion.source, "package.json"),
          copied,
        )
        for (const target of companion.targets) {
          await copyWorkspacePath(
            workspaceRoot,
            viewRoot,
            path.join(
              workspaceRoot,
              companion.source,
              target.path,
            ),
            copied,
          )
        }
      }
    }
    return {
      excluded: [...excludedIdentities]
        .sort((left, right) => left.localeCompare(right, "en"))
        .map((identity) => {
          const separator = identity.indexOf("/")
          return { kind: identity.slice(0, separator), id: identity.slice(separator + 1) }
        }),
      omissions: {
        schema: "convax.marketplace-build-omissions/1",
        omitted: publication.omitted,
      },
      root: viewRoot,
    }
  } catch (error) {
    await fs.rm(viewRoot, { force: true, recursive: true })
    throw error
  }
}

export async function disposeMarketplacePublicationView(view) {
  await fs.rm(view.root, { force: true, recursive: true })
}
