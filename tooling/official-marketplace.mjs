import { promises as fs } from "node:fs"
import path from "node:path"

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
  if (descriptor.repository.owner !== "microvoid" || descriptor.repository.name !== "convax-plugins") {
    throw new Error("marketplace.json: repository must remain microvoid/convax-plugins")
  }
  exactKeys(descriptor.registry, ["v2"], ["v2"], "marketplace.json registry")
  exactKeys(descriptor.registry.v2, ["url"], ["url"], "marketplace.json registry v2")
  if (
    descriptor.registry.v2.url !==
    "https://microvoid.github.io/convax-plugins/registry/v2/index.json"
  ) {
    throw new Error("marketplace.json: Registry v2 URL must remain on the Official Pages origin")
  }
  exactKeys(descriptor.showcase, ["v2"], ["v2"], "marketplace.json showcase")
  exactKeys(descriptor.showcase.v2, ["url"], ["url"], "marketplace.json showcase v2")
  if (
    descriptor.showcase.v2.url !==
    "https://microvoid.github.io/convax-plugins/showcase/v2/index.json"
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

function assertExcluded(excluded) {
  exactKeys(excluded, ["schema", "members"], ["schema", "members"], "catalogs/excluded.json")
  if (
    excluded.schema !== "convax.catalog-exclusions/1" ||
    !Array.isArray(excluded.members) ||
    excluded.members.length > 128
  ) {
    throw new Error("catalogs/excluded.json: unsupported schema or member count")
  }
  const identities = excluded.members.map((member, index) => {
    exactKeys(member, ["kind", "id"], ["kind", "id"], `catalogs/excluded.json member ${index}`)
    if (
      !["plugin", "skill", "mcp-server"].includes(member.kind) ||
      typeof member.id !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(member.id)
    ) {
      throw new Error(`catalogs/excluded.json member ${index}: invalid package identity`)
    }
    return `${member.kind}/${member.id}`
  })
  if (new Set(identities).size !== identities.length) {
    throw new Error("catalogs/excluded.json: members must be unique")
  }
  const sorted = [...identities].sort((left, right) => left.localeCompare(right, "en"))
  if (identities.some((identity, index) => identity !== sorted[index])) {
    throw new Error("catalogs/excluded.json: members must use canonical identity order")
  }
}

export function assertOfficialMarketplaceSource(source) {
  assertOfficialMarketplaceDescriptor(source.descriptor)
  assertBuiltin(source.builtin)
  assertPreinstalled({ schema: "convax.preinstalled-config/1", packages: source.preinstalled })
  assertExcluded({ schema: "convax.catalog-exclusions/1", members: source.excluded })
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
    excluded: excludedConfig.members,
  }
  assertOfficialMarketplaceSource(source)
  return source
}
