import { promises as fs } from "node:fs"
import path from "node:path"
import { parseRegistryV2 } from "@convax/marketplace-kit"
import { assertOfficialMarketplaceDescriptor } from "./official-marketplace.mjs"

const maximumBytes = 8 * 1024 * 1024
const retiredRegistryV1Url =
  "https://microvoid.github.io/convax-plugins/registry/v1/index.json"

async function responseBytes(response, label) {
  const declared = response.headers.get("content-length")
  if (declared !== null) {
    const size = Number(declared)
    if (!Number.isSafeInteger(size) || size < 0 || size > maximumBytes) {
      throw new Error(`${label} exceeds the 8 MiB limit`)
    }
  }
  if (!response.body) throw new Error(`${label} has no response body`)
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maximumBytes) {
      await reader.cancel()
      throw new Error(`${label} exceeds the 8 MiB limit`)
    }
    chunks.push(value)
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch (cause) {
    throw new Error(`${label} is not valid UTF-8 JSON`, { cause })
  }
}

function parseRegistryInput(bytes) {
  let registry
  try {
    registry = parseRegistryV2(parseJson(bytes, "production Registry v2"))
  } catch (cause) {
    throw new Error("production Registry v2 strict validation failed", { cause })
  }
  if (
    !registry ||
    typeof registry !== "object" ||
    registry.schema !== "convax.registry/2" ||
    registry.marketplaceId !== "convax-official" ||
    !Number.isSafeInteger(registry.sequence) ||
    registry.sequence <= 0 ||
    typeof registry.revision !== "string" ||
    !/^[a-f0-9]{64}$/.test(registry.revision) ||
    !Array.isArray(registry.packages)
  ) {
    throw new Error("production Registry v2 is not a strict sequence input")
  }
  return registry
}

function parseDescriptorInput(bytes) {
  const descriptor = parseJson(bytes, "production Marketplace descriptor")
  let normalized = descriptor
  if (
    descriptor &&
    typeof descriptor === "object" &&
    !Array.isArray(descriptor) &&
    descriptor.registry &&
    typeof descriptor.registry === "object" &&
    !Array.isArray(descriptor.registry) &&
    Object.hasOwn(descriptor.registry, "v1")
  ) {
    const registryKeys = Object.keys(descriptor.registry).sort()
    const legacy = descriptor.registry.v1
    if (
      registryKeys.join(",") !== "v1,v2" ||
      !legacy ||
      typeof legacy !== "object" ||
      Array.isArray(legacy) ||
      Object.keys(legacy).join(",") !== "url" ||
      legacy.url !== retiredRegistryV1Url
    ) {
      throw new Error("production Marketplace descriptor has an invalid retired Registry v1 pointer")
    }
    normalized = {
      ...descriptor,
      registry: {
        v2: descriptor.registry.v2,
      },
    }
  }
  try {
    assertOfficialMarketplaceDescriptor(normalized)
  } catch (cause) {
    throw new Error("production Marketplace descriptor strict validation failed", { cause })
  }
  return {
    descriptor: normalized,
    snapshotBytes:
      normalized === descriptor
        ? bytes
        : new TextEncoder().encode(`${JSON.stringify(normalized, null, 2)}\n`),
  }
}

function parseShowcaseInput(bytes, registry) {
  const showcase = parseJson(bytes, "production Showcase v2")
  const keys = Object.keys(showcase ?? {}).sort()
  if (
    !showcase ||
    typeof showcase !== "object" ||
    Array.isArray(showcase) ||
    keys.join(",") !== "marketplaceId,packages,revision,schema" ||
    showcase.schema !== "convax.showcase/2" ||
    showcase.marketplaceId !== registry.marketplaceId ||
    showcase.revision !== registry.revision ||
    !Array.isArray(showcase.packages) ||
    showcase.packages.length > registry.packages.length
  ) {
    throw new Error("production Showcase v2 is not a strict Registry-bound input")
  }
  const registryVersions = new Map(
    registry.packages.map((entry) => [`${entry.kind}\0${entry.id}`, entry.version]),
  )
  const identities = new Set()
  for (const entry of showcase.packages) {
    const identity = `${entry?.kind}\0${entry?.id}`
    if (
      typeof entry?.kind !== "string" ||
      typeof entry.id !== "string" ||
      typeof entry.version !== "string" ||
      identities.has(identity) ||
      registryVersions.get(identity) !== entry.version
    ) {
      throw new Error("production Showcase v2 package set is not a Registry subset")
    }
    identities.add(identity)
  }
  return showcase
}

async function fetchExact(fetchImpl, url, label) {
  return fetchImpl(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "cache-control": "no-cache",
    },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  }).catch((cause) => {
    throw new Error(`${label} fetch failed`, { cause })
  })
}

async function writeSnapshot(outputDirectory, name, bytes) {
  await fs.mkdir(outputDirectory, { recursive: true })
  const output = path.join(outputDirectory, name)
  const temporary = `${output}.tmp-${process.pid}`
  await fs.writeFile(temporary, bytes, { mode: 0o600 })
  await fs.rename(temporary, output)
  return output
}

export async function fetchPreviousRegistry({
  descriptorUrl,
  fetchImpl = fetch,
  outputDirectory,
  showcaseUrl,
  registryUrl,
}) {
  const descriptorResponse = await fetchExact(
    fetchImpl,
    descriptorUrl,
    "production Marketplace descriptor",
  )
  if (descriptorResponse.status !== 200) {
    throw new Error(`production Marketplace descriptor returned HTTP ${descriptorResponse.status}`)
  }
  const descriptorBytes = await responseBytes(
    descriptorResponse,
    "production Marketplace descriptor",
  )
  const {
    descriptor,
    snapshotBytes: descriptorSnapshotBytes,
  } = parseDescriptorInput(descriptorBytes)
  if (descriptor.registry.v2.url !== registryUrl || descriptor.showcase.v2.url !== showcaseUrl) {
    throw new Error("production Marketplace descriptor URLs differ from the pinned Official closure")
  }

  const registryResponse = await fetchExact(fetchImpl, registryUrl, "production Registry v2")
  if (registryResponse.status !== 200) {
    throw new Error(`production Registry v2 returned HTTP ${registryResponse.status}`)
  }
  const registryBytes = await responseBytes(registryResponse, "production Registry v2")
  const registry = parseRegistryInput(registryBytes)

  const showcaseResponse = await fetchExact(fetchImpl, showcaseUrl, "production Showcase v2")
  if (showcaseResponse.status !== 200) {
    throw new Error(`production Showcase v2 returned HTTP ${showcaseResponse.status}`)
  }
  const showcaseBytes = await responseBytes(showcaseResponse, "production Showcase v2")
  parseShowcaseInput(showcaseBytes, registry)

  const descriptorSnapshot = await writeSnapshot(
    outputDirectory,
    "marketplace.json",
    descriptorSnapshotBytes,
  )
  const snapshot = await writeSnapshot(outputDirectory, "registry-v2.json", registryBytes)
  const showcaseSnapshot = await writeSnapshot(
    outputDirectory,
    "showcase-v2.json",
    showcaseBytes,
  )
  return {
    registry,
    snapshot,
    baseRevision: `registry-v2-${registry.revision}`,
    descriptorSnapshot,
    showcaseSnapshot,
  }
}

async function main() {
  const run = encodeURIComponent(process.env.GITHUB_RUN_ID ?? "local")
  const registryUrl = "https://microvoid.github.io/convax-plugins/registry/v2/index.json"
  const showcaseUrl = "https://microvoid.github.io/convax-plugins/showcase/v2/index.json"
  const result = await fetchPreviousRegistry({
    descriptorUrl: `https://microvoid.github.io/convax-plugins/marketplace.json?run=${run}`,
    outputDirectory: path.resolve("dist/production"),
    registryUrl,
    showcaseUrl,
  })
  const environment = process.env.GITHUB_ENV
  if (!environment) throw new Error("GITHUB_ENV is required for the publication workflow")
  const lines = [
    `CONVAX_MARKETPLACE_PREVIOUS=${path.relative(process.cwd(), result.snapshot)}`,
    `CONVAX_MARKETPLACE_BASE_SHA=${result.baseRevision}`,
    `CONVAX_MARKETPLACE_PREVIOUS_DESCRIPTOR=${path.relative(process.cwd(), result.descriptorSnapshot)}`,
    `CONVAX_MARKETPLACE_PREVIOUS_SHOWCASE=${path.relative(process.cwd(), result.showcaseSnapshot)}`,
  ]
  await fs.appendFile(environment, `${lines.join("\n")}\n`)
  console.log(`Using strict production Registry v2 sequence ${result.registry.sequence}.`)
}

if (import.meta.main) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
