import { createHash } from "node:crypto"
import { PLUGIN_API_CATALOG_VERSION } from "@convax/plugin-api"
import { renderPluginApiJson } from "@convax/plugin-api/generator"

export const hostCapabilityRequestHeadings = Object.freeze([
  "## User problem",
  "## Blocked Plugin use case",
  "## Catalog evidence",
  "## Requested generic contract",
  "## Alternatives considered",
  "## Security and authority",
  "## Compatibility",
  "## Falsifiable acceptance tests",
  "## Plugin-side plan after approval",
  "## Human decision audit record",
])

export const hostCapabilityRequestFields = new Map([
  [
    "## Catalog evidence",
    Object.freeze([
      "Checked Catalog version",
      "Closest existing APIs",
      "Availability result",
      "Why required/optional declaration does not solve it",
    ]),
  ],
  [
    "## Requested generic contract",
    Object.freeze([
      "Proposed capability id or contribution",
      "Intended audiences",
      "Scope",
      "Side effect",
      "Required grant",
      "Bounded request",
      "Bounded response",
      "Stable errors",
      "Cancellation and stale-scope behavior",
    ]),
  ],
  [
    "## Human decision audit record",
    Object.freeze([
      "Decision",
      "Reviewer identity",
      "Decision time",
      "Protected receipt URL and SHA-256",
      "Accepted published contract version and digest",
      "Runtime conformance evidence",
    ]),
  ],
])

function fail(label, message) {
  throw new Error(`${label}: ${message}`)
}

function sectionBody(source, heading) {
  const start = source.indexOf(heading)
  if (start < 0) return ""
  const contentStart = start + heading.length
  const nextHeading = source.indexOf("\n## ", contentStart)
  return source.slice(
    contentStart,
    nextHeading < 0 ? source.length : nextHeading,
  )
}

function bulletFieldsAndValues(source) {
  const fields = []
  let current
  for (const line of source.split("\n")) {
    const match = /^- ([^:\n]+):(?:[ \t]*(.*))?$/u.exec(line)
    if (match) {
      current = { field: match[1], value: match[2] ?? "" }
      fields.push(current)
      continue
    }
    if (current && /^(?: {2,}|\t)\S/u.test(line)) {
      current.value += ` ${line.trim()}`
    } else if (line.trim() !== "") {
      current = undefined
    }
  }
  return fields
}

function normalizedInline(value) {
  return value.replace(/[`*_]/gu, "").replace(/\s+/gu, " ").trim()
}

const semanticRequestHeadings = Object.freeze(
  hostCapabilityRequestHeadings.filter(
    (heading) =>
      heading !== "## Catalog evidence" &&
      heading !== "## Human decision audit record",
  ),
)

/**
 * Returns the immutable meaning of one pending request. Catalog evidence is
 * deliberately excluded because its generated version and digest must advance
 * with the Host Catalog. The human decision record is separately protected and
 * remains pending until an external receipt verifier exists.
 */
export function hostCapabilityRequestSemanticDigest(source) {
  if (typeof source !== "string") {
    throw new TypeError("Host capability request must be Markdown text")
  }
  const title = source.match(/^# Host capability request: ([^\n]+)$/mu)?.[1]
  if (!title) {
    throw new Error("Host capability request must contain one canonical title")
  }
  const normalizeSemanticMarkdown = (value) =>
    value
      .replace(/\r\n?/gu, "\n")
      .normalize("NFC")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/gu, ""))
      .join("\n")
      .trim()
  const semanticCore = [
    normalizeSemanticMarkdown(title),
    ...semanticRequestHeadings.flatMap((heading) => [
      heading,
      normalizeSemanticMarkdown(sectionBody(source, heading)),
    ]),
  ].join("\n")
  return createHash("sha256").update(semanticCore).digest("hex")
}

export function currentPluginApiCatalogEvidence() {
  const source = renderPluginApiJson()
  return Object.freeze({
    digest: createHash("sha256").update(source).digest("hex"),
    version: PLUGIN_API_CATALOG_VERSION,
  })
}

export function validateHostCapabilityRequestDocument(
  source,
  label = "Host capability request",
) {
  if (typeof source !== "string") {
    fail(label, "must be Markdown text")
  }
  if (
    !/^# Host capability request: [^\n]+\n\nStatus: pending human review\n/u.test(
      source,
    )
  ) {
    fail(
      label,
      "must start with one named request and exact pending human review status",
    )
  }
  const headings = source.match(/^## .+$/gmu) ?? []
  if (
    headings.length !== hostCapabilityRequestHeadings.length ||
    headings.some(
      (heading, index) => heading !== hostCapabilityRequestHeadings[index],
    )
  ) {
    fail(label, "must contain the complete canonical section sequence")
  }
  for (const heading of hostCapabilityRequestHeadings) {
    const body = sectionBody(source, heading)
    if (body.trim().length === 0) {
      fail(label, `${heading} must not be empty`)
    }
    const expectedFields = hostCapabilityRequestFields.get(heading)
    if (!expectedFields) continue
    const fields = bulletFieldsAndValues(body)
    if (
      fields.length !== expectedFields.length ||
      fields.some(
        ({ field }, index) => field !== expectedFields[index],
      )
    ) {
      fail(label, `${heading} must contain the canonical required fields`)
    }
    const empty = fields.find(({ value }) => normalizedInline(value).length === 0)
    if (empty) {
      fail(label, `${heading} field ${empty.field} must not be empty`)
    }
  }

  const catalogFields = bulletFieldsAndValues(
    sectionBody(source, "## Catalog evidence"),
  )
  const checkedCatalog = normalizedInline(catalogFields[0].value)
  const evidence = currentPluginApiCatalogEvidence()
  const expectedVersion = `@convax/plugin-api@${evidence.version}`
  const digests = checkedCatalog.match(/\b[a-f0-9]{64}\b/gu) ?? []
  if (
    !checkedCatalog.includes(expectedVersion) ||
    digests.length !== 1 ||
    digests[0] !== evidence.digest
  ) {
    fail(
      label,
      `Checked Catalog version must bind ${expectedVersion} to current digest ${evidence.digest}`,
    )
  }

  const decisionFields = bulletFieldsAndValues(
    sectionBody(source, "## Human decision audit record"),
  )
  for (const { field, value } of decisionFields) {
    if (normalizedInline(value) !== "pending") {
      fail(
        label,
        `Human decision field ${field} must remain exactly pending`,
      )
    }
  }
  const acceptanceTests =
    sectionBody(source, "## Falsifiable acceptance tests").match(
      /^\d+\. \S.+$/gmu,
    ) ?? []
  if (acceptanceTests.length < 3) {
    fail(label, "must contain at least three falsifiable numbered tests")
  }
  return Object.freeze({
    catalogDigest: evidence.digest,
    catalogVersion: evidence.version,
    status: "pending",
  })
}
