import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  loadPublicationPolicy,
  parseHostCapabilityPolicy,
} from "./lib.mjs"
import {
  hostCapabilityRequestSemanticDigest,
} from "./host-capability-request.mjs"

const policyPath = "registry/host-capability-policy.json"
const emptyPolicy = Object.freeze({
  requests: Object.freeze([]),
  schema: "convax.host-capability-policy/1",
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
) {
  const currentById = requestById(currentPolicy)
  for (const baseRequest of basePolicy.requests) {
    const currentRequest = currentById.get(baseRequest.id)
    if (!currentRequest) {
      throw new Error(
        `pending Host capability request ${baseRequest.id} cannot be removed without a protected external human-decision receipt`,
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
      baseDigest !== currentDigest
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

function readBaseFile(workspaceRoot, baseCommit, relativePath) {
  return git(workspaceRoot, ["show", `${baseCommit}:${relativePath}`])
}

export async function verifyPendingHostCapabilityHistory(workspaceRoot, baseInput) {
  const baseCommit = requireCommit(baseInput)
  git(workspaceRoot, ["rev-parse", "--verify", `${baseCommit}^{commit}`])
  git(workspaceRoot, ["merge-base", "--is-ancestor", baseCommit, "HEAD"])
  const [basePolicy, currentPolicy] = await Promise.all([
    Promise.resolve(readBasePolicy(workspaceRoot, baseCommit)),
    loadPublicationPolicy(workspaceRoot),
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
  assertPendingHostCapabilityHistory(basePolicy, currentPolicy, {
    base: baseSemanticDigests,
    current: currentSemanticDigests,
  })
  return {
    baseCommit,
    retainedRequests: basePolicy.requests.length,
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  if (args.length !== 2 || args[0] !== "--base") {
    throw new Error("Usage: host-capability-history --base <protected-commit-sha>")
  }
  const workspaceRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
  const result = await verifyPendingHostCapabilityHistory(workspaceRoot, args[1])
  process.stdout.write(
    `Verified ${result.retainedRequests} protected pending Host capability request obligation${result.retainedRequests === 1 ? "" : "s"} from ${result.baseCommit}.\n`,
  )
}
