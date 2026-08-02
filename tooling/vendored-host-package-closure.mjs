import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

import { readJson, readJsonc, root } from "./lib.mjs"

const PACKAGE_SPECS = [
  {
    directory: "marketplace",
    name: "@convax/marketplace",
    version: "0.2.1",
    dependencies: { ajv: "8.20.0" },
  },
  {
    directory: "marketplace-kit",
    name: "@convax/marketplace-kit",
    version: "0.2.2",
    dependencies: {
      "@convax/marketplace": "workspace:*",
      "@convax/plugin-api": "workspace:*",
      "@convax/plugin-sdk": "workspace:*",
    },
  },
  {
    directory: "plugin-api",
    name: "@convax/plugin-api",
    version: "2.0.0",
    dependencies: {},
  },
  {
    directory: "plugin-sdk",
    name: "@convax/plugin-sdk",
    version: "0.1.1",
    dependencies: { "@convax/plugin-api": "workspace:*" },
  },
  {
    directory: "plugin-ui",
    name: "@convax/plugin-ui",
    version: "0.1.0",
    dependencies: {},
  },
]

const MAX_PACKAGE_BYTES = 32 * 1024 * 1024
const MAX_PACKAGE_FILES = 2_048

function fail(message) {
  throw new Error(`Vendored Host package closure: ${message}`)
}

function canonicalJson(value) {
  if (Array.isArray(value)) return JSON.stringify(value)
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value ?? {}).sort(([left], [right]) =>
        compareUtf8(left, right),
      ),
    ),
  )
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))
}

function updateLength(hash, value) {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(value))
  hash.update(buffer)
}

async function inventoryPackage(packageRoot) {
  const files = []

  async function walk(directory, relativeDirectory = "") {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => compareUtf8(left.name, right.name))
    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name
      if (relativePath === "node_modules") continue
      if (relativePath.split("/").includes("node_modules")) {
        fail(`${packageRoot}/${relativePath} contains nested node_modules`)
      }
      const absolutePath = path.join(directory, entry.name)
      const stat = await fs.lstat(absolutePath)
      if (stat.isSymbolicLink()) {
        fail(`${packageRoot}/${relativePath} must not be a symbolic link`)
      }
      if (stat.isDirectory()) {
        await walk(absolutePath, relativePath)
        continue
      }
      if (!stat.isFile()) {
        fail(`${packageRoot}/${relativePath} must be a regular file`)
      }
      const bytes = await fs.readFile(absolutePath)
      files.push({ bytes, path: relativePath })
      if (files.length > MAX_PACKAGE_FILES) {
        fail(`${packageRoot} exceeds ${MAX_PACKAGE_FILES} files`)
      }
    }
  }

  await walk(packageRoot)
  if (files.length === 0) fail(`${packageRoot} must not be empty`)

  const totalBytes = files.reduce((sum, file) => sum + file.bytes.length, 0)
  if (totalBytes > MAX_PACKAGE_BYTES) {
    fail(`${packageRoot} exceeds ${MAX_PACKAGE_BYTES} bytes`)
  }
  const hash = createHash("sha256")
  for (const file of files) {
    const pathBytes = Buffer.from(file.path, "utf8")
    updateLength(hash, pathBytes.length)
    hash.update(pathBytes)
    updateLength(hash, file.bytes.length)
    hash.update(file.bytes)
  }
  return {
    bytes: totalBytes,
    files: files.length,
    sha256: hash.digest("hex"),
  }
}

async function requireRealpath(actualPath, expectedPath, label) {
  const [actual, expected] = await Promise.all([
    fs.realpath(actualPath),
    fs.realpath(expectedPath),
  ])
  if (actual !== expected) {
    fail(`${label} resolves to ${actual}, expected ${expected}`)
  }
}

function requireExactObject(actual, expected, label) {
  if (canonicalJson(actual ?? {}) !== canonicalJson(expected)) {
    fail(`${label} does not match the admitted workspace closure`)
  }
}

export async function createVendoredHostPackageClosure(
  workspaceRoot,
  { commit },
) {
  if (!/^[a-f0-9]{40}$/u.test(commit)) {
    fail("commit must be one lowercase 40-character Git SHA")
  }
  const resolvedRoot = await fs.realpath(workspaceRoot)
  const [rootPackage, lock, lockBytes] = await Promise.all([
    readJson(path.join(resolvedRoot, "package.json")),
    readJsonc(path.join(resolvedRoot, "bun.lock")),
    fs.readFile(path.join(resolvedRoot, "bun.lock")),
  ])
  if (!rootPackage.workspaces?.includes("vendor/host-packages/*")) {
    fail("root package must admit vendor/host-packages/*")
  }
  requireExactObject(
    {
      "@convax/marketplace-kit":
        rootPackage.devDependencies?.["@convax/marketplace-kit"],
      "@convax/plugin-api": rootPackage.devDependencies?.["@convax/plugin-api"],
      "@convax/plugin-sdk": rootPackage.devDependencies?.["@convax/plugin-sdk"],
      "@convax/plugin-ui": rootPackage.devDependencies?.["@convax/plugin-ui"],
    },
    {
      "@convax/marketplace-kit": "workspace:*",
      "@convax/plugin-api": "workspace:*",
      "@convax/plugin-sdk": "workspace:*",
      "@convax/plugin-ui": "workspace:*",
    },
    "root Host package dependencies",
  )
  if (lock.lockfileVersion !== 1) fail("bun.lock must use lockfileVersion 1")

  const packages = []
  for (const spec of PACKAGE_SPECS) {
    const workspace = `vendor/host-packages/${spec.directory}`
    const packageRoot = path.join(resolvedRoot, workspace)
    const manifest = await readJson(path.join(packageRoot, "package.json"))
    if (manifest.name !== spec.name || manifest.version !== spec.version) {
      fail(`${workspace} must be ${spec.name}@${spec.version}`)
    }
    if (manifest.scripts !== undefined || manifest.devDependencies !== undefined) {
      fail(`${workspace} must contain inert release bytes only`)
    }
    requireExactObject(
      manifest.dependencies,
      spec.dependencies,
      `${workspace} dependencies`,
    )
    const lockWorkspace = lock.workspaces?.[workspace]
    if (
      lockWorkspace?.name !== spec.name ||
      lockWorkspace?.version !== spec.version
    ) {
      fail(`bun.lock workspace ${workspace} must be ${spec.name}@${spec.version}`)
    }
    requireExactObject(
      lockWorkspace.dependencies,
      spec.dependencies,
      `bun.lock ${workspace} dependencies`,
    )
    const expectedResolution = `${spec.name}@workspace:${workspace}`
    const lockResolution = lock.packages?.[spec.name]
    if (
      !Array.isArray(lockResolution) ||
      lockResolution.length !== 1 ||
      lockResolution[0] !== expectedResolution
    ) {
      fail(`bun.lock must resolve ${spec.name} only to ${workspace}`)
    }
    packages.push({
      name: spec.name,
      version: spec.version,
      workspace,
      ...(await inventoryPackage(packageRoot)),
    })
  }

  const vendorRoot = path.join(resolvedRoot, "vendor", "host-packages")
  const vendorDirectories = (await fs.readdir(vendorRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareUtf8)
  const expectedDirectories = PACKAGE_SPECS.map((spec) => spec.directory).sort(
    compareUtf8,
  )
  if (canonicalJson(vendorDirectories) !== canonicalJson(expectedDirectories)) {
    fail("vendor/host-packages contains an unadmitted package directory")
  }

  const bindings = [
    ["node_modules/@convax/marketplace-kit", "marketplace-kit"],
    ["node_modules/@convax/plugin-api", "plugin-api"],
    ["node_modules/@convax/plugin-sdk", "plugin-sdk"],
    ["node_modules/@convax/plugin-ui", "plugin-ui"],
    [
      "vendor/host-packages/marketplace-kit/node_modules/@convax/marketplace",
      "marketplace",
    ],
    [
      "vendor/host-packages/marketplace-kit/node_modules/@convax/plugin-api",
      "plugin-api",
    ],
    [
      "vendor/host-packages/marketplace-kit/node_modules/@convax/plugin-sdk",
      "plugin-sdk",
    ],
    [
      "vendor/host-packages/plugin-sdk/node_modules/@convax/plugin-api",
      "plugin-api",
    ],
  ]
  for (const [installedPath, directory] of bindings) {
    await requireRealpath(
      path.join(resolvedRoot, installedPath),
      path.join(vendorRoot, directory),
      installedPath,
    )
  }

  const catalogPath =
    "vendor/host-packages/plugin-api/dist/generated/plugin-api.json"
  const catalogBytes = await fs.readFile(path.join(resolvedRoot, catalogPath))
  const catalog = JSON.parse(catalogBytes.toString("utf8"))
  if (
    catalog.schema !== "convax.plugin-api-catalog/3" ||
    catalog.version !== "2.0.0"
  ) {
    fail("vendored Plugin API Catalog must be contract v3 at API version 2.0.0")
  }

  return {
    schema: "convax.vendored-host-package-closure/1",
    source: {
      commit,
      kind: "workspace",
      repository: "microvoid/convax-plugins",
    },
    lockfile: {
      path: "bun.lock",
      sha256: sha256(lockBytes),
    },
    catalog: {
      path: catalogPath,
      schema: catalog.schema,
      sha256: sha256(catalogBytes),
      version: catalog.version,
    },
    packages,
  }
}

function parseArgs(args) {
  const values = {}
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!["--commit", "--output", "--workspace"].includes(flag) || !value) {
      fail("--commit <sha> --output <path> [--workspace <root>] is required")
    }
    values[flag] = value
  }
  if (!values["--commit"] || !values["--output"]) {
    fail("--commit <sha> --output <path> [--workspace <root>] is required")
  }
  return values
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const workspaceRoot = path.resolve(args["--workspace"] ?? root)
  const outputPath = path.resolve(workspaceRoot, args["--output"])
  const closure = await createVendoredHostPackageClosure(workspaceRoot, {
    commit: args["--commit"],
  })
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(closure, null, 2)}\n`, {
    flag: "wx",
  })
  process.stdout.write(
    `Verified vendored Host package closure: ${closure.packages
      .map((item) => `${item.name}@${item.version}`)
      .join(", ")}\n`,
  )
}

if (import.meta.main) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
