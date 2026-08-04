import { promises as fs } from "node:fs"
import path from "node:path"

import { readJsonc, root } from "./lib.mjs"
import {
  buildPluginBundleProvenance,
  canonicalJson,
  inspectFrozenPluginSdkLock,
  parseStrictJson,
  sha256,
  verifyPluginSdkClosure,
} from "./plugin-sdk-provenance.mjs"

const releaseBase =
  "https://github.com/convaxai/convax-plugins/releases/download"

function fail(message) {
  throw new Error(`Plugin SDK provenance CLI: ${message}`)
}

function parseArguments(argv, supported) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (
      !key ||
      !supported.has(key) ||
      typeof value !== "string" ||
      value.startsWith("--") ||
      values.has(key)
    ) {
      fail("invalid or duplicate command arguments")
    }
    values.set(key, value)
  }
  for (const key of supported) {
    if (!values.has(key)) fail(`${key} is required`)
  }
  return Object.fromEntries(
    [...values].map(([key, value]) => [key.slice(2).replaceAll("-", "_"), value]),
  )
}

async function readJson(pathname, label) {
  return parseStrictJson(await fs.readFile(pathname), label)
}

async function writeExclusive(pathname, value) {
  await fs.mkdir(path.dirname(pathname), { recursive: true })
  await fs.writeFile(pathname, `${canonicalJson(value)}\n`, { flag: "wx" })
}

export async function inspectFrozenLockFromFiles({
  apiInstallPath,
  bunfigPath,
  lockPath,
  outputPath,
  packagePath,
  sdkInstallPath,
}) {
  const [bunfigBytes, lock, lockBytes, rootPackage] = await Promise.all([
    fs.readFile(bunfigPath),
    readJsonc(lockPath),
    fs.readFile(lockPath),
    readJson(packagePath, "root package.json"),
  ])
  const frozenLock = inspectFrozenPluginSdkLock({
    bunfigBytes,
    lock,
    lockBytes,
    rootPackage,
  })
  const repositoryRoot = path.dirname(path.resolve(lockPath))
  const installedRoot = `${path.join(repositoryRoot, "node_modules")}${path.sep}`
  for (const [name, installPath] of [
    ["@convax/plugin-api", apiInstallPath],
    ["@convax/plugin-sdk", sdkInstallPath],
  ]) {
    const dependency = frozenLock.dependencies.find((entry) => entry.name === name)
    const [realPath, packageJson] = await Promise.all([
      fs.realpath(installPath),
      readJson(path.join(installPath, "package.json"), `${name} installed package.json`),
    ])
    if (
      !realPath.startsWith(installedRoot) ||
      realPath.includes(`${path.sep}vendor${path.sep}`) ||
      packageJson.name !== name ||
      packageJson.version !== dependency.version
    ) {
      fail(`${name} resolver output is not the exact npm lock identity`)
    }
  }
  await writeExclusive(outputPath, frozenLock)
  return frozenLock
}

function findSelectedPluginRelease(selected, catalogPlan, id, version, tag) {
  const selectedMatches = selected.filter(
    (entry) =>
      entry?.kind === "plugin" &&
      entry.id === id &&
      entry.version === version &&
      entry.releaseTag === tag,
  )
  if (selectedMatches.length !== 1) {
    fail(`selected release does not uniquely identify plugin/${id}@${version}`)
  }
  const releases = catalogPlan?.releases?.filter((entry) => entry?.tag === tag)
  if (!Array.isArray(releases) || releases.length !== 1) {
    fail(`Catalog release plan does not uniquely identify ${tag}`)
  }
  const zipAssets = releases[0].assets.filter(
    (asset) =>
      typeof asset?.name === "string" &&
      asset.name.endsWith(".zip") &&
      asset.path === `releases/${tag}/${asset.name}`,
  )
  if (zipAssets.length !== 1) {
    fail(`${tag} must contain exactly one Plugin ZIP`)
  }
  return { release: releases[0], zip: zipAssets[0] }
}

async function pluginEntrypoints(workspace, workspacePackage) {
  const definitions = [{
    command: "bun tooling/official-marketplace-build.mjs",
    path: "tooling/official-marketplace-build.mjs",
  }]
  const command = workspacePackage.scripts?.build
  if (command !== undefined) {
    if (command !== "bun scripts/build.ts") {
      fail(`${workspace} build command is not an admitted deterministic entrypoint`)
    }
    definitions.push({
      command,
      path: `${workspace}/scripts/build.ts`,
    })
  }
  return Promise.all(definitions.map(async (entrypoint) => ({
    ...entrypoint,
    sha256: sha256(await fs.readFile(path.join(root, entrypoint.path))),
  })))
}

function provenanceAsset(tag, id, version, bytes) {
  const name = `convax-plugin-${id}-${version}.provenance.json`
  return {
    name,
    path: `releases/${tag}/${name}`,
    sha256: sha256(bytes),
    size: bytes.byteLength,
    url: `${releaseBase}/${tag}/${name}`,
  }
}

export async function buildPluginBundleProvenanceFromFiles(input) {
  const [
    frozenLock,
    sdkHostPackageRelease,
    sdkMetadata,
    sdkPackageJson,
    sdkRelease,
    sdkReleaseApiCatalogBytes,
    sdkReleaseApiPackageJson,
    sdkReleaseApiTarballBytes,
    sdkTarballBytes,
    actualApiCatalogBytes,
    actualApiMetadata,
    actualApiPackageJson,
    actualApiRelease,
    actualApiRuntimeConformanceBytes,
    actualApiTarballBytes,
    selected,
    catalogPlan,
  ] = await Promise.all([
    readJson(input.frozen_lock, "frozen lock statement"),
    readJson(input.sdk_host_package_release, "SDK Host package release"),
    readJson(input.sdk_metadata, "SDK npm metadata"),
    readJson(input.sdk_package_json, "SDK package.json"),
    readJson(input.sdk_release, "SDK Host Release identity"),
    fs.readFile(input.sdk_release_api_catalog),
    readJson(input.sdk_release_api_package_json, "release-time API package.json"),
    fs.readFile(input.sdk_release_api_tarball),
    fs.readFile(input.sdk_tarball),
    fs.readFile(input.api_catalog),
    readJson(input.api_metadata, "actual API npm metadata"),
    readJson(input.api_package_json, "actual API package.json"),
    readJson(input.api_release, "actual API Host Release identity"),
    fs.readFile(input.api_runtime_conformance),
    fs.readFile(input.api_tarball),
    readJson(input.selected, "selected release plan"),
    readJson(input.catalog_plan, "Catalog release plan"),
  ])
  if (!Array.isArray(selected) || catalogPlan?.schema !== "convax.release-plan/1") {
    fail("release inputs are not canonical plans")
  }
  const closure = verifyPluginSdkClosure({
    actualApiCatalogBytes,
    actualApiMetadata,
    actualApiPackageJson,
    actualApiRelease,
    actualApiRuntimeConformanceBytes,
    actualApiTarballBytes,
    frozenLock,
    sdkHostPackageRelease,
    sdkMetadata,
    sdkPackageJson,
    sdkRelease,
    sdkReleaseApiCatalogBytes,
    sdkReleaseApiPackageJson,
    sdkReleaseApiTarballBytes,
    sdkTarballBytes,
  })

  const pluginSelections = selected.filter((entry) => entry?.kind === "plugin")
  const statements = []
  for (const selection of pluginSelections) {
    const workspace = `packages/plugins/${selection.id}`
    const [workspacePackage, manifestBytes, manifest] = await Promise.all([
      readJson(path.join(root, workspace, "package.json"), `${workspace}/package.json`),
      fs.readFile(path.join(root, workspace, "package", "manifest.json")),
      readJson(
        path.join(root, workspace, "package", "manifest.json"),
        `${workspace}/package/manifest.json`,
      ),
    ])
    if (
      workspacePackage.version !== selection.version ||
      manifest.id !== selection.id ||
      manifest.version !== selection.version ||
      manifest.schema !== "convax.plugin/8"
    ) {
      fail(`${workspace} identities differ from the selected v8 package`)
    }
    const { release, zip } = findSelectedPluginRelease(
      selected,
      catalogPlan,
      selection.id,
      selection.version,
      selection.releaseTag,
    )
    const zipPath = path.join(path.dirname(input.catalog_plan), zip.path)
    const zipBytes = await fs.readFile(zipPath)
    if (
      zip.size !== zipBytes.byteLength ||
      zip.sha256 !== sha256(zipBytes)
    ) {
      fail(`${selection.releaseTag} ZIP differs from its release plan`)
    }
    const statement = buildPluginBundleProvenance({
      buildEntrypoints: await pluginEntrypoints(workspace, workspacePackage),
      closure,
      commit: input.commit,
      output: {
        path: `catalog/${zip.path}`,
        sha256: zip.sha256,
        size: zip.size,
      },
      packageManifestSha256: sha256(manifestBytes),
      plugin: {
        id: selection.id,
        version: selection.version,
        workspace,
      },
    })
    const bytes = Buffer.from(`${canonicalJson(statement)}\n`)
    const asset = provenanceAsset(
      selection.releaseTag,
      selection.id,
      selection.version,
      bytes,
    )
    if (release.assets.some((candidate) => candidate?.name === asset.name)) {
      fail(`${selection.releaseTag} already contains ${asset.name}`)
    }
    await fs.writeFile(
      path.join(path.dirname(input.catalog_plan), asset.path),
      bytes,
      { flag: "wx" },
    )
    release.assets.push(asset)
    release.assets.sort((left, right) => left.name.localeCompare(right.name, "en"))
    statements.push({
      plugin: {
        id: selection.id,
        version: selection.version,
      },
      path: `catalog/${asset.path}`,
      sha256: asset.sha256,
    })
  }

  await fs.writeFile(
    input.catalog_plan,
    `${JSON.stringify(catalogPlan, null, 2)}\n`,
  )
  const index = {
    schema: "convax.plugin-bundle-provenance-index/1",
    sourceCommit: input.commit,
    frozenLockSha256: closure.frozenLock.lockfile.sha256,
    statements,
  }
  await writeExclusive(input.output, index)
  return index
}

async function main() {
  const [command, ...argv] = process.argv.slice(2)
  if (command === "inspect-lock") {
    const args = parseArguments(
      argv,
      new Set([
        "--api-install",
        "--bunfig",
        "--lock",
        "--output",
        "--package",
        "--sdk-install",
      ]),
    )
    await inspectFrozenLockFromFiles({
      apiInstallPath: args.api_install,
      bunfigPath: args.bunfig,
      lockPath: args.lock,
      outputPath: args.output,
      packagePath: args.package,
      sdkInstallPath: args.sdk_install,
    })
    return
  }
  if (command === "build") {
    const supported = new Set([
      "--api-catalog",
      "--api-metadata",
      "--api-package-json",
      "--api-release",
      "--api-runtime-conformance",
      "--api-tarball",
      "--catalog-plan",
      "--commit",
      "--frozen-lock",
      "--output",
      "--sdk-host-package-release",
      "--sdk-metadata",
      "--sdk-package-json",
      "--sdk-release",
      "--sdk-release-api-catalog",
      "--sdk-release-api-package-json",
      "--sdk-release-api-tarball",
      "--sdk-tarball",
      "--selected",
    ])
    await buildPluginBundleProvenanceFromFiles(parseArguments(argv, supported))
    return
  }
  fail("expected inspect-lock or build")
}

if (import.meta.main) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
