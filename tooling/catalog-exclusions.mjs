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

export function parseCatalogExclusions(value, label = "catalog exclusions") {
  exactKeys(value, ["schema", "members"], ["schema", "members"], label)
  if (
    value.schema !== "convax.catalog-exclusions/1" ||
    !Array.isArray(value.members) ||
    value.members.length > 128
  ) {
    throw new Error(`${label}: unsupported schema or member count`)
  }
  const identities = value.members.map((member, index) => {
    exactKeys(member, ["kind", "id"], ["kind", "id"], `${label} member ${index}`)
    if (
      !["plugin", "skill", "mcp-server"].includes(member.kind) ||
      typeof member.id !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(member.id)
    ) {
      throw new Error(`${label} member ${index}: invalid package identity`)
    }
    return `${member.kind}/${member.id}`
  })
  if (new Set(identities).size !== identities.length) {
    throw new Error(`${label}: members must be unique`)
  }
  const sorted = [...identities].sort((left, right) => left.localeCompare(right, "en"))
  if (identities.some((identity, index) => identity !== sorted[index])) {
    throw new Error(`${label}: members must use canonical identity order`)
  }
  return value.members.map(({ kind, id }) => ({ kind, id }))
}

export function effectiveCatalogExclusionIdentities(packages, excluded = []) {
  const excludedIdentities = new Set(
    excluded.map(({ kind, id }) => `${kind}/${id}`),
  )
  for (const pkg of packages) {
    if (
      pkg.kind === "skill" &&
      pkg.ownerPluginId &&
      excludedIdentities.has(`plugin/${pkg.ownerPluginId}`)
    ) {
      excludedIdentities.add(`skill/${pkg.id}`)
    }
  }
  for (const pkg of packages) {
    if (
      pkg.kind === "skill" &&
      pkg.ownerPluginId &&
      excludedIdentities.has(`skill/${pkg.id}`) &&
      !excludedIdentities.has(`plugin/${pkg.ownerPluginId}`)
    ) {
      throw new Error(
        `catalog exclusion cannot remove owned skill/${pkg.id} without plugin/${pkg.ownerPluginId}`,
      )
    }
  }
  return excludedIdentities
}
