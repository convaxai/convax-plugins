import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  exactKeys,
  parseHostCapabilityPolicy,
  parseId,
  parseSemver,
} from "./lib.mjs"
import {
  assertCatalogContainsAcceptedApiContracts,
  parseAcceptedApiContracts,
} from "./host-capability-api-contracts.mjs"
import {
  acquireAndVerifyHostCapabilityDecisionReceipt,
} from "./host-capability-decision.mjs"
import {
  hostCapabilityRequestSemanticDigest,
} from "./host-capability-request.mjs"

const policyPath = "registry/host-capability-policy.json"
const emptyPolicy = Object.freeze({
  requests: Object.freeze([]),
  resolutions: Object.freeze([]),
  schema: "convax.host-capability-policy/2",
})
const automatedPolicySchema = "convax.host-capability-policy/3"
const automatedVerificationModes = new Set([
  "catalog-contracts",
  "package-conformance",
])
const technicalBlockerCodes = new Set([
  "release-test-failed",
  "unsupported-target",
  "unverified-runtime-dependency",
])
const maximumRequirementsPerPackage = 16

function cleanString(value, label, maximumLength) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length === 0 ||
    value.length > maximumLength ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`${label}: must be a non-empty trimmed string`)
  }
  return value
}

function policyId(value, label) {
  const id = cleanString(value, label, 128)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) {
    throw new Error(`${label}: must be a lowercase kebab-case identifier`)
  }
  return id
}

function parseAutomatedAffected(value, label) {
  exactKeys(value, ["id", "kind", "version"], ["id", "kind", "version"], label)
  if (value.kind !== "plugin" && value.kind !== "skill") {
    throw new Error(`${label}: kind must be plugin or skill`)
  }
  return {
    id: parseId(value.id, `${label} id`),
    kind: value.kind,
    version: parseSemver(value.version, `${label} version`),
  }
}

function compareAffected(left, right) {
  return `${left.kind}/${left.id}@${left.version}`.localeCompare(
    `${right.kind}/${right.id}@${right.version}`,
    "en",
  )
}

function assertUniqueAffected(affected, label) {
  const identities = affected.map(
    (item) => `${item.kind}/${item.id}@${item.version}`,
  )
  if (new Set(identities).size !== identities.length) {
    throw new Error(`${label}: contains duplicate affected package versions`)
  }
}

export function parseAutomatedHostCapabilityPolicy(
  value,
  catalog,
  label = "registry/host-capability-policy.json",
) {
  exactKeys(
    value,
    ["blockers", "requirements", "schema"],
    ["blockers", "requirements", "schema"],
    label,
  )
  if (value.schema !== automatedPolicySchema) {
    throw new Error(`${label}: unsupported automated policy schema`)
  }
  if (!Array.isArray(value.requirements) || value.requirements.length > 1_000) {
    throw new Error(`${label}: requirements must be an array with at most 1000 items`)
  }
  const requirements = value.requirements.map((requirement, index) => {
    const requirementLabel = `${label} requirement ${index}`
    exactKeys(
      requirement,
      ["acceptedApiContracts", "affected", "id", "verification"],
      ["acceptedApiContracts", "affected", "id", "verification"],
      requirementLabel,
    )
    const id = policyId(requirement.id, `${requirementLabel} id`)
    if (!automatedVerificationModes.has(requirement.verification)) {
      throw new Error(
        `${requirementLabel}: verification must be catalog-contracts or package-conformance`,
      )
    }
    const acceptedApiContracts = parseAcceptedApiContracts(
      requirement.acceptedApiContracts,
      `${requirementLabel} acceptedApiContracts`,
    )
    if (
      requirement.verification === "catalog-contracts" &&
      acceptedApiContracts.length === 0
    ) {
      throw new Error(
        `${requirementLabel}: catalog-contracts verification requires at least one accepted API contract`,
      )
    }
    if (
      requirement.verification === "package-conformance" &&
      acceptedApiContracts.length !== 0
    ) {
      throw new Error(
        `${requirementLabel}: package-conformance verification must not duplicate API contracts`,
      )
    }
    assertCatalogContainsAcceptedApiContracts(
      catalog,
      acceptedApiContracts,
      `${requirementLabel} candidate Catalog`,
    )
    if (
      !Array.isArray(requirement.affected) ||
      requirement.affected.length < 1 ||
      requirement.affected.length > 1_000
    ) {
      throw new Error(
        `${requirementLabel}: affected must contain from 1 to 1000 package versions`,
      )
    }
    const affected = requirement.affected.map((item, itemIndex) =>
      parseAutomatedAffected(
        item,
        `${requirementLabel} affected ${itemIndex}`,
      ))
    if (
      requirement.verification === "catalog-contracts" &&
      affected.some((item) => item.kind !== "plugin")
    ) {
      throw new Error(
        `${requirementLabel}: catalog-contracts verification may affect only Plugins with manifests`,
      )
    }
    assertUniqueAffected(affected, requirementLabel)
    return {
      acceptedApiContracts,
      affected: affected.sort(compareAffected),
      id,
      verification: requirement.verification,
    }
  }).sort((left, right) => left.id.localeCompare(right.id, "en"))
  const requirementIds = requirements.map(({ id }) => id)
  if (new Set(requirementIds).size !== requirementIds.length) {
    throw new Error(`${label}: contains duplicate requirement ids`)
  }
  const requirementCountByPackage = new Map()
  for (const requirement of requirements) {
    for (const item of requirement.affected) {
      const identity = `${item.kind}/${item.id}@${item.version}`
      const count = (requirementCountByPackage.get(identity) ?? 0) + 1
      if (count > maximumRequirementsPerPackage) {
        throw new Error(
          `${label}: ${identity} binds more than ${maximumRequirementsPerPackage} automated requirements`,
        )
      }
      requirementCountByPackage.set(identity, count)
    }
  }
  if (!Array.isArray(value.blockers) || value.blockers.length > 1_000) {
    throw new Error(`${label}: blockers must be an array with at most 1000 items`)
  }
  const blockers = value.blockers.map((entry, index) => {
    const blockerLabel = `${label} blocker policy ${index}`
    exactKeys(entry, ["affected", "id"], ["affected", "id"], blockerLabel)
    const id = policyId(entry.id, `${blockerLabel} id`)
    if (
      !Array.isArray(entry.affected) ||
      entry.affected.length < 1 ||
      entry.affected.length > 1_000
    ) {
      throw new Error(
        `${blockerLabel}: affected must contain from 1 to 1000 package versions`,
      )
    }
    const affected = entry.affected.map((item, itemIndex) => {
      const itemLabel = `${blockerLabel} affected ${itemIndex}`
      exactKeys(
        item,
        ["blocker", "id", "kind", "version"],
        ["blocker", "id", "kind", "version"],
        itemLabel,
      )
      const identity = parseAutomatedAffected(
        { id: item.id, kind: item.kind, version: item.version },
        itemLabel,
      )
      exactKeys(
        item.blocker,
        ["code", "note"],
        ["code", "note"],
        `${itemLabel} blocker`,
      )
      const code = cleanString(
        item.blocker.code,
        `${itemLabel} blocker code`,
        80,
      )
      if (!technicalBlockerCodes.has(code)) {
        throw new Error(
          `${itemLabel} blocker: automated policy accepts only technical blocker codes`,
        )
      }
      return {
        ...identity,
        blocker: {
          code,
          note: cleanString(
            item.blocker.note,
            `${itemLabel} blocker note`,
            700,
          ),
        },
      }
    })
    assertUniqueAffected(affected, blockerLabel)
    return { affected: affected.sort(compareAffected), id }
  }).sort((left, right) => left.id.localeCompare(right.id, "en"))
  const blockerIds = blockers.map(({ id }) => id)
  if (new Set(blockerIds).size !== blockerIds.length) {
    throw new Error(`${label}: contains duplicate blocker policy ids`)
  }
  return { blockers, requirements, schema: automatedPolicySchema }
}

function requestById(policy) {
  return new Map(policy.requests.map((request) => [request.id, request]))
}

function affectedKey(item) {
  return `${item.kind}/${item.id}`
}

/**
 * A pending obligation on the protected base cannot disappear or silently move
 * to another request. Version bumps are allowed only while the same package
 * identity remains blocked by the same request.
 *
 * Resolution is intentionally unsupported until an external human-receipt
 * verifier is introduced. Keeping that transition impossible is safer than
 * treating repository-local approval text as authority.
 */
export function assertPendingHostCapabilityHistory(
  basePolicy,
  currentPolicy,
  semanticDigests = {},
  verifiedReceipts = new Map(),
) {
  const currentById = requestById(currentPolicy)
  const currentResolutions = new Map(
    currentPolicy.resolutions.map((resolution) => [resolution.id, resolution]),
  )
  const baseResolutions = new Map(
    basePolicy.resolutions.map((resolution) => [resolution.id, resolution]),
  )
  for (const [id, baseResolution] of baseResolutions) {
    const currentResolution = currentResolutions.get(id)
    if (
      !currentResolution ||
      JSON.stringify(currentResolution) !== JSON.stringify(baseResolution)
    ) {
      throw new Error(
        `resolved Host capability request ${id} receipt tombstone cannot be removed or changed`,
      )
    }
  }
  for (const baseRequest of basePolicy.requests) {
    const currentRequest = currentById.get(baseRequest.id)
    if (!currentRequest) {
      const resolution = currentResolutions.get(baseRequest.id)
      const receipt = verifiedReceipts.get(baseRequest.id)
      if (!resolution || !receipt) {
        throw new Error(
          `pending Host capability request ${baseRequest.id} cannot be removed without a protected external human-decision receipt`,
        )
      }
      continue
    }
    if (currentResolutions.has(baseRequest.id)) {
      throw new Error(
        `pending Host capability request ${baseRequest.id} cannot be pending and resolved`,
      )
    }
    const bindsContractsDuringV2Cutover =
      basePolicy.schema === "convax.host-capability-policy/1" &&
      currentPolicy.schema === "convax.host-capability-policy/2" &&
      baseRequest.acceptedApiContracts.length === 0 &&
      currentRequest.acceptedApiContracts.length > 0
    if (
      !bindsContractsDuringV2Cutover &&
      JSON.stringify(currentRequest.acceptedApiContracts) !==
      JSON.stringify(baseRequest.acceptedApiContracts)
    ) {
      throw new Error(
        `pending Host capability request ${baseRequest.id} accepted API contracts cannot change without a protected external human-decision receipt`,
      )
    }
    const currentAffected = new Set(currentRequest.affected.map(affectedKey))
    for (const affected of baseRequest.affected) {
      const identity = affectedKey(affected)
      if (!currentAffected.has(identity)) {
        throw new Error(
          `pending Host capability request ${baseRequest.id} cannot release ${identity} without a protected external human-decision receipt`,
        )
      }
    }
    const baseDigest = semanticDigests.base?.get(baseRequest.id)
    const currentDigest = semanticDigests.current?.get(baseRequest.id)
    if (
      typeof baseDigest !== "string" ||
      typeof currentDigest !== "string" ||
      (baseDigest !== currentDigest && !bindsContractsDuringV2Cutover)
    ) {
      throw new Error(
        `pending Host capability request ${baseRequest.id} semantic contract cannot change without a protected external human-decision receipt`,
      )
    }
  }
}

function exactStringList(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

export function assertAutomatedHostCapabilityTransition(
  basePolicy,
  currentPolicy,
  workspaceState,
) {
  if (basePolicy.schema !== "convax.host-capability-policy/2") {
    throw new Error(
      "automated Host capability policy requires an exact protected /2 base",
    )
  }
  if (basePolicy.resolutions.length !== 0) {
    throw new Error(
      "automated Host capability policy cannot discard protected resolution tombstones",
    )
  }
  if (workspaceState.requestDocuments.length !== 0) {
    throw new Error(
      "automated Host capability policy cannot retain human-review request documents",
    )
  }
  const requirementsById = new Map(
    currentPolicy.requirements.map((requirement) => [requirement.id, requirement]),
  )
  const blockersById = new Map(
    currentPolicy.blockers.map((blocker) => [blocker.id, blocker]),
  )
  for (const baseRequest of basePolicy.requests) {
    const requirement = requirementsById.get(baseRequest.id)
    if (!requirement) {
      throw new Error(
        `protected Host capability request ${baseRequest.id} must become an automated requirement with the same id`,
      )
    }
    const expectedVerification = baseRequest.acceptedApiContracts.length > 0
      ? "catalog-contracts"
      : "package-conformance"
    if (requirement.verification !== expectedVerification) {
      throw new Error(
        `protected Host capability request ${baseRequest.id} must use ${expectedVerification} verification`,
      )
    }
    const baseApiIds = baseRequest.acceptedApiContracts
      .map(({ id }) => id)
      .sort()
    const currentApiIds = requirement.acceptedApiContracts
      .map(({ id }) => id)
      .sort()
    if (!exactStringList(baseApiIds, currentApiIds)) {
      throw new Error(
        `protected Host capability request ${baseRequest.id} accepted API ids cannot change during automated migration`,
      )
    }
    const currentAffectedByIdentity = new Map(
      requirement.affected.map((item) => [affectedKey(item), item]),
    )
    for (const baseAffected of baseRequest.affected) {
      const identity = affectedKey(baseAffected)
      const currentAffected = currentAffectedByIdentity.get(identity)
      if (!currentAffected) {
        throw new Error(
          `protected Host capability request ${baseRequest.id} cannot release ${identity} during automated migration`,
        )
      }
      for (const baseBlocker of baseAffected.blockers) {
        if (baseBlocker.code === "host-capability-review-required") continue
        const blockerPolicy = blockersById.get(baseRequest.id)
        const currentBlocker = blockerPolicy?.affected.find(
          (item) => affectedKey(item) === identity,
        )
        if (
          !currentBlocker ||
          currentBlocker.version !== currentAffected.version ||
          currentBlocker.blocker.code !== baseBlocker.code
        ) {
          throw new Error(
            `protected technical blocker ${baseRequest.id} for ${identity} must remain fail-closed at the automated requirement version`,
          )
        }
      }
    }
  }
  for (const blockerPolicy of currentPolicy.blockers) {
    const requirement = requirementsById.get(blockerPolicy.id)
    if (!requirement) {
      throw new Error(
        `technical blocker ${blockerPolicy.id} must bind one automated requirement`,
      )
    }
    const requiredIdentities = new Set(
      requirement.affected.map(
        (item) => `${item.kind}/${item.id}@${item.version}`,
      ),
    )
    for (const item of blockerPolicy.affected) {
      const identity = `${item.kind}/${item.id}@${item.version}`
      if (!requiredIdentities.has(identity)) {
        throw new Error(
          `technical blocker ${blockerPolicy.id} contains stale or unrelated package ${identity}`,
        )
      }
      if (!workspaceState.packageIdentities.has(identity)) {
        throw new Error(
          `technical blocker ${blockerPolicy.id} names unknown package ${identity}`,
        )
      }
    }
  }
  const policyDeclarations = new Map(
    currentPolicy.requirements.map((requirement) => [
      requirement.id,
      requirement.affected
        .map((item) => `${item.kind}/${item.id}@${item.version}`)
        .sort(),
    ]),
  )
  for (const requirementId of new Set([
    ...policyDeclarations.keys(),
    ...workspaceState.declarationsByRequirement.keys(),
  ])) {
    const expected = policyDeclarations.get(requirementId)
    const actual = (
      workspaceState.declarationsByRequirement.get(requirementId) ?? []
    ).sort()
    if (!expected || !exactStringList(expected, actual)) {
      throw new Error(
        `automated requirement ${requirementId} must exactly match workspace declarations and affected versions`,
      )
    }
  }
  return {
    requirements: currentPolicy.requirements.length,
    technicalBlockers: currentPolicy.blockers.length,
  }
}

async function readJsonFile(file, label) {
  let source
  try {
    source = await fs.readFile(file, "utf8")
  } catch (cause) {
    throw new Error(`${label}: cannot read`, { cause })
  }
  try {
    return JSON.parse(source)
  } catch (cause) {
    throw new Error(`${label}: invalid JSON`, { cause })
  }
}

async function inspectAutomatedWorkspace(workspaceRoot) {
  const declarationsByRequirement = new Map()
  const packageIdentities = new Set()
  for (const [kind, directoryName] of [
    ["plugin", "plugins"],
    ["skill", "skills"],
  ]) {
    const directory = path.join(workspaceRoot, "packages", directoryName)
    const entries = await fs.readdir(directory, { withFileTypes: true })
      .catch((cause) => {
        if (cause?.code === "ENOENT") return []
        throw cause
      })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const id = parseId(entry.name, `${kind} directory id`)
      const packagePath = path.join(directory, entry.name, "package.json")
      const stat = await fs.lstat(packagePath).catch((cause) => {
        throw new Error(`${kind}/${id} package.json: cannot inspect`, { cause })
      })
      if (!stat.isFile()) {
        throw new Error(`${kind}/${id} package.json: must be a regular file`)
      }
      const packageJson = await readJsonFile(
        packagePath,
        `${kind}/${id} package.json`,
      )
      const version = parseSemver(
        packageJson.version,
        `${kind}/${id} package version`,
      )
      const identity = `${kind}/${id}@${version}`
      packageIdentities.add(identity)
      const declarations = packageJson["convax.hostCapabilityRequests"] ?? []
      if (
        !Array.isArray(declarations) ||
        declarations.length > maximumRequirementsPerPackage ||
        new Set(declarations).size !== declarations.length
      ) {
        throw new Error(
          `${kind}/${id} package.json: convax.hostCapabilityRequests must contain at most ${maximumRequirementsPerPackage} unique ids`,
        )
      }
      for (const value of declarations) {
        const requirementId = policyId(
          value,
          `${kind}/${id} automated requirement`,
        )
        const affected = declarationsByRequirement.get(requirementId) ?? []
        affected.push(identity)
        declarationsByRequirement.set(requirementId, affected)
      }
    }
  }
  const requestDirectory = path.join(
    workspaceRoot,
    "docs",
    "host-capability-requests",
  )
  const requestDocuments = (
    await fs.readdir(requestDirectory, { withFileTypes: true }).catch((cause) => {
      if (cause?.code === "ENOENT") return []
      throw cause
    })
  )
    .filter((entry) => entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort()
  return { declarationsByRequirement, packageIdentities, requestDocuments }
}

function requireCommit(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{40,64}$/u.test(value)) {
    throw new Error("Host capability governance base must be one exact commit SHA")
  }
  return value
}

function git(workspaceRoot, args, options = {}) {
  return execFileSync("git", args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: options.quiet ? ["ignore", "pipe", "ignore"] : ["ignore", "pipe", "pipe"],
  })
}

function readBasePolicy(workspaceRoot, baseCommit) {
  try {
    git(workspaceRoot, ["cat-file", "-e", `${baseCommit}:${policyPath}`], { quiet: true })
  } catch {
    return emptyPolicy
  }
  const source = git(workspaceRoot, ["show", `${baseCommit}:${policyPath}`])
  let value
  try {
    value = JSON.parse(source)
  } catch (cause) {
    throw new Error(`protected base ${policyPath} is not valid JSON`, { cause })
  }
  return parseHostCapabilityPolicy(value, `protected base ${policyPath}`)
}

async function readCurrentPolicyValue(workspaceRoot) {
  let value
  try {
    value = JSON.parse(
      await fs.readFile(path.join(workspaceRoot, policyPath), "utf8"),
    )
  } catch (cause) {
    throw new Error(`current ${policyPath} is not valid JSON`, { cause })
  }
  return value
}

function readBaseFile(workspaceRoot, baseCommit, relativePath) {
  return git(workspaceRoot, ["show", `${baseCommit}:${relativePath}`])
}

export async function verifyPendingHostCapabilityHistory(
  workspaceRoot,
  baseInput,
  options = {},
) {
  const baseCommit = requireCommit(baseInput)
  git(workspaceRoot, ["rev-parse", "--verify", `${baseCommit}^{commit}`])
  git(workspaceRoot, ["merge-base", "--is-ancestor", baseCommit, "HEAD"])
  const [basePolicy, currentPolicyValue] = await Promise.all([
    Promise.resolve(readBasePolicy(workspaceRoot, baseCommit)),
    readCurrentPolicyValue(workspaceRoot),
  ])
  if (currentPolicyValue?.schema === automatedPolicySchema) {
    if (!options.catalogPath) {
      throw new Error("automated Host capability policy requires --catalog")
    }
    const catalog = await readJsonFile(
      path.resolve(workspaceRoot, options.catalogPath),
      "candidate Plugin API Catalog",
    )
    const currentPolicy = parseAutomatedHostCapabilityPolicy(
      currentPolicyValue,
      catalog,
      `current ${policyPath}`,
    )
    const transition = assertAutomatedHostCapabilityTransition(
      basePolicy,
      currentPolicy,
      await inspectAutomatedWorkspace(workspaceRoot),
    )
    return {
      automatedTransition: true,
      baseCommit,
      resolvedRequests: 0,
      retainedRequests: basePolicy.requests.length,
      ...transition,
    }
  }
  const currentPolicy = parseHostCapabilityPolicy(
    currentPolicyValue,
    `current ${policyPath}`,
  )
  const baseSemanticDigests = new Map(
    basePolicy.requests.map((request) => [
      request.id,
      hostCapabilityRequestSemanticDigest(
        readBaseFile(workspaceRoot, baseCommit, request.document),
      ),
    ]),
  )
  const currentSemanticDigests = new Map(
    await Promise.all(
      currentPolicy.requests.map(async (request) => [
        request.id,
        hostCapabilityRequestSemanticDigest(
          await fs.readFile(path.join(workspaceRoot, request.document), "utf8"),
        ),
      ]),
    ),
  )
  const currentResolutions = new Map(
    currentPolicy.resolutions.map((resolution) => [resolution.id, resolution]),
  )
  const verifiedReceipts = new Map()
  for (const baseRequest of basePolicy.requests) {
    if (currentPolicy.requests.some((request) => request.id === baseRequest.id)) {
      continue
    }
    const resolution = currentResolutions.get(baseRequest.id)
    if (!resolution) continue
    if (!options.catalogPath) {
      throw new Error(
        `pending Host capability request ${baseRequest.id} resolution requires --catalog`,
      )
    }
    const receipt = await acquireAndVerifyHostCapabilityDecisionReceipt({
      acceptedApiContracts: baseRequest.acceptedApiContracts,
      affected: baseRequest.affected.map(affectedKey),
      attestationDirectory: options.attestationDirectory,
      catalogPath: path.resolve(workspaceRoot, options.catalogPath),
      receiptDirectory: options.receiptDirectory,
      receiptReference: resolution.receipt,
      requestId: baseRequest.id,
      semanticSha256: baseSemanticDigests.get(baseRequest.id),
      downloadCommand: options.downloadCommand,
      verifyCommand: options.verifyCommand,
    })
    verifiedReceipts.set(baseRequest.id, receipt)
  }
  assertPendingHostCapabilityHistory(basePolicy, currentPolicy, {
    base: baseSemanticDigests,
    current: currentSemanticDigests,
  }, verifiedReceipts)
  return {
    baseCommit,
    resolvedRequests: verifiedReceipts.size,
    retainedRequests: basePolicy.requests.length,
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const parsed = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    if (
      !["--attestation-directory", "--base", "--catalog", "--receipt-directory", "--workspace"].includes(
        key,
      ) ||
      !value ||
      parsed[key]
    ) {
      throw new Error(
        "Usage: host-capability-history --base <protected-commit-sha> [--workspace <candidate-root>] [--catalog <plugin-api.json>] [--receipt-directory <downloaded-receipts>] [--attestation-directory <downloaded-bundles>]",
      )
    }
    parsed[key] = value
  }
  if (!parsed["--base"]) {
    throw new Error(
      "Usage: host-capability-history --base <protected-commit-sha> [--workspace <candidate-root>] [--catalog <plugin-api.json>] [--receipt-directory <downloaded-receipts>] [--attestation-directory <downloaded-bundles>]",
    )
  }
  const workspaceRoot = parsed["--workspace"]
    ? path.resolve(parsed["--workspace"])
    : path.resolve(fileURLToPath(new URL("..", import.meta.url)))
  const result = await verifyPendingHostCapabilityHistory(
    workspaceRoot,
    parsed["--base"],
    {
      attestationDirectory: parsed["--attestation-directory"],
      catalogPath: parsed["--catalog"],
      receiptDirectory: parsed["--receipt-directory"],
    },
  )
  process.stdout.write(result.automatedTransition
    ? `Verified one protected /2 to automated /3 transition from ${result.baseCommit}: ${result.requirements} requirements and ${result.technicalBlockers} technical blocker policies.\n`
    : `Verified ${result.retainedRequests} protected Host capability request obligation${result.retainedRequests === 1 ? "" : "s"} from ${result.baseCommit}; ${result.resolvedRequests} resolved by immutable protected receipt.\n`)
}
