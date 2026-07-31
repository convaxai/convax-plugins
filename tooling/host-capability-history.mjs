import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  parseHostCapabilityPolicy,
} from "./lib.mjs"
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

async function readCurrentPolicy(workspaceRoot) {
  let value
  try {
    value = JSON.parse(
      await fs.readFile(path.join(workspaceRoot, policyPath), "utf8"),
    )
  } catch (cause) {
    throw new Error(`current ${policyPath} is not valid JSON`, { cause })
  }
  return parseHostCapabilityPolicy(value, `current ${policyPath}`)
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
  const [basePolicy, currentPolicy] = await Promise.all([
    Promise.resolve(readBasePolicy(workspaceRoot, baseCommit)),
    readCurrentPolicy(workspaceRoot),
  ])
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
  process.stdout.write(
    `Verified ${result.retainedRequests} protected Host capability request obligation${result.retainedRequests === 1 ? "" : "s"} from ${result.baseCommit}; ${result.resolvedRequests} resolved by immutable protected receipt.\n`,
  )
}
