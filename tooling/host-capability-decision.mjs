import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  assertCatalogContainsAcceptedApiContracts,
  parseAcceptedApiContracts,
} from "./host-capability-api-contracts.mjs"

export const hostCapabilityDecisionSchema =
  "convax.host-capability-decision-receipt/1"
export const hostCapabilityDecisionEnvironment =
  "plugin-host-capability-governance"
export const hostCapabilityDecisionRepository =
  "convaxai/convax-plugins"
export const hostCapabilityDecisionWorkflow =
  ".github/workflows/approve-host-capability.yml"
export const hostCapabilityDecisionWorkflowIdentity =
  `${hostCapabilityDecisionRepository}/${hostCapabilityDecisionWorkflow}`
export const hostRepository = "convaxai/convax"

function fail(label, message) {
  throw new Error(`${label}: ${message}`)
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(label, "must be an object")
  }
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(label, `must contain exactly ${expected.join(", ")}`)
  }
}

function cleanString(value, label, maximum = 512) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail(label, `must be a trimmed string of at most ${maximum} characters`)
  }
  return value
}

function sha256(value, label) {
  const digest = cleanString(value, label, 64)
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    fail(label, "must be one lowercase SHA-256")
  }
  return digest
}

function commit(value, label) {
  const result = cleanString(value, label, 40)
  if (!/^[a-f0-9]{40}$/u.test(result)) {
    fail(label, "must be one lowercase 40-character commit SHA")
  }
  return result
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(label, "must be a positive safe integer")
  }
  return value
}

function isoDate(value, label) {
  const result = cleanString(value, label, 64)
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(result) ||
    Number.isNaN(Date.parse(result))
  ) {
    fail(label, "must be an exact UTC timestamp")
  }
  return result
}

function semver(value, label) {
  const result = cleanString(value, label, 64)
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(result)) {
    fail(label, "must be a stable SemVer")
  }
  return result
}

function requestId(value, label) {
  const result = cleanString(value, label, 128)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(result)) {
    fail(label, "must be a lowercase kebab-case request id")
  }
  return result
}

function packageIdentity(value, label) {
  const result = cleanString(value, label, 260)
  if (!/^(?:plugin|skill)\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(result)) {
    fail(label, "must be a plugin/<id> or skill/<id> identity")
  }
  return result
}

function assetName(value, label) {
  const result = cleanString(value, label, 180)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(result)) {
    fail(label, "must be one portable release asset name")
  }
  return result
}

function releaseTag(value, label) {
  const result = cleanString(value, label, 200)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(result)) {
    fail(label, "must be one portable immutable release tag")
  }
  return result
}

function url(value, label, expectedPrefix) {
  const result = cleanString(value, label, 1_024)
  let parsed
  try {
    parsed = new URL(result)
  } catch {
    fail(label, "must be an absolute HTTPS URL")
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !result.startsWith(expectedPrefix)
  ) {
    fail(label, `must start with ${expectedPrefix}`)
  }
  return result
}

export function parseHostCapabilityDecisionReceipt(
  value,
  label = "Host capability decision receipt",
) {
  exactKeys(
    value,
    [
      "decision",
      "host",
      "pluginApi",
      "provenance",
      "request",
      "review",
      "schema",
    ],
    label,
  )
  if (value.schema !== hostCapabilityDecisionSchema) {
    fail(label, "unsupported schema")
  }
  if (value.decision !== "approved") {
    fail(label, "only an approved protected receipt can resolve a request")
  }

  exactKeys(
    value.request,
    ["acceptedApiContracts", "affected", "id", "semanticSha256"],
    `${label} request`,
  )
  const id = requestId(value.request.id, `${label} request id`)
  const acceptedApiContracts = parseAcceptedApiContracts(
    value.request.acceptedApiContracts,
    `${label} request acceptedApiContracts`,
  )
  const affected = value.request.affected
  if (
    !Array.isArray(affected) ||
    affected.length < 1 ||
    affected.length > 1_000
  ) {
    fail(`${label} request`, "affected must contain from 1 to 1000 identities")
  }
  const parsedAffected = affected.map((identity, index) =>
    packageIdentity(identity, `${label} request affected ${index}`),
  )
  if (
    new Set(parsedAffected).size !== parsedAffected.length ||
    [...parsedAffected].sort().some(
      (identity, index) => identity !== parsedAffected[index],
    )
  ) {
    fail(`${label} request`, "affected identities must be unique and sorted")
  }

  exactKeys(
    value.pluginApi,
    [
      "catalogSha256",
      "catalogUrl",
      "npmIntegrity",
      "npmTarballUrl",
      "package",
      "tarballSha256",
      "tarballUrl",
      "version",
    ],
    `${label} pluginApi`,
  )
  if (value.pluginApi.package !== "@convax/plugin-api") {
    fail(`${label} pluginApi`, "package must be @convax/plugin-api")
  }
  const pluginApiVersion = semver(
    value.pluginApi.version,
    `${label} pluginApi version`,
  )
  const catalogSha256 = sha256(
    value.pluginApi.catalogSha256,
    `${label} pluginApi catalogSha256`,
  )
  const tarballSha256 = sha256(
    value.pluginApi.tarballSha256,
    `${label} pluginApi tarballSha256`,
  )
  const npmIntegrity = cleanString(
    value.pluginApi.npmIntegrity,
    `${label} pluginApi npmIntegrity`,
    256,
  )
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(npmIntegrity)) {
    fail(`${label} pluginApi npmIntegrity`, "must be one npm SHA-512 SRI")
  }
  const npmTarballUrl = url(
    value.pluginApi.npmTarballUrl,
    `${label} pluginApi npmTarballUrl`,
    "https://registry.npmjs.org/",
  )

  exactKeys(
    value.host,
    [
      "commit",
      "pullRequest",
      "release",
      "repository",
      "runtimeConformance",
    ],
    `${label} host`,
  )
  if (value.host.repository !== hostRepository) {
    fail(`${label} host`, `repository must be ${hostRepository}`)
  }
  const hostCommit = commit(value.host.commit, `${label} host commit`)
  exactKeys(
    value.host.pullRequest,
    ["mergedAt", "number", "url"],
    `${label} host pullRequest`,
  )
  const pullRequestNumber = positiveInteger(
    value.host.pullRequest.number,
    `${label} host pullRequest number`,
  )
  const pullRequestUrl = url(
    value.host.pullRequest.url,
    `${label} host pullRequest url`,
    `https://github.com/${hostRepository}/pull/`,
  )
  if (pullRequestUrl !== `https://github.com/${hostRepository}/pull/${pullRequestNumber}`) {
    fail(`${label} host pullRequest`, "url must match number")
  }
  const mergedAt = isoDate(
    value.host.pullRequest.mergedAt,
    `${label} host pullRequest mergedAt`,
  )
  exactKeys(
    value.host.release,
    ["tag", "url"],
    `${label} host release`,
  )
  const hostReleaseTag = releaseTag(
    value.host.release.tag,
    `${label} host release tag`,
  )
  const hostReleaseUrl = url(
    value.host.release.url,
    `${label} host release url`,
    `https://github.com/${hostRepository}/releases/tag/`,
  )
  if (
    hostReleaseUrl !==
    `https://github.com/${hostRepository}/releases/tag/${hostReleaseTag}`
  ) {
    fail(`${label} host release`, "url must match tag")
  }
  const catalogUrl = url(
    value.pluginApi.catalogUrl,
    `${label} pluginApi catalogUrl`,
    `https://github.com/${hostRepository}/releases/download/${hostReleaseTag}/`,
  )
  const catalogAsset = assetName(
    new URL(catalogUrl).pathname.split("/").at(-1),
    `${label} pluginApi catalog asset`,
  )
  if (!catalogUrl.endsWith(`/${catalogAsset}`)) {
    fail(`${label} pluginApi catalogUrl`, "must identify one exact release asset")
  }
  const tarballUrl = url(
    value.pluginApi.tarballUrl,
    `${label} pluginApi tarballUrl`,
    `https://github.com/${hostRepository}/releases/download/${hostReleaseTag}/`,
  )
  const tarballAsset = assetName(
    new URL(tarballUrl).pathname.split("/").at(-1),
    `${label} pluginApi tarball asset`,
  )
  if (!tarballUrl.endsWith(`/${tarballAsset}`)) {
    fail(`${label} pluginApi tarballUrl`, "must identify one exact release asset")
  }
  exactKeys(
    value.host.runtimeConformance,
    ["sha256", "url"],
    `${label} host runtimeConformance`,
  )
  const conformanceSha256 = sha256(
    value.host.runtimeConformance.sha256,
    `${label} host runtimeConformance sha256`,
  )
  const conformanceUrl = url(
    value.host.runtimeConformance.url,
    `${label} host runtimeConformance url`,
    `https://github.com/${hostRepository}/releases/download/${hostReleaseTag}/`,
  )
  const conformanceAsset = assetName(
    new URL(conformanceUrl).pathname.split("/").at(-1),
    `${label} host runtimeConformance asset`,
  )
  if (!conformanceUrl.endsWith(`/${conformanceAsset}`)) {
    fail(
      `${label} host runtimeConformance url`,
      "must identify one exact release asset",
    )
  }

  exactKeys(
    value.review,
    ["environment", "reviewedAt", "reviewer"],
    `${label} review`,
  )
  if (value.review.environment !== hostCapabilityDecisionEnvironment) {
    fail(
      `${label} review`,
      `environment must be ${hostCapabilityDecisionEnvironment}`,
    )
  }
  exactKeys(
    value.review.reviewer,
    ["id", "login", "nodeId", "type"],
    `${label} review reviewer`,
  )
  if (value.review.reviewer.type !== "User") {
    fail(`${label} review reviewer`, "must be one human GitHub User")
  }
  const reviewerLogin = cleanString(
    value.review.reviewer.login,
    `${label} review reviewer login`,
    64,
  )
  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u.test(
      reviewerLogin,
    ) ||
    /\[bot\]$/iu.test(reviewerLogin)
  ) {
    fail(`${label} review reviewer`, "login must identify a non-bot GitHub user")
  }
  const reviewerId = positiveInteger(
    value.review.reviewer.id,
    `${label} review reviewer id`,
  )
  const reviewerNodeId = cleanString(
    value.review.reviewer.nodeId,
    `${label} review reviewer nodeId`,
    128,
  )
  const reviewedAt = isoDate(
    value.review.reviewedAt,
    `${label} review reviewedAt`,
  )

  exactKeys(
    value.provenance,
    [
      "repository",
      "runAttempt",
      "runId",
      "sourceRef",
      "sourceSha",
      "workflow",
      "workflowRef",
    ],
    `${label} provenance`,
  )
  if (
    value.provenance.repository !== hostCapabilityDecisionRepository ||
    value.provenance.workflow !== hostCapabilityDecisionWorkflow ||
    value.provenance.workflowRef !==
      `${hostCapabilityDecisionWorkflowIdentity}@refs/heads/main` ||
    value.provenance.sourceRef !== "refs/heads/main"
  ) {
    fail(`${label} provenance`, "must identify the protected default-branch workflow")
  }
  const sourceSha = commit(
    value.provenance.sourceSha,
    `${label} provenance sourceSha`,
  )
  const runId = positiveInteger(value.provenance.runId, `${label} provenance runId`)
  const runAttempt = positiveInteger(
    value.provenance.runAttempt,
    `${label} provenance runAttempt`,
  )

  return Object.freeze({
    schema: hostCapabilityDecisionSchema,
    decision: "approved",
    request: Object.freeze({
      id,
      acceptedApiContracts,
      semanticSha256: sha256(
        value.request.semanticSha256,
        `${label} request semanticSha256`,
      ),
      affected: Object.freeze(parsedAffected),
    }),
    pluginApi: Object.freeze({
      package: "@convax/plugin-api",
      version: pluginApiVersion,
      catalogSha256,
      catalogUrl,
      tarballSha256,
      tarballUrl,
      npmIntegrity,
      npmTarballUrl,
    }),
    host: Object.freeze({
      repository: hostRepository,
      commit: hostCommit,
      pullRequest: Object.freeze({
        number: pullRequestNumber,
        url: pullRequestUrl,
        mergedAt,
      }),
      release: Object.freeze({
        tag: hostReleaseTag,
        url: hostReleaseUrl,
      }),
      runtimeConformance: Object.freeze({
        url: conformanceUrl,
        sha256: conformanceSha256,
      }),
    }),
    review: Object.freeze({
      environment: hostCapabilityDecisionEnvironment,
      reviewer: Object.freeze({
        login: reviewerLogin,
        id: reviewerId,
        nodeId: reviewerNodeId,
        type: "User",
      }),
      reviewedAt,
    }),
    provenance: Object.freeze({
      repository: hostCapabilityDecisionRepository,
      workflow: hostCapabilityDecisionWorkflow,
      workflowRef: `${hostCapabilityDecisionWorkflowIdentity}@refs/heads/main`,
      sourceRef: "refs/heads/main",
      sourceSha,
      runId,
      runAttempt,
    }),
  })
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

export function canonicalReceiptBytes(receipt) {
  return Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`)
}

async function readBoundedFile(file, maximum, label) {
  const stat = await fs.lstat(file)
  if (!stat.isFile() || stat.size < 1 || stat.size > maximum) {
    fail(label, `must be a regular file from 1 to ${maximum} bytes`)
  }
  return fs.readFile(file)
}

function receiptFileName(id) {
  return `${id}.decision.json`
}

function runGh(args, options = {}) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
    stdio: options.capture === false ? "inherit" : ["ignore", "pipe", "pipe"],
  })
}

function assertSameList(actual, expected, label) {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    fail(label, `must equal ${expected.join(", ")}`)
  }
}

export async function verifyHostCapabilityDecisionReceipt({
  acceptedApiContracts,
  affected,
  attestationBundle,
  catalogPath,
  receiptPath,
  receiptReference,
  requestId: expectedRequestId,
  semanticSha256,
  verifyCommand = runGh,
}) {
  const receiptBytes = await readBoundedFile(
    receiptPath,
    128 * 1024,
    "Host capability decision receipt",
  )
  if (sha256Bytes(receiptBytes) !== receiptReference.sha256) {
    fail("Host capability decision receipt", "bytes do not match policy SHA-256")
  }
  const receipt = parseHostCapabilityDecisionReceipt(
    JSON.parse(receiptBytes.toString("utf8")),
  )
  if (
    receiptReference.repository !== hostCapabilityDecisionRepository ||
    receiptReference.asset !== receiptFileName(expectedRequestId) ||
    receipt.request.id !== expectedRequestId
  ) {
    fail("Host capability decision receipt", "identity does not match policy")
  }
  const expectedTag =
    `host-capability-decision-v1-${expectedRequestId}-` +
    receipt.pluginApi.catalogSha256
  if (receiptReference.releaseTag !== expectedTag) {
    fail("Host capability decision receipt", "release tag does not bind Catalog digest")
  }
  if (receipt.request.semanticSha256 !== semanticSha256) {
    fail("Host capability decision receipt", "request semantic digest does not match protected base")
  }
  const expectedApiContracts = parseAcceptedApiContracts(
    acceptedApiContracts,
    "Host capability decision expected API contracts",
  )
  if (
    JSON.stringify(receipt.request.acceptedApiContracts) !==
    JSON.stringify(expectedApiContracts)
  ) {
    fail(
      "Host capability decision receipt",
      "accepted API contracts do not match protected base",
    )
  }
  assertSameList(
    receipt.request.affected,
    [...affected].sort(),
    "Host capability decision receipt affected identities",
  )

  const catalogBytes = await readBoundedFile(
    catalogPath,
    16 * 1024 * 1024,
    "Host capability decision Catalog",
  )
  if (sha256Bytes(catalogBytes) !== receipt.pluginApi.catalogSha256) {
    fail("Host capability decision receipt", "Catalog bytes do not match receipt")
  }
  let catalog
  try {
    catalog = JSON.parse(catalogBytes.toString("utf8"))
  } catch (cause) {
    throw new Error("Host capability decision receipt: Catalog is not valid JSON", {
      cause,
    })
  }
  if (
    catalog?.schema !== "convax.plugin-api-catalog/3" ||
    catalog.version !== receipt.pluginApi.version
  ) {
    fail(
      "Host capability decision receipt",
      "Catalog schema/version does not match receipt",
    )
  }
  assertCatalogContainsAcceptedApiContracts(
    catalog,
    receipt.request.acceptedApiContracts,
    "Host capability decision Catalog",
  )

  for (const args of [
    [
      "release",
      "verify",
      receiptReference.releaseTag,
      "--repo",
      receiptReference.repository,
      "--format",
      "json",
    ],
    [
      "release",
      "verify-asset",
      receiptReference.releaseTag,
      receiptPath,
      "--repo",
      receiptReference.repository,
      "--format",
      "json",
    ],
  ]) {
    let releaseVerification
    try {
      releaseVerification = JSON.parse(
        verifyCommand(args, { capture: true }),
      )
    } catch (cause) {
      throw new Error(
        "Host capability decision receipt: immutable GitHub Release verification failed",
        { cause },
      )
    }
    if (!releaseVerification || typeof releaseVerification !== "object") {
      fail(
        "Host capability decision receipt",
        "immutable GitHub Release verification returned no evidence",
      )
    }
  }

  const verificationArgs = [
    "attestation",
    "verify",
    receiptPath,
    "--repo",
    hostCapabilityDecisionRepository,
    "--signer-workflow",
    hostCapabilityDecisionWorkflowIdentity,
    "--source-ref",
    "refs/heads/main",
    "--source-digest",
    receipt.provenance.sourceSha,
    "--deny-self-hosted-runners",
    "--format",
    "json",
  ]
  if (attestationBundle) {
    verificationArgs.push("--bundle", attestationBundle)
  }
  let verification
  try {
    verification = JSON.parse(
      verifyCommand(verificationArgs, { capture: true }),
    )
  } catch (cause) {
    throw new Error(
      "Host capability decision receipt: GitHub attestation verification failed",
      { cause },
    )
  }
  if (!Array.isArray(verification) || verification.length < 1) {
    fail("Host capability decision receipt", "has no verified GitHub attestation")
  }
  return receipt
}

export async function acquireAndVerifyHostCapabilityDecisionReceipt({
  acceptedApiContracts,
  affected,
  attestationDirectory,
  catalogPath,
  receiptDirectory,
  receiptReference,
  requestId,
  semanticSha256,
  downloadCommand = runGh,
  verifyCommand = runGh,
}) {
  let temporaryDirectory
  let receiptPath
  try {
    if (receiptDirectory) {
      receiptPath = path.join(receiptDirectory, receiptFileName(requestId))
    } else {
      temporaryDirectory = await fs.mkdtemp(
        path.join(os.tmpdir(), "convax-host-decision-"),
      )
      downloadCommand(
        [
          "release",
          "download",
          receiptReference.releaseTag,
          "--repo",
          receiptReference.repository,
          "--pattern",
          receiptReference.asset,
          "--dir",
          temporaryDirectory,
        ],
        { capture: false },
      )
      receiptPath = path.join(temporaryDirectory, receiptReference.asset)
    }
    const attestationBundle = attestationDirectory
      ? path.join(attestationDirectory, `${requestId}.attestation.jsonl`)
      : undefined
    return await verifyHostCapabilityDecisionReceipt({
      acceptedApiContracts,
      affected,
      attestationBundle,
      catalogPath,
      receiptPath,
      receiptReference,
      requestId,
      semanticSha256,
      verifyCommand,
    })
  } finally {
    if (temporaryDirectory) {
      await fs.rm(temporaryDirectory, { recursive: true, force: true })
    }
  }
}
