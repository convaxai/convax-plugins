import { createHash } from "node:crypto"

import {
  parsePluginApiRuntimeConformance,
  pluginApiCatalogContractCoverage,
} from "./plugin-api-runtime-conformance.mjs"

export const hostPackageReleaseSchema = "convax.host-package-release/1"
export const pluginSdkReleaseProfile =
  "convax.plugin-sdk-authoring-package/1"
export const pluginBundleProvenanceSchema =
  "convax.plugin-bundle-provenance/1"

const hostRepository = "microvoid/convax"
const pluginRepository = "microvoid/convax-plugins"
const npmRegistry = "https://registry.npmjs.org"
const pluginSdkName = "@convax/plugin-sdk"
const pluginApiName = "@convax/plugin-api"
const catalogSchema = "convax.plugin-api-catalog/3"
const stableVersion = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u
const commitPattern = /^[a-f0-9]{40}$/u
const sha256Pattern = /^[a-f0-9]{64}$/u
const integrityPattern = /^sha512-[A-Za-z0-9+/]+={0,2}$/u
const positiveInteger = /^[1-9][0-9]*$/u
const sdkWorkflowRef =
  "microvoid/convax/.github/workflows/plugin-sdk-release.yml@refs/heads/convax-next"
const apiWorkflowRef =
  "microvoid/convax/.github/workflows/plugin-api-release.yml@refs/heads/convax-next"

const sdkChecks = [
  ["plugin-api-release-dependency-build", "bun --cwd packages/plugin-api build"],
  ["plugin-sdk-typecheck", "bun --cwd packages/plugin-sdk typecheck"],
  ["plugin-sdk-test", "bun --cwd packages/plugin-sdk test"],
  ["plugin-sdk-pack-check", "bun --cwd packages/plugin-sdk pack:check"],
  ["package-boundaries", "bun run package:boundaries"],
  [
    "release-evidence-policy",
    "bun test scripts/plugin-sdk-release-evidence.test.ts scripts/plugin-sdk-release-workflows.test.ts",
  ],
]

function fail(message) {
  throw new Error(`Plugin SDK provenance: ${message}`)
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function exactKeys(value, expected, label) {
  if (!isRecord(value)) fail(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const required = [...expected].sort()
  if (
    actual.length !== required.length ||
    actual.some((key, index) => key !== required[index])
  ) {
    fail(`${label} keys must be exactly ${required.join(", ")}`)
  }
}

function exactArray(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) {
    fail(`${label} must contain exactly ${length} items`)
  }
}

function cleanString(value, label, maximum = 512) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail(`${label} must be one bounded trimmed string`)
  }
  return value
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

function sha512Integrity(bytes) {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) fail("canonical JSON cannot encode undefined")
  return encoded
}

function decodeJsonString(source, start, label) {
  let index = start + 1
  while (index < source.length) {
    const character = source[index]
    if (character === '"') {
      const token = source.slice(start, index + 1)
      let value
      try {
        value = JSON.parse(token)
      } catch {
        fail(`${label} contains an invalid JSON string`)
      }
      return { index: index + 1, value }
    }
    if (character === "\\") index += 1
    index += 1
  }
  fail(`${label} contains an unterminated JSON string`)
}

function skipJsonWhitespace(source, start) {
  let index = start
  while (/[\t\n\r ]/u.test(source[index] ?? "")) index += 1
  return index
}

function parseStrictJsonValue(source, start, label) {
  let index = skipJsonWhitespace(source, start)
  const character = source[index]
  if (character === '"') {
    return decodeJsonString(source, index, label)
  }
  if (character === "{") {
    const value = {}
    const seen = new Set()
    index = skipJsonWhitespace(source, index + 1)
    if (source[index] === "}") return { index: index + 1, value }
    while (index < source.length) {
      if (source[index] !== '"') fail(`${label} object key must be a JSON string`)
      const key = decodeJsonString(source, index, label)
      if (seen.has(key.value)) fail(`${label} contains duplicate field ${key.value}`)
      seen.add(key.value)
      index = skipJsonWhitespace(source, key.index)
      if (source[index] !== ":") fail(`${label} object field is missing ':'`)
      const parsed = parseStrictJsonValue(source, index + 1, label)
      value[key.value] = parsed.value
      index = skipJsonWhitespace(source, parsed.index)
      if (source[index] === "}") return { index: index + 1, value }
      if (source[index] !== ",") fail(`${label} object is missing ','`)
      index = skipJsonWhitespace(source, index + 1)
    }
    fail(`${label} contains an unterminated object`)
  }
  if (character === "[") {
    const value = []
    index = skipJsonWhitespace(source, index + 1)
    if (source[index] === "]") return { index: index + 1, value }
    while (index < source.length) {
      const parsed = parseStrictJsonValue(source, index, label)
      value.push(parsed.value)
      index = skipJsonWhitespace(source, parsed.index)
      if (source[index] === "]") return { index: index + 1, value }
      if (source[index] !== ",") fail(`${label} array is missing ','`)
      index = skipJsonWhitespace(source, index + 1)
    }
    fail(`${label} contains an unterminated array`)
  }
  const remainder = source.slice(index)
  const match =
    /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/u.exec(
      remainder,
    )
  if (!match) fail(`${label} contains an invalid JSON value`)
  return { index: index + match[0].length, value: JSON.parse(match[0]) }
}

export function parseStrictJson(bytes, label = "JSON") {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    fail(`${label} must contain bytes`)
  }
  let source
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    fail(`${label} must be valid UTF-8`)
  }
  const parsed = parseStrictJsonValue(source, 0, label)
  if (skipJsonWhitespace(source, parsed.index) !== source.length) {
    fail(`${label} contains trailing data`)
  }
  return parsed.value
}

function parseVersion(value, label) {
  if (typeof value !== "string" || !stableVersion.test(value)) {
    fail(`${label} must be one stable SemVer`)
  }
  return value
}

function versionTuple(value) {
  return value.split(".").map(Number)
}

function compareVersions(left, right) {
  const leftParts = versionTuple(left)
  const rightParts = versionTuple(right)
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1
    }
  }
  return 0
}

export function satisfiesCaret(version, range) {
  if (
    typeof range !== "string" ||
    !range.startsWith("^") ||
    !stableVersion.test(range.slice(1)) ||
    !stableVersion.test(version)
  ) {
    return false
  }
  const minimum = range.slice(1)
  const [major, minor, patch] = versionTuple(minimum)
  const maximum =
    major > 0
      ? `${major + 1}.0.0`
      : minor > 0
        ? `0.${minor + 1}.0`
        : `0.0.${patch + 1}`
  return compareVersions(version, minimum) >= 0 &&
    compareVersions(version, maximum) < 0
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !sha256Pattern.test(value)) {
    fail(`${label} must be one lowercase SHA-256`)
  }
}

function assertIntegrity(value, label) {
  if (typeof value !== "string" || !integrityPattern.test(value)) {
    fail(`${label} must be one npm SHA-512 SRI`)
  }
}

function parseCatalog(bytes, expectedVersion, label) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 16 * 1024 * 1024) {
    fail(`${label} is outside the admitted size`)
  }
  const catalog = parseStrictJson(bytes, label)
  if (
    !isRecord(catalog) ||
    catalog.schema !== catalogSchema ||
    catalog.version !== expectedVersion
  ) {
    fail(`${label} schema/version does not match ${pluginApiName}@${expectedVersion}`)
  }
  return catalog
}

function expectedTarballUrl(name, version) {
  const basename = name.slice(name.indexOf("/") + 1)
  return `${npmRegistry}/${name}/-/${basename}-${version}.tgz`
}

function parseNpmMetadata(value, name, version, label) {
  if (!isRecord(value) || !isRecord(value.dist)) {
    fail(`${label} must contain npm dist metadata`)
  }
  if (value.name !== undefined && value.name !== name) {
    fail(`${label} package name does not match ${name}`)
  }
  if (value.version !== undefined && value.version !== version) {
    fail(`${label} version does not match ${version}`)
  }
  const url = value.dist.tarball
  const integrity = value.dist.integrity
  if (url !== expectedTarballUrl(name, version)) {
    fail(`${label} tarball URL is outside the exact admitted npm registry path`)
  }
  assertIntegrity(integrity, `${label} integrity`)
  return { integrity, url }
}

function parseLockedPackage(lock, name) {
  if (!isRecord(lock) || lock.lockfileVersion !== 1 || !isRecord(lock.packages)) {
    fail("bun.lock must be one supported frozen Bun lockfile")
  }
  const entry = lock.packages[name]
  if (!Array.isArray(entry) || entry.length !== 4) {
    fail(`bun.lock must contain one registry tuple for ${name}`)
  }
  const [identity, source, metadata, integrity] = entry
  if (
    typeof identity !== "string" ||
    !identity.startsWith(`${name}@`) ||
    identity.includes("workspace:") ||
    identity.includes("file:") ||
    identity.includes("git") ||
    source !== "" ||
    !isRecord(metadata)
  ) {
    fail(`${name} must resolve from npm, never Git/file/workspace`)
  }
  const version = parseVersion(identity.slice(`${name}@`.length), `${name} lock version`)
  assertIntegrity(integrity, `${name} lock integrity`)
  return { integrity, metadata, name, version }
}

function assertRootLockDeclaration(rootPackage, lock, dependency) {
  if (
    !isRecord(rootPackage) ||
    !isRecord(rootPackage.devDependencies) ||
    rootPackage.devDependencies[dependency.name] !== dependency.version
  ) {
    fail(`root package must pin ${dependency.name}@${dependency.version} exactly`)
  }
  const rootWorkspace = lock.workspaces?.[""]
  if (
    !isRecord(rootWorkspace) ||
    !isRecord(rootWorkspace.devDependencies) ||
    rootWorkspace.devDependencies[dependency.name] !== dependency.version
  ) {
    fail(`bun.lock root workspace must pin ${dependency.name}@${dependency.version} exactly`)
  }
}

export function inspectFrozenPluginSdkLock({
  bunfigBytes,
  lock,
  lockBytes,
  rootPackage,
}) {
  if (
    new TextDecoder().decode(bunfigBytes) !==
    `[install]\nregistry = "${npmRegistry}"\n`
  ) {
    fail("bunfig.toml must admit only the official npm registry")
  }
  const sdk = parseLockedPackage(lock, pluginSdkName)
  const api = parseLockedPackage(lock, pluginApiName)
  const shadowingWorkspaces = Object.entries(lock.workspaces ?? {})
    .filter(([, workspace]) =>
      workspace?.name === pluginSdkName || workspace?.name === pluginApiName)
    .map(([workspace]) => workspace)
  if (shadowingWorkspaces.length > 0) {
    fail(
      `SDK/API npm packages must not be shadowed by workspaces: ${shadowingWorkspaces.join(", ")}`,
    )
  }
  assertRootLockDeclaration(rootPackage, lock, sdk)
  assertRootLockDeclaration(rootPackage, lock, api)
  const declaredRange = sdk.metadata.dependencies?.[pluginApiName]
  if (
    typeof declaredRange !== "string" ||
    !satisfiesCaret(api.version, declaredRange)
  ) {
    fail("actual locked Plugin API does not satisfy the SDK lock dependency range")
  }
  return {
    schema: "convax.plugin-sdk-frozen-lock/1",
    registry: npmRegistry,
    lockfile: {
      path: "bun.lock",
      sha256: sha256(lockBytes),
    },
    dependencies: [
      {
        name: pluginApiName,
        version: api.version,
        tarballIntegrity: api.integrity,
      },
      {
        name: pluginSdkName,
        version: sdk.version,
        tarballIntegrity: sdk.integrity,
      },
    ],
  }
}

export function parseHostPackageRelease(value, expected) {
  exactKeys(
    value,
    ["checks", "dependencies", "host", "package", "profile", "schema", "workflow"],
    "Host package release",
  )
  if (
    value.schema !== hostPackageReleaseSchema ||
    value.profile !== pluginSdkReleaseProfile
  ) {
    fail("Host package release schema/profile is not the SDK authoring release")
  }
  exactKeys(value.host, ["commit", "repository"], "Host package release host")
  if (
    value.host.repository !== hostRepository ||
    value.host.repository !== expected.repository ||
    !commitPattern.test(value.host.commit) ||
    value.host.commit !== expected.commit
  ) {
    fail("Host package release repository/commit does not match its immutable Release")
  }
  exactKeys(
    value.workflow,
    ["ref", "runAttempt", "runId"],
    "Host package release workflow",
  )
  if (
    value.workflow.ref !== sdkWorkflowRef ||
    value.workflow.ref !== expected.workflowRef ||
    typeof value.workflow.runId !== "string" ||
    !positiveInteger.test(value.workflow.runId) ||
    typeof value.workflow.runAttempt !== "string" ||
    !positiveInteger.test(value.workflow.runAttempt)
  ) {
    fail("Host package release workflow is not the protected final release workflow")
  }
  exactKeys(
    value.package,
    ["name", "tarballIntegrity", "tarballSha256", "version"],
    "Host package release package",
  )
  const sdkVersion = parseVersion(value.package.version, "Host package SDK version")
  if (value.package.name !== pluginSdkName || sdkVersion !== expected.version) {
    fail("Host package release SDK identity does not match the locked package")
  }
  assertDigest(value.package.tarballSha256, "Host package SDK tarball digest")
  assertIntegrity(value.package.tarballIntegrity, "Host package SDK tarball integrity")
  exactArray(value.dependencies, 1, "Host package release dependencies")
  const api = value.dependencies[0]
  exactKeys(
    api,
    [
      "catalogSchema",
      "catalogSha256",
      "catalogVersion",
      "declaredRange",
      "name",
      "resolvedVersion",
      "tarballIntegrity",
      "tarballSha256",
    ],
    "Host package release Plugin API dependency",
  )
  if (
    api.name !== pluginApiName ||
    api.catalogSchema !== catalogSchema ||
    api.catalogVersion !== api.resolvedVersion ||
    api.declaredRange !== `^${api.resolvedVersion}`
  ) {
    fail("Host package release Plugin API dependency identity is inconsistent")
  }
  parseVersion(api.resolvedVersion, "Host package release Plugin API version")
  assertDigest(api.tarballSha256, "Host package release Plugin API tarball digest")
  assertIntegrity(api.tarballIntegrity, "Host package release Plugin API integrity")
  assertDigest(api.catalogSha256, "Host package release Catalog digest")
  exactArray(value.checks, sdkChecks.length, "Host package release checks")
  value.checks.forEach((check, index) => {
    exactKeys(check, ["command", "id", "status"], `Host package release check ${index}`)
    const [id, command] = sdkChecks[index]
    if (check.id !== id || check.command !== command || check.status !== "passed") {
      fail(`Host package release check ${index} is not the exact passed profile`)
    }
  })
  const expectedTag = `plugin-sdk-v${sdkVersion}-${value.host.commit}`
  if (expected.tag !== expectedTag) {
    fail("Host package release tag does not bind SDK version and Host commit")
  }
  return value
}

function verifyTarball(bytes, expectedSha256, expectedIntegrity, label) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > 32 * 1024 * 1024
  ) {
    fail(`${label} size is outside the admitted bound`)
  }
  if (
    sha256(bytes) !== expectedSha256 ||
    sha512Integrity(bytes) !== expectedIntegrity
  ) {
    fail(`${label} bytes do not match SHA-256 and npm SRI`)
  }
}

function parseFrozenLockStatement(frozenLock, complete = false) {
  exactKeys(
    frozenLock,
    ["dependencies", "lockfile", "registry", "schema"],
    "frozen lock statement",
  )
  if (
    frozenLock.schema !== "convax.plugin-sdk-frozen-lock/1" ||
    frozenLock.registry !== npmRegistry
  ) {
    fail("frozen lock statement schema/registry is invalid")
  }
  exactKeys(frozenLock.lockfile, ["path", "sha256"], "frozen lock identity")
  if (frozenLock.lockfile.path !== "bun.lock") {
    fail("frozen lock must identify the repository root bun.lock")
  }
  assertDigest(frozenLock.lockfile.sha256, "frozen lock digest")
  exactArray(frozenLock.dependencies, 2, "frozen lock dependencies")
  const [lockedApi, lockedSdk] = frozenLock.dependencies
  for (const [dependency, name] of [
    [lockedApi, pluginApiName],
    [lockedSdk, pluginSdkName],
  ]) {
    exactKeys(
      dependency,
      complete
        ? [
            "name",
            "registryUrl",
            "tarballIntegrity",
            "tarballSha256",
            "version",
          ]
        : ["name", "tarballIntegrity", "version"],
      `frozen lock ${name}`,
    )
    if (dependency.name !== name) fail(`frozen lock dependency order must be ${pluginApiName}, ${pluginSdkName}`)
    parseVersion(dependency.version, `${name} frozen version`)
    assertIntegrity(dependency.tarballIntegrity, `${name} frozen integrity`)
    if (complete) {
      if (
        dependency.registryUrl !==
        expectedTarballUrl(dependency.name, dependency.version)
      ) {
        fail(`${name} frozen registry URL is not the exact npm tarball`)
      }
      assertDigest(dependency.tarballSha256, `${name} frozen tarball digest`)
    }
  }
  return { lockedApi, lockedSdk }
}

function parseHostReleaseProjection(hostReleases) {
  exactKeys(
    hostReleases,
    ["pluginApi", "pluginSdk"],
    "Plugin bundle Host releases",
  )
  exactKeys(
    hostReleases.pluginApi,
    [
      "catalogSchema",
      "catalogSha256",
      "commit",
      "repository",
      "runAttempt",
      "runId",
      "tag",
      "workflowRef",
    ],
    "Plugin bundle Plugin API Host release",
  )
  exactKeys(
    hostReleases.pluginSdk,
    [
      "commit",
      "declaredApiRange",
      "releaseTimeApiVersion",
      "repository",
      "runAttempt",
      "runId",
      "tag",
      "workflowRef",
    ],
    "Plugin bundle Plugin SDK Host release",
  )
  const api = hostReleases.pluginApi
  const sdk = hostReleases.pluginSdk
  if (
    api.repository !== hostRepository ||
    sdk.repository !== hostRepository ||
    api.workflowRef !== apiWorkflowRef ||
    sdk.workflowRef !== sdkWorkflowRef ||
    !commitPattern.test(api.commit) ||
    !commitPattern.test(sdk.commit) ||
    api.catalogSchema !== catalogSchema ||
    !positiveInteger.test(api.runId) ||
    !positiveInteger.test(api.runAttempt) ||
    !positiveInteger.test(sdk.runId) ||
    !positiveInteger.test(sdk.runAttempt)
  ) {
    fail("Plugin bundle Host release projections are invalid")
  }
  assertDigest(api.catalogSha256, "Plugin bundle Plugin API Catalog digest")
  const apiVersion = api.tag.match(
    /^plugin-api-v((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))-[a-f0-9]{40}$/u,
  )?.[1]
  const sdkVersion = sdk.tag.match(
    /^plugin-sdk-v((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))-[a-f0-9]{40}$/u,
  )?.[1]
  if (
    !apiVersion ||
    !sdkVersion ||
    api.tag !== `plugin-api-v${apiVersion}-${api.commit}` ||
    sdk.tag !== `plugin-sdk-v${sdkVersion}-${sdk.commit}` ||
    !satisfiesCaret(apiVersion, sdk.declaredApiRange)
  ) {
    fail("Plugin bundle Host release tags/range are inconsistent")
  }
  parseVersion(sdk.releaseTimeApiVersion, "Plugin SDK release-time API version")
  return { apiVersion, sdkVersion }
}

export function verifyPluginSdkClosure({
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
}) {
  const { lockedApi, lockedSdk } = parseFrozenLockStatement(frozenLock)

  exactKeys(
    sdkRelease,
    ["commit", "repository", "tag", "workflowRef"],
    "SDK Host Release identity",
  )
  const hostManifest = parseHostPackageRelease(sdkHostPackageRelease, {
    ...sdkRelease,
    version: lockedSdk.version,
  })
  const sdkNpm = parseNpmMetadata(
    sdkMetadata,
    pluginSdkName,
    lockedSdk.version,
    "Plugin SDK npm metadata",
  )
  if (
    sdkNpm.integrity !== lockedSdk.tarballIntegrity ||
    hostManifest.package.tarballIntegrity !== lockedSdk.tarballIntegrity
  ) {
    fail("Plugin SDK lock, npm and Host Release SRI differ")
  }
  verifyTarball(
    sdkTarballBytes,
    hostManifest.package.tarballSha256,
    lockedSdk.tarballIntegrity,
    "Plugin SDK tarball",
  )
  if (
    !isRecord(sdkPackageJson) ||
    sdkPackageJson.name !== pluginSdkName ||
    sdkPackageJson.version !== lockedSdk.version ||
    !isRecord(sdkPackageJson.dependencies) ||
    Object.keys(sdkPackageJson.dependencies).length !== 1 ||
    sdkPackageJson.dependencies[pluginApiName] !==
      hostManifest.dependencies[0].declaredRange
  ) {
    fail("Plugin SDK tarball package identity/dependency differs from Host evidence")
  }

  const releaseApi = hostManifest.dependencies[0]
  verifyTarball(
    sdkReleaseApiTarballBytes,
    releaseApi.tarballSha256,
    releaseApi.tarballIntegrity,
    "release-time Plugin API tarball",
  )
  if (
    !isRecord(sdkReleaseApiPackageJson) ||
    sdkReleaseApiPackageJson.name !== pluginApiName ||
    sdkReleaseApiPackageJson.version !== releaseApi.resolvedVersion
  ) {
    fail("release-time Plugin API package identity differs from Host evidence")
  }
  parseCatalog(
    sdkReleaseApiCatalogBytes,
    releaseApi.resolvedVersion,
    "release-time Plugin API Catalog",
  )
  if (sha256(sdkReleaseApiCatalogBytes) !== releaseApi.catalogSha256) {
    fail("release-time Plugin API Catalog digest differs from Host evidence")
  }

  exactKeys(
    actualApiRelease,
    ["commit", "repository", "tag", "workflowRef"],
    "actual Plugin API Host Release identity",
  )
  if (
    actualApiRelease.repository !== hostRepository ||
    actualApiRelease.workflowRef !== apiWorkflowRef ||
    !commitPattern.test(actualApiRelease.commit) ||
    actualApiRelease.tag !==
      `plugin-api-v${lockedApi.version}-${actualApiRelease.commit}`
  ) {
    fail("actual Plugin API Release identity is not exact")
  }
  const apiNpm = parseNpmMetadata(
    actualApiMetadata,
    pluginApiName,
    lockedApi.version,
    "Plugin API npm metadata",
  )
  if (apiNpm.integrity !== lockedApi.tarballIntegrity) {
    fail("Plugin API lock and npm SRI differ")
  }
  const actualApiTarballSha256 = sha256(actualApiTarballBytes)
  verifyTarball(
    actualApiTarballBytes,
    actualApiTarballSha256,
    lockedApi.tarballIntegrity,
    "actual Plugin API tarball",
  )
  if (
    !isRecord(actualApiPackageJson) ||
    actualApiPackageJson.name !== pluginApiName ||
    actualApiPackageJson.version !== lockedApi.version
  ) {
    fail("actual Plugin API tarball package identity differs from the lock")
  }
  const actualApiCatalog = parseCatalog(
    actualApiCatalogBytes,
    lockedApi.version,
    "actual Plugin API Catalog",
  )
  const actualCatalogSha256 = sha256(actualApiCatalogBytes)
  const apiConformance = parsePluginApiRuntimeConformance(
    actualApiRuntimeConformanceBytes,
    {
      repository: actualApiRelease.repository,
      commit: actualApiRelease.commit,
      version: lockedApi.version,
      catalogSha256: actualCatalogSha256,
      tarballSha256: actualApiTarballSha256,
      tarballIntegrity: lockedApi.tarballIntegrity,
      contractCoverage: pluginApiCatalogContractCoverage(actualApiCatalog),
    },
  )
  if (!satisfiesCaret(lockedApi.version, sdkPackageJson.dependencies[pluginApiName])) {
    fail("actual locked Plugin API does not satisfy the SDK tarball range")
  }

  return {
    frozenLock: {
      ...frozenLock,
      dependencies: [
        {
          ...lockedApi,
          registryUrl: apiNpm.url,
          tarballSha256: actualApiTarballSha256,
        },
        {
          ...lockedSdk,
          registryUrl: sdkNpm.url,
          tarballSha256: hostManifest.package.tarballSha256,
        },
      ],
    },
    hostReleases: {
      pluginApi: {
        ...actualApiRelease,
        runAttempt: String(apiConformance.workflow.runAttempt),
        runId: String(apiConformance.workflow.runId),
        catalogSchema,
        catalogSha256: actualCatalogSha256,
      },
      pluginSdk: {
        ...sdkRelease,
        runAttempt: String(hostManifest.workflow.runAttempt),
        runId: String(hostManifest.workflow.runId),
        declaredApiRange: hostManifest.dependencies[0].declaredRange,
        releaseTimeApiVersion: hostManifest.dependencies[0].resolvedVersion,
      },
    },
  }
}

function parseEntrypoints(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    fail("build entrypoints must contain one or two exact source identities")
  }
  const paths = new Set()
  return value.map((entrypoint, index) => {
    exactKeys(
      entrypoint,
      ["command", "path", "sha256"],
      `build entrypoint ${index}`,
    )
    cleanString(entrypoint.command, `build entrypoint ${index} command`)
    cleanString(entrypoint.path, `build entrypoint ${index} path`)
    if (entrypoint.path.startsWith("/") || entrypoint.path.includes("..")) {
      fail(`build entrypoint ${index} path must be repository-relative`)
    }
    assertDigest(entrypoint.sha256, `build entrypoint ${index} digest`)
    if (paths.has(entrypoint.path)) fail(`duplicate build entrypoint ${entrypoint.path}`)
    paths.add(entrypoint.path)
    return entrypoint
  })
}

export function buildPluginBundleProvenance({
  buildEntrypoints,
  closure,
  commit,
  output,
  packageManifestSha256,
  plugin,
}) {
  if (!commitPattern.test(commit)) fail("Plugin source commit must be one full SHA")
  exactKeys(plugin, ["id", "version", "workspace"], "Plugin source identity")
  cleanString(plugin.id, "Plugin id", 128)
  parseVersion(plugin.version, "Plugin version")
  if (plugin.workspace !== `packages/plugins/${plugin.id}`) {
    fail("Plugin workspace must match its portable id")
  }
  assertDigest(packageManifestSha256, "Plugin package-manifest digest")
  const entrypoints = parseEntrypoints(buildEntrypoints)
  parseFrozenLockStatement(closure.frozenLock, true)
  parseHostReleaseProjection(closure.hostReleases)
  exactKeys(output, ["path", "sha256", "size"], "Plugin output bundle")
  if (
    output.path.startsWith("/") ||
    output.path.includes("..") ||
    !Number.isSafeInteger(output.size) ||
    output.size < 1
  ) {
    fail("Plugin output bundle path/size is invalid")
  }
  assertDigest(output.sha256, "Plugin output bundle digest")
  return {
    schema: pluginBundleProvenanceSchema,
    source: {
      repository: pluginRepository,
      commit,
      plugin: {
        ...plugin,
        packageManifestSha256,
      },
      buildEntrypoints: entrypoints,
    },
    frozenLock: closure.frozenLock,
    hostReleases: closure.hostReleases,
    output,
  }
}

export function parsePluginBundleProvenance(bytes) {
  const statement = parseStrictJson(bytes, "Plugin bundle provenance")
  exactKeys(
    statement,
    ["frozenLock", "hostReleases", "output", "schema", "source"],
    "Plugin bundle provenance",
  )
  if (statement.schema !== pluginBundleProvenanceSchema) {
    fail("Plugin bundle provenance schema is unsupported")
  }
  exactKeys(
    statement.source,
    ["buildEntrypoints", "commit", "plugin", "repository"],
    "Plugin bundle provenance source",
  )
  if (
    statement.source.repository !== pluginRepository ||
    !commitPattern.test(statement.source.commit)
  ) {
    fail("Plugin bundle provenance source repository/commit is invalid")
  }
  exactKeys(
    statement.source.plugin,
    ["id", "packageManifestSha256", "version", "workspace"],
    "Plugin bundle provenance Plugin",
  )
  buildPluginBundleProvenance({
    buildEntrypoints: statement.source.buildEntrypoints,
    closure: {
      frozenLock: statement.frozenLock,
      hostReleases: statement.hostReleases,
    },
    commit: statement.source.commit,
    output: statement.output,
    packageManifestSha256: statement.source.plugin.packageManifestSha256,
    plugin: {
      id: statement.source.plugin.id,
      version: statement.source.plugin.version,
      workspace: statement.source.plugin.workspace,
    },
  })
  const canonical = `${canonicalJson(statement)}\n`
  if (new TextDecoder().decode(bytes) !== canonical) {
    fail("Plugin bundle provenance must be canonical JSON")
  }
  return statement
}
