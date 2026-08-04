import { createHash } from "node:crypto"

const conformanceSchema = "convax.plugin-api-runtime-conformance/1"
const conformanceProfile = "convax.plugin-api-host-runtime/1"
const catalogSchema = "convax.plugin-api-catalog/3"
const packageName = "@convax/plugin-api"
const releaseWorkflowRef =
  "convaxai/convax/.github/workflows/plugin-api-release.yml@refs/heads/main"
const maximumConformanceBytes = 1024 * 1024
const sha256Pattern = /^[a-f0-9]{64}$/u
const npmIntegrityPattern = /^sha512-[A-Za-z0-9+/]+={0,2}$/u
const contractDigestPattern = /^sha256:[a-f0-9]{64}$/u
const positiveIntegerPattern = /^[1-9][0-9]*$/u

const requiredChecks = [
  {
    id: "plugin-api-typecheck",
    command: "bun --cwd packages/plugin-api typecheck",
  },
  {
    id: "plugin-api-test",
    command: "bun --cwd packages/plugin-api test",
  },
  {
    id: "plugin-api-compat",
    command: "bun --cwd packages/plugin-api compat",
  },
  {
    id: "plugin-api-generate-check",
    command: "bun --cwd packages/plugin-api generate:check",
  },
  {
    id: "plugin-api-pack-check",
    command: "bun --cwd packages/plugin-api pack:check",
  },
  {
    id: "release-evidence-policy",
    command: "bun test scripts/plugin-api-release-evidence.test.ts",
  },
  {
    id: "host-runtime-conformance",
    command:
      "bun test --isolate packages/desktop/src/main/plugin-host-api-service.test.ts " +
      "packages/desktop/src/main/plugin-host-api-main-adapter.test.ts " +
      "packages/desktop/src/main/plugin-capability-production.test.ts " +
      "packages/desktop/src/main/plugin-asset-protocol.test.ts " +
      "packages/desktop/src/main/plugin-connected-media-service.test.ts " +
      "packages/desktop/src/main/plugin-connected-image-inspector.test.ts",
    suites: [
      "packages/desktop/src/main/plugin-host-api-service.test.ts",
      "packages/desktop/src/main/plugin-host-api-main-adapter.test.ts",
      "packages/desktop/src/main/plugin-capability-production.test.ts",
      "packages/desktop/src/main/plugin-asset-protocol.test.ts",
      "packages/desktop/src/main/plugin-connected-media-service.test.ts",
      "packages/desktop/src/main/plugin-connected-image-inspector.test.ts",
    ],
  },
]

function fail(message) {
  throw new Error(`Plugin API runtime conformance: ${message}`)
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function assertExactKeys(value, expectedKeys, label) {
  if (!isRecord(value)) fail(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} keys must be exactly ${expected.join(", ")}`)
  }
}

function assertExactStringList(value, expected, label) {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((item, index) => item !== expected[index])
  ) {
    fail(`${label} must match the exact required suite list`)
  }
}

function parseJson(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > maximumConformanceBytes
  ) {
    fail("evidence size is outside the admitted bound")
  }
  let source
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    fail("evidence must be valid UTF-8")
  }
  try {
    return JSON.parse(source)
  } catch {
    fail("evidence must be valid JSON")
  }
}

export function pluginApiCatalogContractCoverage(catalog) {
  if (!Array.isArray(catalog?.apis)) {
    fail("Catalog must contain an API array for contract coverage")
  }
  const seen = new Set()
  return catalog.apis
    .map((definition, index) => {
      const id = definition?.id
      const digest = definition?.contract?.digest
      if (
        typeof id !== "string" ||
        id.length === 0 ||
        seen.has(id) ||
        typeof digest !== "string" ||
        !contractDigestPattern.test(digest)
      ) {
        fail(`Catalog API ${index} has an invalid or duplicate contract identity`)
      }
      seen.add(id)
      return { id, digest }
    })
    .sort((left, right) => left.id.localeCompare(right.id, "en"))
}

export function parsePluginApiRuntimeConformance(bytes, expected) {
  const evidence = parseJson(bytes)
  assertExactKeys(
    evidence,
    ["schema", "profile", "host", "workflow", "pluginApi", "checks"],
    "top-level evidence",
  )
  if (
    evidence.schema !== conformanceSchema ||
    evidence.profile !== conformanceProfile
  ) {
    fail(`schema/profile must be exactly ${conformanceSchema} and ${conformanceProfile}`)
  }

  assertExactKeys(evidence.host, ["repository", "commit"], "host")
  if (
    evidence.host.repository !== expected.repository ||
    evidence.host.commit !== expected.commit
  ) {
    fail("host repository and commit must match the immutable release")
  }

  assertExactKeys(
    evidence.workflow,
    ["ref", "runId", "runAttempt"],
    "workflow",
  )
  if (evidence.workflow.ref !== releaseWorkflowRef) {
    fail("workflow ref must identify the protected Plugin API release workflow")
  }
  if (
    typeof evidence.workflow.runId !== "string" ||
    !positiveIntegerPattern.test(evidence.workflow.runId) ||
    typeof evidence.workflow.runAttempt !== "string" ||
    !positiveIntegerPattern.test(evidence.workflow.runAttempt)
  ) {
    fail("workflow run id and attempt must be positive integer strings")
  }

  assertExactKeys(
    evidence.pluginApi,
    [
      "package",
      "version",
      "catalogSchema",
      "catalogSha256",
      "tarballSha256",
      "tarballIntegrity",
      "contractCoverage",
      "contractCoverageSha256",
    ],
    "pluginApi",
  )
  if (
    evidence.pluginApi.package !== packageName ||
    evidence.pluginApi.version !== expected.version
  ) {
    fail("package identity must match the published @convax/plugin-api version")
  }
  if (
    evidence.pluginApi.catalogSchema !== catalogSchema ||
    !sha256Pattern.test(evidence.pluginApi.catalogSha256) ||
    evidence.pluginApi.catalogSha256 !== expected.catalogSha256
  ) {
    fail("Catalog /3 schema and digest must match the published asset")
  }
  if (
    !sha256Pattern.test(evidence.pluginApi.tarballSha256) ||
    evidence.pluginApi.tarballSha256 !== expected.tarballSha256 ||
    !npmIntegrityPattern.test(evidence.pluginApi.tarballIntegrity) ||
    evidence.pluginApi.tarballIntegrity !== expected.tarballIntegrity
  ) {
    fail("tarball digest and npm integrity must match the published package")
  }
  if (
    !Array.isArray(evidence.pluginApi.contractCoverage) ||
    !Array.isArray(expected.contractCoverage)
  ) {
    fail("contract coverage must bind the exact Catalog API contracts")
  }
  let previousId = ""
  const seenCoverage = new Set()
  for (const [index, coverage] of
    evidence.pluginApi.contractCoverage.entries()) {
    assertExactKeys(
      coverage,
      ["digest", "id"],
      `contract coverage ${index}`,
    )
    if (
      typeof coverage.id !== "string" ||
      coverage.id.length === 0 ||
      coverage.id <= previousId ||
      seenCoverage.has(coverage.id) ||
      typeof coverage.digest !== "string" ||
      !contractDigestPattern.test(coverage.digest)
    ) {
      fail("contract coverage must be sorted, unique Catalog contract identities")
    }
    previousId = coverage.id
    seenCoverage.add(coverage.id)
  }
  const coverageJson = JSON.stringify(evidence.pluginApi.contractCoverage)
  const coverageSha256 = createHash("sha256")
    .update(coverageJson)
    .digest("hex")
  if (
    evidence.pluginApi.contractCoverageSha256 !== coverageSha256 ||
    JSON.stringify(evidence.pluginApi.contractCoverage) !==
      JSON.stringify(expected.contractCoverage)
  ) {
    fail("contract coverage and digest must match the exact Catalog")
  }

  if (!Array.isArray(evidence.checks)) {
    fail("checks must be an array")
  }
  const expectedChecks = new Map(
    requiredChecks.map((check) => [check.id, check]),
  )
  const seen = new Set()
  for (const check of evidence.checks) {
    const id = isRecord(check) ? check.id : undefined
    if (typeof id !== "string") fail("every check must have one string id")
    if (seen.has(id)) fail(`duplicate check id ${id}`)
    seen.add(id)
    const required = expectedChecks.get(id)
    if (!required) fail(`unknown check id ${id}`)
    assertExactKeys(
      check,
      required.suites
        ? ["id", "command", "suites", "status"]
        : ["id", "command", "status"],
      `check ${id}`,
    )
    if (check.command !== required.command) {
      fail(`check ${id} command does not match the required command`)
    }
    if (check.status !== "passed") {
      fail(`check ${id} did not pass`)
    }
    if (required.suites) {
      assertExactStringList(
        check.suites,
        required.suites,
        `check ${id} suites`,
      )
    }
  }
  const missing = requiredChecks
    .map((check) => check.id)
    .filter((id) => !seen.has(id))
  if (missing.length > 0) {
    fail(`missing required checks: ${missing.join(", ")}`)
  }
  return evidence
}
