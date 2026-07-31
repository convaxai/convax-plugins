const apiIdPattern =
  /^[a-z][a-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+$/u
const contractDigestPattern = /^sha256:[a-f0-9]{64}$/u

function fail(label, message) {
  throw new Error(`${label}: ${message}`)
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(label, "must be an object")
  }
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(label, `must contain exactly ${expected.join(", ")}`)
  }
}

export function parseAcceptedApiContracts(
  value,
  label = "accepted API contracts",
) {
  if (!Array.isArray(value) || value.length > 64) {
    fail(label, "must be an array with at most 64 entries")
  }
  const contracts = value.map((entry, index) => {
    const entryLabel = `${label} ${index}`
    exactKeys(entry, ["digest", "id"], entryLabel)
    if (typeof entry.id !== "string" || !apiIdPattern.test(entry.id)) {
      fail(entryLabel, "id must be one dotted Plugin API id")
    }
    if (
      typeof entry.digest !== "string" ||
      !contractDigestPattern.test(entry.digest)
    ) {
      fail(entryLabel, "digest must be one sha256-prefixed contract digest")
    }
    return Object.freeze({ id: entry.id, digest: entry.digest })
  })
  if (
    new Set(contracts.map(({ id }) => id)).size !== contracts.length ||
    [...contracts].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    )
      .some(({ id }, index) => id !== contracts[index].id)
  ) {
    fail(label, "must contain unique API ids in sorted order")
  }
  return Object.freeze(contracts)
}

export function assertCatalogContainsAcceptedApiContracts(
  catalog,
  acceptedApiContracts,
  label = "Plugin API Catalog",
) {
  const accepted = parseAcceptedApiContracts(
    acceptedApiContracts,
    `${label} accepted API contracts`,
  )
  if (accepted.length === 0) return
  if (!Array.isArray(catalog?.apis)) {
    fail(label, "apis must be an array when contracts were accepted")
  }
  const definitions = new Map()
  for (const definition of catalog.apis) {
    if (
      !definition ||
      typeof definition !== "object" ||
      Array.isArray(definition) ||
      typeof definition.id !== "string"
    ) {
      continue
    }
    if (definitions.has(definition.id)) {
      fail(label, `contains duplicate API id ${definition.id}`)
    }
    definitions.set(definition.id, definition)
  }
  for (const acceptedContract of accepted) {
    const definition = definitions.get(acceptedContract.id)
    if (!definition) {
      fail(label, `omits accepted API ${acceptedContract.id}`)
    }
    if (
      !definition.contract ||
      typeof definition.contract !== "object" ||
      Array.isArray(definition.contract) ||
      definition.contract.digest !== acceptedContract.digest
    ) {
      fail(
        label,
        `accepted API ${acceptedContract.id} contract digest does not match`,
      )
    }
  }
}
