import { promises as fs } from "node:fs"
import path from "node:path"
import { parseCatalogExclusions } from "./catalog-exclusions.mjs"

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function exactKeys(value, allowed, required, label) {
  if (!isObject(value)) throw new Error(`${label}: must be an object`)
  const unknown = Object.keys(value).find((key) => !allowed.includes(key))
  if (unknown) throw new Error(`${label}: unsupported field ${unknown}`)
  const missing = required.find((key) => !Object.hasOwn(value, key))
  if (missing) throw new Error(`${label}: missing field ${missing}`)
}

export function assertOfficialMarketplaceDescriptor(descriptor) {
  exactKeys(
    descriptor,
    ["schema", "id", "name", "publisher", "repository", "registry", "showcase", "compatibility", "delivery"],
    ["schema", "id", "name", "publisher", "repository", "registry", "showcase", "compatibility", "delivery"],
    "marketplace.json",
  )
  if (descriptor.schema !== "convax.marketplace/1" || descriptor.id !== "convax-official") {
    throw new Error("marketplace.json: invalid Official identity")
  }
  exactKeys(descriptor.publisher, ["name"], ["name"], "marketplace.json publisher")
  exactKeys(descriptor.repository, ["owner", "name"], ["owner", "name"], "marketplace.json repository")
  if (descriptor.repository.owner !== "convaxai" || descriptor.repository.name !== "convax-plugins") {
    throw new Error("marketplace.json: repository must remain convaxai/convax-plugins")
  }
  exactKeys(descriptor.registry, ["v2"], ["v2"], "marketplace.json registry")
  exactKeys(descriptor.registry.v2, ["url"], ["url"], "marketplace.json registry v2")
  if (
    descriptor.registry.v2.url !==
    "https://convaxai.github.io/convax-plugins/registry/v2/index.json"
  ) {
    throw new Error("marketplace.json: Registry v2 URL must remain on the Official Pages origin")
  }
  exactKeys(descriptor.showcase, ["v2"], ["v2"], "marketplace.json showcase")
  exactKeys(descriptor.showcase.v2, ["url"], ["url"], "marketplace.json showcase v2")
  if (
    descriptor.showcase.v2.url !==
    "https://convaxai.github.io/convax-plugins/showcase/v2/index.json"
  ) {
    throw new Error("marketplace.json: Showcase v2 URL must remain on the Official Pages origin")
  }
  exactKeys(descriptor.compatibility, ["convax"], ["convax"], "marketplace.json compatibility")
  exactKeys(descriptor.delivery, ["kind"], ["kind"], "marketplace.json delivery")
  if (descriptor.delivery.kind !== "github-pages-releases") {
    throw new Error("marketplace.json: Official delivery must use GitHub Pages and Releases")
  }
}

function assertBuiltin(builtin) {
  exactKeys(builtin, ["schema", "members"], ["schema", "members"], "catalogs/builtin.json")
  if (builtin.schema !== "convax.builtin-config/1") {
    throw new Error("catalogs/builtin.json: unsupported schema")
  }
  if (
    !Array.isArray(builtin.members) ||
    builtin.members.length !== 1 ||
    builtin.members[0]?.kind !== "skill" ||
    builtin.members[0]?.id !== "canvas-storyboard"
  ) {
    throw new Error("catalogs/builtin.json: must contain only skill/canvas-storyboard")
  }
}

function assertPreinstalled(preinstalled) {
  exactKeys(preinstalled, ["schema", "packages"], ["schema", "packages"], "catalogs/preinstalled.json")
  const item = preinstalled.packages?.[0]
  if (
    preinstalled.schema !== "convax.preinstalled-config/1" ||
    preinstalled.packages?.length !== 1 ||
    item.marketplaceId !== "convax-official" ||
    item.kind !== "plugin" ||
    item.id !== "ffmpeg-tools" ||
    item.setup !== "explicit" ||
    item.targets?.length !== 1 ||
    item.targets[0] !== "darwin-arm64"
  ) {
    throw new Error("catalogs/preinstalled.json: must contain only darwin-arm64 Official ffmpeg-tools")
  }
}

export function assertOfficialMarketplaceSource(source) {
  assertOfficialMarketplaceDescriptor(source.descriptor)
  assertBuiltin(source.builtin)
  assertPreinstalled({ schema: "convax.preinstalled-config/1", packages: source.preinstalled })
  parseCatalogExclusions(
    { schema: "convax.catalog-exclusions/1", members: source.excluded },
    "catalogs/excluded.json",
  )
  const excluded = new Set(source.excluded.map(({ kind, id }) => `${kind}/${id}`))
  for (const member of source.builtin.members) {
    if (excluded.has(`${member.kind}/${member.id}`)) {
      throw new Error("catalogs/excluded.json: Builtin members cannot be excluded")
    }
  }
  for (const member of source.preinstalled) {
    if (excluded.has(`${member.kind}/${member.id}`)) {
      throw new Error("catalogs/excluded.json: preinstalled packages cannot be excluded")
    }
  }
}

export async function loadOfficialMarketplaceSource(workspaceRoot) {
  const readJson = async (relative) =>
    JSON.parse(await fs.readFile(path.join(workspaceRoot, relative), "utf8"))
  const descriptor = await readJson("marketplace.json")
  const builtin = await readJson("catalogs/builtin.json")
  const preinstalledConfig = await readJson("catalogs/preinstalled.json")
  const excludedConfig = await readJson("catalogs/excluded.json")
  const source = {
    descriptor,
    builtin,
    preinstalled: preinstalledConfig.packages,
    excluded: parseCatalogExclusions(excludedConfig, "catalogs/excluded.json"),
  }
  assertOfficialMarketplaceSource(source)
  return source
}
