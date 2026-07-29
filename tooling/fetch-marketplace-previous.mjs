import { promises as fs } from "node:fs"
import path from "node:path"

const maximumBytes = 8 * 1024 * 1024

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

function parseSequenceInput(bytes, mode, parser) {
  let registry
  try {
    registry = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch (cause) {
    throw new Error(`${mode} is not valid UTF-8 JSON`, { cause })
  }
  try {
    registry = parser(registry)
  } catch (cause) {
    throw new Error(`${mode} strict validation failed`, { cause })
  }
  const revisionPattern = mode === "v2" ? /^[a-f0-9]{64}$/ : /^[a-f0-9]{40}$/
  if (
    !registry ||
    typeof registry !== "object" ||
    registry.schema !== `convax.registry/${mode === "v2" ? "2" : "1"}` ||
    !Number.isSafeInteger(registry.sequence) ||
    registry.sequence <= 0 ||
    typeof registry.revision !== "string" ||
    !revisionPattern.test(registry.revision) ||
    !Array.isArray(registry.packages) ||
    (mode === "v2" && registry.marketplaceId !== "convax-official")
  ) {
    throw new Error(`${mode} is not a strict sequence input`)
  }
  return registry
}

async function fetchExact(fetchImpl, url, label) {
  return fetchImpl(url, {
    headers: { accept: "application/json" },
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
  parseV1,
  parseV2,
  v1ShowcaseUrl,
  v1Url,
  v2ShowcaseUrl,
  v2Url,
}) {
  if (typeof parseV1 !== "function" || typeof parseV2 !== "function") {
    throw new Error("strict Registry v1 and v2 parsers are required")
  }
  const v2Response = await fetchExact(fetchImpl, v2Url, "production Registry v2")
  if (v2Response.status === 200) {
    const bytes = await responseBytes(v2Response, "production Registry v2")
    const registry = parseSequenceInput(bytes, "v2", parseV2)
    const snapshot = await writeSnapshot(outputDirectory, "registry-v2.json", bytes)
    const descriptorResponse = await fetchExact(fetchImpl, descriptorUrl, "production Marketplace descriptor")
    if (descriptorResponse.status !== 200) {
      throw new Error(`production Marketplace descriptor returned HTTP ${descriptorResponse.status}`)
    }
    const descriptorSnapshot = await writeSnapshot(
      outputDirectory,
      "marketplace.json",
      await responseBytes(descriptorResponse, "production Marketplace descriptor"),
    )
    const showcaseResponse = await fetchExact(fetchImpl, v2ShowcaseUrl, "production Showcase v2")
    if (showcaseResponse.status !== 200) {
      throw new Error(`production Showcase v2 returned HTTP ${showcaseResponse.status}`)
    }
    const showcaseSnapshot = await writeSnapshot(
      outputDirectory,
      "showcase-v2.json",
      await responseBytes(showcaseResponse, "production Showcase v2"),
    )
    const legacyRegistryResponse = await fetchExact(fetchImpl, v1Url, "production legacy Registry v1")
    if (legacyRegistryResponse.status !== 200) {
      throw new Error(`production legacy Registry v1 returned HTTP ${legacyRegistryResponse.status}`)
    }
    const legacyRegistryBytes = await responseBytes(legacyRegistryResponse, "production legacy Registry v1")
    const legacyRegistry = parseSequenceInput(legacyRegistryBytes, "v1", parseV1)
    if (legacyRegistry.sequence !== registry.sequence) {
      throw new Error("production Registry v1 and v2 sequences differ")
    }
    const legacyRegistrySnapshot = await writeSnapshot(
      outputDirectory,
      "registry-v1.json",
      legacyRegistryBytes,
    )
    const legacyShowcaseResponse = await fetchExact(fetchImpl, v1ShowcaseUrl, "production legacy Showcase v1")
    if (legacyShowcaseResponse.status !== 200) {
      throw new Error(`production legacy Showcase v1 returned HTTP ${legacyShowcaseResponse.status}`)
    }
    const legacyShowcaseSnapshot = await writeSnapshot(
      outputDirectory,
      "showcase-v1.json",
      await responseBytes(legacyShowcaseResponse, "production legacy Showcase v1"),
    )
    return {
      mode: "v2",
      registry,
      snapshot,
      baseRevision: legacyRegistry.revision,
      descriptorSnapshot,
      legacyRegistrySnapshot,
      legacyShowcaseSnapshot,
      showcaseSnapshot,
    }
  }
  if (v2Response.status !== 404) {
    throw new Error(`production Registry v2 returned HTTP ${v2Response.status}`)
  }

  const v1Response = await fetchExact(fetchImpl, v1Url, "production Registry v1 bootstrap")
  if (v1Response.status !== 200) {
    throw new Error(`production Registry v1 bootstrap returned HTTP ${v1Response.status}`)
  }
  const bytes = await responseBytes(v1Response, "production Registry v1 bootstrap")
  const registry = parseSequenceInput(bytes, "v1", parseV1)
  const snapshot = await writeSnapshot(outputDirectory, "registry-v1.json", bytes)
  const showcaseResponse = await fetchExact(fetchImpl, v1ShowcaseUrl, "production Showcase v1 bootstrap")
  if (showcaseResponse.status !== 200) {
    throw new Error(`production Showcase v1 bootstrap returned HTTP ${showcaseResponse.status}`)
  }
  const showcaseSnapshot = await writeSnapshot(
    outputDirectory,
    "showcase-v1.json",
    await responseBytes(showcaseResponse, "production Showcase v1 bootstrap"),
  )
  return { mode: "bootstrap-v1", registry, snapshot, baseRevision: registry.revision, showcaseSnapshot }
}

async function main() {
  const kit = await import("@convax/marketplace-kit")
  const run = encodeURIComponent(process.env.GITHUB_RUN_ID ?? "local")
  const result = await fetchPreviousRegistry({
    descriptorUrl: `https://microvoid.github.io/convax-plugins/marketplace.json?run=${run}`,
    outputDirectory: path.resolve("dist/production"),
    parseV1: kit.parseRegistryV1,
    parseV2: kit.parseRegistryV2,
    v1ShowcaseUrl: `https://microvoid.github.io/convax-plugins/showcase/v1/index.json?run=${run}`,
    v1Url: `https://microvoid.github.io/convax-plugins/registry/v1/index.json?run=${run}`,
    v2ShowcaseUrl: `https://microvoid.github.io/convax-plugins/showcase/v2/index.json?run=${run}`,
    v2Url: `https://microvoid.github.io/convax-plugins/registry/v2/index.json?run=${run}`,
  })
  const environment = process.env.GITHUB_ENV
  if (!environment) throw new Error("GITHUB_ENV is required for the publication workflow")
  const variable = result.mode === "v2"
    ? "CONVAX_MARKETPLACE_PREVIOUS"
    : "CONVAX_MARKETPLACE_BOOTSTRAP_PREVIOUS_V1"
  const lines = [
    `${variable}=${path.relative(process.cwd(), result.snapshot)}`,
    `CONVAX_MARKETPLACE_BASE_SHA=${result.baseRevision}`,
    `CONVAX_MARKETPLACE_PREVIOUS_DESCRIPTOR=${
      result.mode === "v2" ? path.relative(process.cwd(), result.descriptorSnapshot) : "marketplace.json"
    }`,
    `${
      result.mode === "v2"
        ? "CONVAX_MARKETPLACE_PREVIOUS_SHOWCASE"
        : "CONVAX_MARKETPLACE_PREVIOUS_SHOWCASE_V1"
    }=${path.relative(process.cwd(), result.showcaseSnapshot)}`,
  ]
  if (result.mode === "v2") {
    lines.push(
      `CONVAX_MARKETPLACE_PREVIOUS_V1=${path.relative(process.cwd(), result.legacyRegistrySnapshot)}`,
      `CONVAX_MARKETPLACE_PREVIOUS_SHOWCASE_V1=${path.relative(process.cwd(), result.legacyShowcaseSnapshot)}`,
    )
  }
  await fs.appendFile(environment, `${lines.join("\n")}\n`)
  console.log(
    result.mode === "v2"
      ? `Using strict production Registry v2 sequence ${result.registry.sequence}.`
      : `Bootstrapping Registry v2 from strict Registry v1 sequence ${result.registry.sequence}.`,
  )
}

if (import.meta.main) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
