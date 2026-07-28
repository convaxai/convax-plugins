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

function assertDescriptor(descriptor) {
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
  exactKeys(descriptor.registry, ["v1", "v2"], ["v1", "v2"], "marketplace.json registry")
  exactKeys(descriptor.registry.v1, ["url"], ["url"], "marketplace.json registry v1")
  exactKeys(descriptor.registry.v2, ["url"], ["url"], "marketplace.json registry v2")
  exactKeys(descriptor.showcase, ["v2"], ["v2"], "marketplace.json showcase")
  exactKeys(descriptor.showcase.v2, ["url"], ["url"], "marketplace.json showcase v2")
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
    throw new Error("catalogs/builtin.json: v1 contains only skill/canvas-storyboard")
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
    throw new Error("catalogs/preinstalled.json: v1 contains only darwin-arm64 Official ffmpeg-tools")
  }
}

export function assertOfficialMarketplaceSource(source) {
  assertDescriptor(source.descriptor)
  assertBuiltin(source.builtin)
  assertPreinstalled({ schema: "convax.preinstalled-config/1", packages: source.preinstalled })
}

export async function loadOfficialMarketplaceSource(workspaceRoot) {
  const readJson = async (relative) =>
    JSON.parse(await fs.readFile(path.join(workspaceRoot, relative), "utf8"))
  const descriptor = await readJson("marketplace.json")
  const builtin = await readJson("catalogs/builtin.json")
  const preinstalledConfig = await readJson("catalogs/preinstalled.json")
  const source = {
    descriptor,
    builtin,
    preinstalled: preinstalledConfig.packages,
  }
  assertOfficialMarketplaceSource(source)
  return source
}
