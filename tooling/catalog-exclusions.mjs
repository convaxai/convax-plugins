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
