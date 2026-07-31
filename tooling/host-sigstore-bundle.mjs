import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

export const hostSigstoreVerificationSchema =
  "convax.host-sigstore-verification/1"

const bundleMediaType =
  "application/vnd.dev.sigstore.bundle.v0.3+json"
const githubOidcIssuer = "https://token.actions.githubusercontent.com"
const githubHostedRunner = "github-hosted"
const hostOwner = "microvoid"
const hostRepository = "microvoid/convax"
const hostRepositoryId = 1293264965
const hostOwnerId = 125447777
const hostRepositoryUri = `https://github.com/${hostRepository}`
const hostOwnerUri = `https://github.com/${hostOwner}`
const hostRef = "refs/heads/convax-next"
const shaPattern = /^[a-f0-9]{40}$/u
const safeAssetPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u
const allowedWorkflowRefs = new Set([
  `${hostRepository}/.github/workflows/plugin-api-release.yml@${hostRef}`,
  `${hostRepository}/.github/workflows/plugin-sdk-release.yml@${hostRef}`,
])

const fulcioOids = Object.freeze({
  issuer: "1.3.6.1.4.1.57264.1.8",
  buildSignerUri: "1.3.6.1.4.1.57264.1.9",
  runnerEnvironment: "1.3.6.1.4.1.57264.1.11",
  sourceRepositoryUri: "1.3.6.1.4.1.57264.1.12",
  sourceRepositoryDigest: "1.3.6.1.4.1.57264.1.13",
  sourceRepositoryRef: "1.3.6.1.4.1.57264.1.14",
  sourceRepositoryIdentifier: "1.3.6.1.4.1.57264.1.15",
  sourceRepositoryOwnerUri: "1.3.6.1.4.1.57264.1.16",
  sourceRepositoryOwnerIdentifier: "1.3.6.1.4.1.57264.1.17",
  buildTrigger: "1.3.6.1.4.1.57264.1.20",
})

function fail(message) {
  throw new Error(`Host Sigstore bundle: ${message}`)
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function cleanString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a non-empty string`)
  }
  return value
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(`${label} must be a positive safe integer`)
  }
  return value
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

function canonicalJson(value) {
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

function readTlv(bytes, offset, boundary = bytes.length) {
  if (offset < 0 || offset >= boundary) fail("certificate contains truncated DER")
  const tag = bytes[offset]
  const firstLength = bytes[offset + 1]
  if (firstLength === undefined) fail("certificate contains truncated DER length")
  let headerLength = 2
  let length = firstLength
  if ((firstLength & 0x80) !== 0) {
    const lengthBytes = firstLength & 0x7f
    if (lengthBytes === 0 || lengthBytes > 4) {
      fail("certificate contains unsupported DER length")
    }
    if (offset + 2 + lengthBytes > boundary) {
      fail("certificate contains truncated DER length")
    }
    length = 0
    for (let index = 0; index < lengthBytes; index += 1) {
      const byte = bytes[offset + 2 + index]
      if (index === 0 && byte === 0) fail("certificate DER length is not minimal")
      length = length * 256 + byte
    }
    if (length < 128) fail("certificate DER length is not minimal")
    headerLength += lengthBytes
  }
  const contentStart = offset + headerLength
  const end = contentStart + length
  if (end > boundary) fail("certificate contains truncated DER value")
  return { tag, start: offset, contentStart, end }
}

function children(bytes, parent) {
  const result = []
  let offset = parent.contentStart
  while (offset < parent.end) {
    const child = readTlv(bytes, offset, parent.end)
    result.push(child)
    offset = child.end
  }
  if (offset !== parent.end) fail("certificate contains malformed DER children")
  return result
}

function decodeOid(bytes, item) {
  if (item.tag !== 0x06 || item.contentStart === item.end) {
    fail("certificate extension has an invalid OID")
  }
  const content = bytes.subarray(item.contentStart, item.end)
  const first = content[0]
  const parts = [Math.min(2, Math.floor(first / 40)), 0]
  parts[1] = first - parts[0] * 40
  let value = 0
  let open = false
  for (const byte of content.subarray(1)) {
    if (value > Math.floor(Number.MAX_SAFE_INTEGER / 128)) {
      fail("certificate extension OID is too large")
    }
    value = value * 128 + (byte & 0x7f)
    open = (byte & 0x80) !== 0
    if (!open) {
      parts.push(value)
      value = 0
    }
  }
  if (open) fail("certificate extension OID is truncated")
  return parts.join(".")
}

function decodeFulcioValue(bytes, item, oid) {
  if (item.tag !== 0x04) {
    fail(`certificate extension ${oid} must use an OCTET STRING`)
  }
  const inner = readTlv(bytes, item.contentStart, item.end)
  if (inner.end !== item.end || (inner.tag !== 0x0c && inner.tag !== 0x16)) {
    fail(`certificate extension ${oid} must contain one UTF-8 or IA5 string`)
  }
  let value
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(inner.contentStart, inner.end),
    )
  } catch {
    fail(`certificate extension ${oid} is not valid UTF-8`)
  }
  if (value.length === 0 || value.length > 2048) {
    fail(`certificate extension ${oid} has an invalid bounded string`)
  }
  return value
}

export function extractFulcioClaims(certificateBytes) {
  if (
    !Buffer.isBuffer(certificateBytes) ||
    certificateBytes.length === 0 ||
    certificateBytes.length > 65536
  ) {
    fail("certificate must be a bounded DER byte buffer")
  }
  const certificate = readTlv(certificateBytes, 0)
  if (certificate.tag !== 0x30 || certificate.end !== certificateBytes.length) {
    fail("certificate must contain one DER sequence")
  }
  const certificateChildren = children(certificateBytes, certificate)
  if (certificateChildren.length !== 3 || certificateChildren[0].tag !== 0x30) {
    fail("certificate has an invalid X.509 structure")
  }
  const tbsChildren = children(certificateBytes, certificateChildren[0])
  const extensionWrappers = tbsChildren.filter((item) => item.tag === 0xa3)
  if (extensionWrappers.length !== 1) {
    fail("certificate must contain exactly one X.509 extensions field")
  }
  const wrapperChildren = children(certificateBytes, extensionWrappers[0])
  if (wrapperChildren.length !== 1 || wrapperChildren[0].tag !== 0x30) {
    fail("certificate extensions field is malformed")
  }
  const relevantOids = new Set(Object.values(fulcioOids))
  const claims = {}
  for (const extension of children(certificateBytes, wrapperChildren[0])) {
    if (extension.tag !== 0x30) fail("certificate extension must be a sequence")
    const fields = children(certificateBytes, extension)
    if (fields.length < 2 || fields.length > 3) {
      fail("certificate extension has an invalid field count")
    }
    const oid = decodeOid(certificateBytes, fields[0])
    const valueIndex = fields.length === 3 ? 2 : 1
    if (fields.length === 3 && fields[1].tag !== 0x01) {
      fail(`certificate extension ${oid} has an invalid critical flag`)
    }
    if (!relevantOids.has(oid)) continue
    if (Object.hasOwn(claims, oid)) {
      fail(`certificate contains duplicate extension ${oid}`)
    }
    claims[oid] = decodeFulcioValue(certificateBytes, fields[valueIndex], oid)
  }
  return claims
}

function exactClaim(claims, key, expected) {
  const oid = fulcioOids[key]
  if (claims[oid] !== expected) {
    fail(`${key} claim must equal ${JSON.stringify(expected)}`)
  }
}

function parseRepositoryMetadata(value) {
  if (
    !isRecord(value) ||
    value.full_name !== hostRepository ||
    value.private !== true ||
    !isRecord(value.owner) ||
    value.owner.login !== hostOwner
  ) {
    fail(`repository metadata must identify the private ${hostRepository} repository`)
  }
  const id = positiveSafeInteger(value.id, "repository id")
  const ownerId = positiveSafeInteger(value.owner.id, "repository owner id")
  if (id !== hostRepositoryId || ownerId !== hostOwnerId) {
    fail(
      `repository metadata must match pinned ids ${hostRepositoryId}/${hostOwnerId}`,
    )
  }
  return { id, ownerId }
}

function decodeCertificate(bundle) {
  const encoded = bundle?.verificationMaterial?.certificate?.rawBytes
  if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) {
    fail("bundle certificate rawBytes must be strict base64")
  }
  const bytes = Buffer.from(encoded, "base64")
  if (bytes.toString("base64") !== encoded) {
    fail("bundle certificate rawBytes must use canonical base64")
  }
  return bytes
}

function decimalInteger(value, label, allowZero = false) {
  const source =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : value
  const pattern = allowZero ? /^(?:0|[1-9][0-9]*)$/u : /^[1-9][0-9]*$/u
  if (typeof source !== "string" || !pattern.test(source)) {
    fail(`${label} must be a canonical decimal integer`)
  }
  const number = Number(source)
  if (!Number.isSafeInteger(number) || (!allowZero && number <= 0)) {
    fail(`${label} exceeds the safe integer range`)
  }
  return number
}

function isBoundedBase64(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    /^[A-Za-z0-9+/]+={0,2}$/u.test(value)
  )
}

function boundedBase64(value, label) {
  if (
    !isBoundedBase64(value)
  ) {
    fail(`${label} must be bounded base64`)
  }
  return value
}

function parseTransparencyLog(bundle) {
  const entries = bundle?.verificationMaterial?.tlogEntries
  if (!Array.isArray(entries) || entries.length !== 1 || !isRecord(entries[0])) {
    fail("bundle must contain exactly one transparency log entry")
  }
  const entry = entries[0]
  const proof = entry.inclusionProof
  if (
    !isRecord(proof) ||
    !Array.isArray(proof.hashes) ||
    proof.hashes.length === 0 ||
    proof.hashes.length > 64 ||
    proof.hashes.some((hash) => !isBoundedBase64(hash)) ||
    !isBoundedBase64(proof.rootHash) ||
    typeof proof.checkpoint?.envelope !== "string" ||
    proof.checkpoint.envelope.length === 0 ||
    proof.checkpoint.envelope.length > 65536
  ) {
    fail("bundle must contain a bounded Rekor inclusion proof and checkpoint")
  }
  return {
    integratedTime: decimalInteger(
      entry.integratedTime,
      "transparency log integrated time",
    ),
    logId: boundedBase64(entry.logId?.keyId, "transparency log id"),
    logIndex: decimalInteger(
      entry.logIndex,
      "transparency log index",
      true,
    ),
    treeSize: decimalInteger(proof.treeSize, "transparency log tree size"),
  }
}

export function verifyHostSigstoreBundle({
  assetBytes,
  assetName,
  bundle,
  bundleBytes,
  commit,
  repositoryMetadata,
  trigger,
  workflowRef,
}) {
  if (!Buffer.isBuffer(assetBytes) || assetBytes.length === 0) {
    fail("asset must be a non-empty byte buffer")
  }
  if (assetBytes.length > 67108864) fail("asset exceeds 64 MiB")
  if (!safeAssetPattern.test(assetName)) fail("asset name is unsafe")
  if (
    !Buffer.isBuffer(bundleBytes) ||
    bundleBytes.length === 0 ||
    bundleBytes.length > 1048576
  ) {
    fail("bundle must be a non-empty byte buffer no larger than 1 MiB")
  }
  if (!isRecord(bundle) || bundle.mediaType !== bundleMediaType) {
    fail(`bundle mediaType must equal ${bundleMediaType}`)
  }
  if (!shaPattern.test(commit)) fail("commit must be one lowercase 40-character SHA")
  if (
    typeof workflowRef !== "string" ||
    !allowedWorkflowRefs.has(workflowRef) ||
    workflowRef.length > 512
  ) {
    fail("workflow ref must name an admitted Host release workflow on convax-next")
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(trigger)) {
    fail("trigger has an invalid bounded value")
  }
  const repository = parseRepositoryMetadata(repositoryMetadata)
  const claims = extractFulcioClaims(decodeCertificate(bundle))
  exactClaim(claims, "issuer", githubOidcIssuer)
  exactClaim(claims, "buildSignerUri", `https://github.com/${workflowRef}`)
  exactClaim(claims, "runnerEnvironment", githubHostedRunner)
  exactClaim(claims, "sourceRepositoryUri", hostRepositoryUri)
  exactClaim(claims, "sourceRepositoryDigest", commit)
  exactClaim(claims, "sourceRepositoryRef", hostRef)
  exactClaim(claims, "sourceRepositoryIdentifier", String(repository.id))
  exactClaim(claims, "sourceRepositoryOwnerUri", hostOwnerUri)
  exactClaim(
    claims,
    "sourceRepositoryOwnerIdentifier",
    String(repository.ownerId),
  )
  exactClaim(claims, "buildTrigger", trigger)
  const transparencyLog = parseTransparencyLog(bundle)
  return {
    schema: hostSigstoreVerificationSchema,
    asset: {
      name: assetName,
      sha256: sha256(assetBytes),
      size: assetBytes.length,
    },
    bundle: {
      mediaType: bundleMediaType,
      sha256: sha256(bundleBytes),
      size: bundleBytes.length,
    },
    certificate: {
      buildSignerUri: `https://github.com/${workflowRef}`,
      issuer: githubOidcIssuer,
      runnerEnvironment: githubHostedRunner,
      sourceRepositoryDigest: commit,
      sourceRepositoryIdentifier: String(repository.id),
      sourceRepositoryOwnerIdentifier: String(repository.ownerId),
      sourceRepositoryOwnerUri: hostOwnerUri,
      sourceRepositoryRef: hostRef,
      sourceRepositoryUri: hostRepositoryUri,
      trigger,
    },
    hostIdentity: {
      owner: {
        id: String(hostOwnerId),
        login: hostOwner,
        uri: hostOwnerUri,
      },
      repository: {
        fullName: hostRepository,
        id: String(hostRepositoryId),
        private: true,
        uri: hostRepositoryUri,
      },
    },
    transparencyLog,
  }
}

function parseArguments(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index]
    const value = argv[index + 1]
    if (
      !option?.startsWith("--") ||
      value === undefined ||
      Object.hasOwn(values, option.slice(2))
    ) {
      fail("arguments must be unique --name value pairs")
    }
    values[option.slice(2)] = value
  }
  const expected = [
    "asset",
    "bundle",
    "commit",
    "output",
    "repository-metadata",
    "trigger",
    "workflow-ref",
  ]
  if (
    Object.keys(values).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(values, key))
  ) {
    fail(`required arguments are ${expected.map((key) => `--${key}`).join(", ")}`)
  }
  return values
}

async function readBounded(filename, maximum, label) {
  const stat = await fs.stat(filename)
  if (!stat.isFile() || stat.size === 0 || stat.size > maximum) {
    fail(`${label} must be a non-empty file no larger than ${maximum} bytes`)
  }
  return fs.readFile(filename)
}

async function main() {
  const values = parseArguments(process.argv.slice(2))
  const [assetBytes, bundleBytes, repositoryBytes] = await Promise.all([
    readBounded(values.asset, 67108864, "asset"),
    readBounded(values.bundle, 1048576, "bundle"),
    readBounded(values["repository-metadata"], 1048576, "repository metadata"),
  ])
  let bundle
  let repositoryMetadata
  try {
    bundle = JSON.parse(bundleBytes)
    repositoryMetadata = JSON.parse(repositoryBytes)
  } catch {
    fail("bundle and repository metadata must be valid JSON")
  }
  const verification = verifyHostSigstoreBundle({
    assetBytes,
    assetName: path.basename(values.asset),
    bundle,
    bundleBytes,
    commit: values.commit,
    repositoryMetadata,
    trigger: values.trigger,
    workflowRef: values["workflow-ref"],
  })
  await fs.writeFile(values.output, `${canonicalJson(verification)}\n`, {
    flag: "wx",
  })
}

if (import.meta.main) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
