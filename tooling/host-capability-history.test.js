import { describe, expect, test } from "bun:test"

import { assertPendingHostCapabilityHistory } from "./host-capability-history.mjs"
import {
  hostCapabilityRequestSemanticDigest,
} from "./host-capability-request.mjs"
import { parseHostCapabilityPolicy } from "./lib.mjs"

function request(id, affected) {
  const document = `docs/host-capability-requests/${id}.md`
  return {
    affected: affected.map(({ id: packageId, kind, version }) => ({
      blocker: {
        code: "host-capability-review-required",
        note: `Human review is tracked in ${document}.`,
      },
      id: packageId,
      kind,
      version,
    })),
    document,
    humanDecision: null,
    id,
    status: "pending",
  }
}

function policy(requests) {
  return parseHostCapabilityPolicy({
    requests,
    schema: "convax.host-capability-policy/1",
  })
}

function semanticDigests(entries = [["image-input-read", "semantic-v1"]]) {
  const values = new Map(entries)
  return { base: values, current: new Map(values) }
}

describe("protected Host capability request history", () => {
  const baseRequest = request("image-input-read", [
    { id: "viewer", kind: "plugin", version: "1.0.0" },
    { id: "viewer-guide", kind: "skill", version: "1.0.0" },
  ])

  test("rejects deleting the document, policy, and workspace declarations together", () => {
    expect(() =>
      assertPendingHostCapabilityHistory(
        policy([baseRequest]),
        policy([]),
        semanticDigests(),
      ),
    ).toThrow(
      "pending Host capability request image-input-read cannot be removed without a protected external human-decision receipt",
    )
  })

  test("keeps every affected package blocked across version bumps", () => {
    expect(() =>
      assertPendingHostCapabilityHistory(
        policy([baseRequest]),
        policy([
          request("image-input-read", [
            { id: "viewer", kind: "plugin", version: "1.1.0" },
          ]),
        ]),
        semanticDigests(),
      ),
    ).toThrow(
      "pending Host capability request image-input-read cannot release skill/viewer-guide",
    )
  })

  test("allows version bumps and new requests while retaining the same obligation", () => {
    expect(() =>
      assertPendingHostCapabilityHistory(
        policy([baseRequest]),
        policy([
          request("image-input-read", [
            { id: "viewer", kind: "plugin", version: "1.1.0" },
            { id: "viewer-guide", kind: "skill", version: "1.1.0" },
          ]),
          request("verified-toolchain", [
            { id: "editor", kind: "plugin", version: "2.0.0" },
          ]),
        ]),
        semanticDigests([
          ["image-input-read", "semantic-v1"],
          ["verified-toolchain", "semantic-v2"],
        ]),
      ),
    ).not.toThrow()
  })

  test("rejects replacing the pending request semantic contract in place", () => {
    expect(() =>
      assertPendingHostCapabilityHistory(
        policy([baseRequest]),
        policy([baseRequest]),
        {
          base: new Map([["image-input-read", "semantic-v1"]]),
          current: new Map([["image-input-read", "different-contract"]]),
        },
      ),
    ).toThrow(
      "pending Host capability request image-input-read semantic contract cannot change",
    )
  })

  test("semantic hashing preserves Markdown identifiers and punctuation", () => {
    const source = [
      "# Host capability request: image input",
      "## User problem",
      "Read `inputKey` and glob `asset_*`.",
    ].join("\n")
    expect(
      hostCapabilityRequestSemanticDigest(source),
    ).not.toBe(
      hostCapabilityRequestSemanticDigest(
        source.replaceAll("inputKey", "input_Key").replaceAll("asset_*", "asset"),
      ),
    )
  })

})
