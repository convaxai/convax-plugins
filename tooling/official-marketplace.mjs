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
    [
      "schema",
      "id",
      "name",
      "publisher",
      "repository",
      "registry",
      "showcase",
      "compatibility",
      "delivery",
    ],
    [
      "schema",
      "id",
      "name",
      "publisher",
      "repository",
      "registry",
      "showcase",
      "compatibility",
      "delivery",
    ],
    "marketplace.json",
  )
  if (
    descriptor.schema !== "convax.marketplace/1" ||
    descriptor.id !== "convax-official"
  ) {
    throw new Error("marketplace.json: invalid Official identity")
  }
  exactKeys(
    descriptor.publisher,
    ["name"],
    ["name"],
    "marketplace.json publisher",
  )
  exactKeys(
    descriptor.repository,
    ["owner", "name"],
    ["owner", "name"],
    "marketplace.json repository",
  )
  if (
    descriptor.repository.owner !== "convaxai" ||
    descriptor.repository.name !== "convax-plugins"
  ) {
    throw new Error(
      "marketplace.json: repository must remain convaxai/convax-plugins",
    )
  }
  exactKeys(descriptor.registry, ["v2"], ["v2"], "marketplace.json registry")
  exactKeys(
    descriptor.registry.v2,
    ["url"],
    ["url"],
    "marketplace.json registry v2",
  )
  if (
    descriptor.registry.v2.url !==
    "https://convaxai.github.io/convax-plugins/registry/v2/index.json"
  ) {
    throw new Error(
      "marketplace.json: Registry v2 URL must remain on the Official Pages origin",
    )
  }
  exactKeys(descriptor.showcase, ["v2"], ["v2"], "marketplace.json showcase")
  exactKeys(
    descriptor.showcase.v2,
    ["url"],
    ["url"],
    "marketplace.json showcase v2",
  )
  if (
    descriptor.showcase.v2.url !==
    "https://convaxai.github.io/convax-plugins/showcase/v2/index.json"
  ) {
    throw new Error(
      "marketplace.json: Showcase v2 URL must remain on the Official Pages origin",
    )
  }
  exactKeys(
    descriptor.compatibility,
    ["convax"],
    ["convax"],
    "marketplace.json compatibility",
  )
  exactKeys(
    descriptor.delivery,
    ["kind"],
    ["kind"],
    "marketplace.json delivery",
  )
  if (descriptor.delivery.kind !== "github-pages-releases") {
    throw new Error(
      "marketplace.json: Official delivery must use GitHub Pages and Releases",
    )
  }
}

function assertBuiltin(builtin) {
  exactKeys(
    builtin,
    ["schema", "members"],
    ["schema", "members"],
    "catalogs/builtin.json",
  )
  if (builtin.schema !== "convax.builtin-config/1") {
    throw new Error("catalogs/builtin.json: unsupported schema")
  }
  if (
    !Array.isArray(builtin.members) ||
    builtin.members.length !== 1 ||
    builtin.members[0]?.kind !== "skill" ||
    builtin.members[0]?.id !== "canvas-storyboard"
  ) {
    throw new Error(
      "catalogs/builtin.json: must contain only skill/canvas-storyboard",
    )
  }
}

function assertPackaged(packaged) {
  exactKeys(
    packaged,
    ["schema", "packages"],
    ["schema", "packages"],
    "catalogs/packaged.json",
  )
  if (
    packaged.schema !== "convax.packaged-config/1" ||
    !Array.isArray(packaged.packages) ||
    packaged.packages.length < 1 ||
    packaged.packages.length > 64
  ) {
    throw new Error(
      "catalogs/packaged.json: must contain a bounded product package closure",
    )
  }
  const identities = new Set()
  const orderedIdentities = []
  for (const [index, item] of packaged.packages.entries()) {
    const label = `catalogs/packaged.json packages[${index}]`
    exactKeys(
      item,
      ["marketplaceId", "kind", "id", "targets"],
      ["marketplaceId", "kind", "id", "targets"],
      label,
    )
    if (
      item.marketplaceId !== "convax-official" ||
      (item.kind !== "plugin" && item.kind !== "skill") ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(item.id) ||
      !Array.isArray(item.targets) ||
      item.targets.length > 6 ||
      item.targets.some(
        (target) => !/^(darwin|linux|win32)-(arm64|x64)$/.test(target),
      ) ||
      new Set(item.targets).size !== item.targets.length ||
      (item.kind === "skill" && item.targets.length !== 0)
    ) {
      throw new Error(
        `${label}: invalid Official Plugin or standalone Skill declaration`,
      )
    }
    const identity = `${item.kind}\0${item.id}`
    if (identities.has(identity)) {
      throw new Error(
        "catalogs/packaged.json: package identities must be unique",
      )
    }
    identities.add(identity)
    orderedIdentities.push(identity)
  }
  if (
    JSON.stringify(orderedIdentities) !==
    JSON.stringify([...orderedIdentities].sort())
  ) {
    throw new Error(
      "catalogs/packaged.json: package identities must be in canonical order",
    )
  }
}

export function assertOfficialMarketplaceSource(source) {
  assertOfficialMarketplaceDescriptor(source.descriptor)
  assertBuiltin(source.builtin)
  assertPackaged({
    schema: "convax.packaged-config/1",
    packages: source.packaged,
  })
  parseCatalogExclusions(
    { schema: "convax.catalog-exclusions/1", members: source.excluded },
    "catalogs/excluded.json",
  )
  const excluded = new Set(
    source.excluded.map(({ kind, id }) => `${kind}/${id}`),
  )
  for (const member of source.builtin.members) {
    if (excluded.has(`${member.kind}/${member.id}`)) {
      throw new Error(
        "catalogs/excluded.json: Builtin members cannot be excluded",
      )
    }
  }
  for (const member of source.packaged) {
    if (excluded.has(`${member.kind}/${member.id}`)) {
      throw new Error(
        "catalogs/excluded.json: packaged packages cannot be excluded",
      )
    }
  }
}

export async function loadOfficialMarketplaceSource(workspaceRoot) {
  const readJson = async (relative) =>
    JSON.parse(await fs.readFile(path.join(workspaceRoot, relative), "utf8"))
  const descriptor = await readJson("marketplace.json")
  const builtin = await readJson("catalogs/builtin.json")
  const packagedConfig = await readJson("catalogs/packaged.json")
  const excludedConfig = await readJson("catalogs/excluded.json")
  const source = {
    descriptor,
    builtin,
    packaged: packagedConfig.packages,
    excluded: parseCatalogExclusions(excludedConfig, "catalogs/excluded.json"),
  }
  assertOfficialMarketplaceSource(source)
  return source
}
