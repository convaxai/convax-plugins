function packageIdentity(kind, id) {
  return `${kind}/${id}`
}

export function effectivePackagePublications(packages) {
  const byIdentity = new Map(
    packages.map((pkg) => [
      packageIdentity(pkg.metadata.kind, pkg.metadata.id),
      pkg,
    ]),
  )
  const adjacent = new Map(
    [...byIdentity.keys()].map((identity) => [identity, new Set()]),
  )
  for (const plugin of packages.filter(
    (pkg) => pkg.metadata.kind === "plugin",
  )) {
    const ownerIdentity = packageIdentity("plugin", plugin.metadata.id)
    for (const contribution of plugin.manifest.contributes.skills ?? []) {
      const skillIdentity = packageIdentity("skill", contribution.name)
      if (!byIdentity.has(skillIdentity)) continue
      adjacent.get(ownerIdentity).add(skillIdentity)
      adjacent.get(skillIdentity).add(ownerIdentity)
    }
  }

  const directlyBlocked = packages
    .filter((pkg) => pkg.metadata.publication.status === "blocked")
    .map((pkg) => packageIdentity(pkg.metadata.kind, pkg.metadata.id))
  const blockedBy = new Map(
    directlyBlocked.map((identity) => [identity, new Set([identity])]),
  )
  const pending = [...directlyBlocked]
  while (pending.length > 0) {
    const identity = pending.shift()
    for (const dependency of adjacent.get(identity) ?? []) {
      const next = blockedBy.get(dependency) ?? new Set()
      const before = next.size
      for (const blocker of blockedBy.get(identity)) next.add(blocker)
      blockedBy.set(dependency, next)
      if (next.size !== before) pending.push(dependency)
    }
  }

  return new Map(
    packages.map((pkg) => {
      const identity = packageIdentity(pkg.metadata.kind, pkg.metadata.id)
      const causes = [...(blockedBy.get(identity) ?? [])].sort()
      if (causes.length === 0) {
        return [identity, {
          blockers: [],
          blockedBy: [],
          status: "ready",
        }]
      }
      const blockersByIdentity = new Map()
      for (const cause of causes) {
        const source = byIdentity.get(cause)
        for (const blocker of source.metadata.publication.blockers) {
          const blockerIdentity = `${blocker.code}\0${blocker.note}`
          if (!blockersByIdentity.has(blockerIdentity)) {
            blockersByIdentity.set(blockerIdentity, blocker)
          }
        }
      }
      return [identity, {
        blockers: [...blockersByIdentity.values()].sort((left, right) =>
          left.code.localeCompare(right.code, "en") ||
          left.note.localeCompare(right.note, "en"),
        ),
        blockedBy: causes,
        status: "blocked",
      }]
    }),
  )
}

export function partitionPackagePublications(packages) {
  const effective = effectivePackagePublications(packages)
  const ready = []
  const omitted = []
  for (const pkg of packages) {
    const publication = effective.get(
      packageIdentity(pkg.metadata.kind, pkg.metadata.id),
    )
    if (publication.status === "ready") {
      ready.push(pkg)
    } else {
      omitted.push({
        kind: pkg.metadata.kind,
        id: pkg.metadata.id,
        version: pkg.metadata.version,
        publication,
      })
    }
  }
  return { effective, omitted, ready }
}

export function effectivePublicationOmissions(packages) {
  return partitionPackagePublications(packages).omitted
}
