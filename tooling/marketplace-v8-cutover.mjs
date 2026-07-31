import { createHash } from "node:crypto"

export const officialV8CutoverBaseline = Object.freeze({
  marketplaceId: "convax-official",
  sequence: 55,
  revision: "47c67a00afd6d3d5aba9373eab742f14597100945ef4d29873ff799bc001521f",
})

const itemKinds = new Set(["plugin", "skill", "mcp-server"])
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/
const versionPattern = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,254}$/
const semverPattern =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareSemver(left, right) {
  const leftMatch = semverPattern.exec(left)
  const rightMatch = semverPattern.exec(right)
  if (!leftMatch || !rightMatch) {
    throw new Error("Plugin and Skill cutover versions must use SemVer")
  }
  for (let index = 1; index <= 3; index += 1) {
    const leftPart = BigInt(leftMatch[index])
    const rightPart = BigInt(rightMatch[index])
    if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1
  }
  const leftPrerelease = leftMatch[4]?.split(".")
  const rightPrerelease = rightMatch[4]?.split(".")
  if (!leftPrerelease && !rightPrerelease) return 0
  if (!leftPrerelease) return 1
  if (!rightPrerelease) return -1
  for (
    let index = 0;
    index < Math.max(leftPrerelease.length, rightPrerelease.length);
    index += 1
  ) {
    const leftPart = leftPrerelease[index]
    const rightPart = rightPrerelease[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue
    const leftNumeric = /^(0|[1-9][0-9]*)$/.test(leftPart)
    const rightNumeric = /^(0|[1-9][0-9]*)$/.test(rightPart)
    if (leftNumeric && rightNumeric) {
      return BigInt(leftPart) < BigInt(rightPart) ? -1 : 1
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return compareAscii(leftPart, rightPart)
  }
  return 0
}

export function parsePinnedV8CutoverRegistry(
  value,
  expected = officialV8CutoverBaseline,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("cutover Registry must be an object")
  }
  const keys = Object.keys(value).sort()
  if (keys.join(",") !== "marketplaceId,packages,revision,schema,sequence") {
    throw new Error("cutover Registry has unsupported or missing fields")
  }
  if (
    value.schema !== "convax.registry/2" ||
    value.marketplaceId !== expected.marketplaceId ||
    value.sequence !== expected.sequence ||
    value.revision !== expected.revision ||
    !Array.isArray(value.packages) ||
    value.packages.length < 1 ||
    value.packages.length > 16_384
  ) {
    throw new Error("cutover Registry does not match the pinned production baseline")
  }
  if (sha256(canonicalJson(value.packages)) !== value.revision) {
    throw new Error("cutover Registry package bytes do not match its revision")
  }
  const identities = new Set()
  const packages = value.packages.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("cutover Registry package must be an object")
    }
    if (
      typeof entry.kind !== "string" ||
      !itemKinds.has(entry.kind) ||
      typeof entry.id !== "string" ||
      !idPattern.test(entry.id) ||
      typeof entry.version !== "string" ||
      !versionPattern.test(entry.version)
    ) {
      throw new Error("cutover Registry package identity or version is invalid")
    }
    const identity = `${entry.kind}\0${entry.id}`
    if (identities.has(identity)) {
      throw new Error(`cutover Registry duplicates ${entry.kind}/${entry.id}`)
    }
    identities.add(identity)
    return {
      kind: entry.kind,
      id: entry.id,
      version: entry.version,
    }
  })
  return {
    schema: value.schema,
    marketplaceId: value.marketplaceId,
    sequence: value.sequence,
    revision: value.revision,
    packages,
  }
}

export function createV8CutoverSelections(previousRegistry, current) {
  const previousByIdentity = new Map(
    previousRegistry.packages.map((entry) => [
      `${entry.kind}\0${entry.id}`,
      entry,
    ]),
  )
  for (const identity of previousByIdentity.keys()) {
    if (!current.has(identity)) {
      throw new Error(
        `v8 cutover cannot silently remove ${identity.replace("\0", "/")}`,
      )
    }
  }
  return [...current.entries()]
    .sort(([left], [right]) => compareAscii(left, right))
    .map(([identity, entry]) => {
      const previous = previousByIdentity.get(identity)
      if (previous) {
        const advanced = entry.kind === "mcp-server"
          ? entry.version !== previous.version
          : compareSemver(entry.version, previous.version) > 0
        if (!advanced) {
          throw new Error(
            `v8 cutover ${entry.kind}/${entry.id} version must advance beyond ${previous.version}`,
          )
        }
      }
      return {
        kind: entry.kind,
        id: entry.id,
        version: entry.version,
        ...(previous ? { previousVersion: previous.version } : {}),
        releaseTag: entry.releaseTag,
      }
    })
}
