import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  canonicalReceiptBytes,
  hostCapabilityDecisionEnvironment,
  hostCapabilityDecisionRepository,
  hostCapabilityDecisionSchema,
  hostCapabilityDecisionWorkflow,
  hostCapabilityDecisionWorkflowIdentity,
  hostRepository,
  parseHostCapabilityDecisionReceipt,
  sha256Bytes,
} from "./host-capability-decision.mjs"
import {
  assertCatalogContainsAcceptedApiContracts,
} from "./host-capability-api-contracts.mjs"
import {
  hostCapabilityRequestSemanticDigest,
} from "./host-capability-request.mjs"
import { loadPublicationPolicy } from "./lib.mjs"
import {
  pluginApiCatalogContractCoverage,
  parsePluginApiRuntimeConformance,
} from "./plugin-api-runtime-conformance.mjs"

function fail(message) {
  throw new Error(`Host capability decision issuance: ${message}`)
}

function requiredEnvironment(name, pattern) {
  const value = process.env[name]
  if (!value || (pattern && !pattern.test(value))) {
    fail(`${name} is missing or invalid`)
  }
  return value
}

async function readJson(file, label) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"))
  } catch (cause) {
    throw new Error(`Host capability decision issuance: ${label} is invalid`, {
      cause,
    })
  }
}

function parseArguments(argv) {
  const supported = new Set([
    "--approvals",
    "--catalog",
    "--conformance",
    "--environment",
    "--host-compare",
    "--host-pr",
    "--host-release",
    "--host-tag-sha",
    "--output",
    "--package-catalog",
    "--package-json",
    "--package-tarball",
    "--npm-metadata",
    "--npm-tarball",
    "--run",
  ])
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!supported.has(key) || !value || result[key]) {
      fail("invalid command arguments")
    }
    result[key] = value
  }
  for (const key of supported) {
    if (!result[key]) fail(`${key} is required`)
  }
  return result
}

function affectedIdentity(item) {
  return `${item.kind}/${item.id}`
}

export async function createHostCapabilityDecisionReceipt({
  approvals,
  catalogBytes,
  conformanceBytes,
  environment,
  hostCompare,
  hostPullRequest,
  hostRelease,
  hostTagSha,
  policy,
  requestSource,
  packageCatalogBytes,
  packageJson,
  packageTarballBytes,
  npmMetadata,
  npmTarballBytes,
  values,
  workflowRun,
}) {
  const request = policy.requests.find((item) => item.id === values.requestId)
  if (!request) {
    fail(`request ${values.requestId} is not pending on protected main`)
  }
  if (policy.resolutions.some((item) => item.id === values.requestId)) {
    fail(`request ${values.requestId} already has a resolution tombstone`)
  }
  if (
    sha256Bytes(catalogBytes) !== values.catalogSha256 ||
    sha256Bytes(conformanceBytes) !== values.conformanceSha256 ||
    sha256Bytes(packageTarballBytes) !== values.packageSha256
  ) {
    fail(
      "Catalog, package tarball, or runtime conformance bytes do not match the supplied SHA-256",
    )
  }
  let catalog
  try {
    catalog = JSON.parse(catalogBytes.toString("utf8"))
  } catch {
    fail("published Catalog is not valid JSON")
  }
  if (
    catalog.schema !== "convax.plugin-api-catalog/3" ||
    catalog.version !== values.pluginApiVersion
  ) {
    fail("published Catalog schema/version does not match the approved version")
  }
  assertCatalogContainsAcceptedApiContracts(
    catalog,
    request.acceptedApiContracts,
    "Host capability decision issuance Catalog",
  )
  if (
    packageJson?.name !== "@convax/plugin-api" ||
    packageJson.version !== values.pluginApiVersion ||
    !Buffer.from(packageCatalogBytes).equals(Buffer.from(catalogBytes))
  ) {
    fail(
      "published package identity or embedded dist/generated/plugin-api.json does not match the standalone Catalog",
    )
  }
  const npmTarballUrl = npmMetadata?.dist?.tarball
  const npmIntegrity = npmMetadata?.dist?.integrity
  if (
    typeof npmTarballUrl !== "string" ||
    !npmTarballUrl.startsWith("https://registry.npmjs.org/") ||
    typeof npmIntegrity !== "string" ||
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(npmIntegrity) ||
    !Buffer.from(npmTarballBytes).equals(Buffer.from(packageTarballBytes)) ||
    `sha512-${createHash("sha512").update(npmTarballBytes).digest("base64")}` !==
      npmIntegrity
  ) {
    fail(
      "npm registry tarball, integrity, and immutable Host package asset must be byte-identical",
    )
  }
  parsePluginApiRuntimeConformance(conformanceBytes, {
    repository: hostRepository,
    commit: values.hostCommit,
    version: values.pluginApiVersion,
    catalogSha256: values.catalogSha256,
    tarballSha256: values.packageSha256,
    tarballIntegrity: npmIntegrity,
    contractCoverage: pluginApiCatalogContractCoverage(catalog),
  })

  if (
    hostPullRequest.number !== values.hostPullRequest ||
    hostPullRequest.merged_at === null ||
    hostPullRequest.html_url !==
      `https://github.com/${hostRepository}/pull/${values.hostPullRequest}` ||
    typeof hostPullRequest.merge_commit_sha !== "string"
  ) {
    fail("Host pull request must be the exact merged convaxai/convax PR")
  }
  if (
    !["ahead", "identical"].includes(hostCompare.status) ||
    hostCompare.base_commit?.sha !== hostPullRequest.merge_commit_sha ||
    hostCompare.merge_base_commit?.sha !== hostPullRequest.merge_commit_sha
  ) {
    fail("Host commit must contain the accepted pull request merge commit")
  }
  if (
    hostRelease.tag_name !== values.hostReleaseTag ||
    hostRelease.draft !== false ||
    hostRelease.html_url !==
      `https://github.com/${hostRepository}/releases/tag/${values.hostReleaseTag}` ||
    hostTagSha !== values.hostCommit
  ) {
    fail("Host release must be published and its immutable tag must equal Host commit")
  }

  const requiredReviewerRule = environment.protection_rules?.find(
    (rule) => rule.type === "required_reviewers",
  )
  if (
    environment.name !== hostCapabilityDecisionEnvironment ||
    environment.can_admins_bypass !== false ||
    requiredReviewerRule?.prevent_self_review !== true ||
    !Array.isArray(requiredReviewerRule.reviewers) ||
    requiredReviewerRule.reviewers.length < 1
  ) {
    fail(
      `${hostCapabilityDecisionEnvironment} must require reviewers, prevent self-review, and disallow administrator bypass`,
    )
  }
  if (
    workflowRun.id !== values.runId ||
    workflowRun.run_attempt !== values.runAttempt ||
    workflowRun.event !== "workflow_dispatch" ||
    workflowRun.head_branch !== "main" ||
    workflowRun.head_sha !== values.sourceSha ||
    workflowRun.path !== hostCapabilityDecisionWorkflow ||
    workflowRun.actor?.login !== values.actor
  ) {
    fail("workflow run does not identify the protected default-branch decision workflow")
  }
  const approval = approvals.find(
    (item) =>
      item.state === "approved" &&
      item.user?.type === "User" &&
      item.user.login !== values.actor &&
      !/\[bot\]$/iu.test(item.user.login) &&
      item.environments?.some(
        (candidate) =>
          candidate.name === hostCapabilityDecisionEnvironment &&
          candidate.id === environment.id,
      ),
  )
  if (!approval) {
    fail("no independent human approval exists for the protected environment")
  }

  return parseHostCapabilityDecisionReceipt({
    schema: hostCapabilityDecisionSchema,
    decision: "approved",
    request: {
      id: values.requestId,
      acceptedApiContracts: request.acceptedApiContracts,
      semanticSha256: hostCapabilityRequestSemanticDigest(requestSource),
      affected: request.affected.map(affectedIdentity).sort(),
    },
    pluginApi: {
      package: "@convax/plugin-api",
      version: values.pluginApiVersion,
      catalogSha256: values.catalogSha256,
      catalogUrl:
        `https://github.com/${hostRepository}/releases/download/` +
        `${values.hostReleaseTag}/${values.catalogAsset}`,
      tarballSha256: values.packageSha256,
      tarballUrl:
        `https://github.com/${hostRepository}/releases/download/` +
        `${values.hostReleaseTag}/${values.packageAsset}`,
      npmIntegrity,
      npmTarballUrl,
    },
    host: {
      repository: hostRepository,
      commit: values.hostCommit,
      pullRequest: {
        number: values.hostPullRequest,
        url: hostPullRequest.html_url,
        mergedAt: hostPullRequest.merged_at,
      },
      release: {
        tag: values.hostReleaseTag,
        url: hostRelease.html_url,
      },
      runtimeConformance: {
        url:
          `https://github.com/${hostRepository}/releases/download/` +
          `${values.hostReleaseTag}/${values.conformanceAsset}`,
        sha256: values.conformanceSha256,
      },
    },
    review: {
      environment: hostCapabilityDecisionEnvironment,
      reviewer: {
        login: approval.user.login,
        id: approval.user.id,
        nodeId: approval.user.node_id,
        type: approval.user.type,
      },
      reviewedAt: workflowRun.updated_at,
    },
    provenance: {
      repository: hostCapabilityDecisionRepository,
      workflow: hostCapabilityDecisionWorkflow,
      workflowRef:
        `${hostCapabilityDecisionWorkflowIdentity}@refs/heads/main`,
      sourceRef: "refs/heads/main",
      sourceSha: values.sourceSha,
      runId: values.runId,
      runAttempt: values.runAttempt,
    },
  })
}

if (import.meta.main) {
  const args = parseArguments(process.argv.slice(2))
  const workspaceRoot = path.resolve(
    fileURLToPath(new URL("..", import.meta.url)),
  )
  const values = {
    requestId: requiredEnvironment(
      "REQUEST_ID",
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    ),
    pluginApiVersion: requiredEnvironment(
      "PLUGIN_API_VERSION",
      /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u,
    ),
    catalogSha256: requiredEnvironment("CATALOG_SHA256", /^[a-f0-9]{64}$/u),
    conformanceSha256: requiredEnvironment(
      "CONFORMANCE_SHA256",
      /^[a-f0-9]{64}$/u,
    ),
    packageSha256: requiredEnvironment("PACKAGE_SHA256", /^[a-f0-9]{64}$/u),
    hostCommit: requiredEnvironment("HOST_COMMIT", /^[a-f0-9]{40}$/u),
    hostPullRequest: Number(
      requiredEnvironment("HOST_PULL_REQUEST", /^[1-9]\d*$/u),
    ),
    hostReleaseTag: requiredEnvironment(
      "HOST_RELEASE_TAG",
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/u,
    ),
    catalogAsset: requiredEnvironment(
      "CATALOG_ASSET",
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/u,
    ),
    conformanceAsset: requiredEnvironment(
      "CONFORMANCE_ASSET",
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/u,
    ),
    packageAsset: requiredEnvironment(
      "PACKAGE_ASSET",
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/u,
    ),
    actor: requiredEnvironment("GITHUB_ACTOR"),
    sourceSha: requiredEnvironment("GITHUB_SHA", /^[a-f0-9]{40}$/u),
    runId: Number(requiredEnvironment("GITHUB_RUN_ID", /^[1-9]\d*$/u)),
    runAttempt: Number(
      requiredEnvironment("GITHUB_RUN_ATTEMPT", /^[1-9]\d*$/u),
    ),
  }
  if (requiredEnvironment("HOST_REPOSITORY") !== hostRepository) {
    fail(`HOST_REPOSITORY must be ${hostRepository}`)
  }
  const policy = await loadPublicationPolicy(workspaceRoot)
  const request = policy.requests.find((item) => item.id === values.requestId)
  if (!request) fail(`request ${values.requestId} is not pending`)
  const [
    requestSource,
    catalogBytes,
    conformanceBytes,
    packageTarballBytes,
    npmTarballBytes,
    packageJson,
    packageCatalogBytes,
    npmMetadata,
    hostPullRequest,
    hostCompare,
    hostRelease,
    environment,
    approvals,
    workflowRun,
    hostTagSha,
  ] = await Promise.all([
    fs.readFile(path.join(workspaceRoot, request.document), "utf8"),
    fs.readFile(args["--catalog"]),
    fs.readFile(args["--conformance"]),
    fs.readFile(args["--package-tarball"]),
    fs.readFile(args["--npm-tarball"]),
    readJson(args["--package-json"], "package.json extracted from npm tarball"),
    fs.readFile(args["--package-catalog"]),
    readJson(args["--npm-metadata"], "npm registry metadata"),
    readJson(args["--host-pr"], "Host PR evidence"),
    readJson(args["--host-compare"], "Host compare evidence"),
    readJson(args["--host-release"], "Host release evidence"),
    readJson(args["--environment"], "environment evidence"),
    readJson(args["--approvals"], "approval evidence"),
    readJson(args["--run"], "workflow run evidence"),
    fs.readFile(args["--host-tag-sha"], "utf8").then((value) => value.trim()),
  ])
  const receipt = await createHostCapabilityDecisionReceipt({
    approvals,
    catalogBytes,
    conformanceBytes,
    environment,
    hostCompare,
    hostPullRequest,
    hostRelease,
    hostTagSha,
    policy,
    requestSource,
    packageCatalogBytes,
    packageJson,
    packageTarballBytes,
    npmMetadata,
    npmTarballBytes,
    values,
    workflowRun,
  })
  await fs.writeFile(args["--output"], canonicalReceiptBytes(receipt), {
    flag: "wx",
  })
}
