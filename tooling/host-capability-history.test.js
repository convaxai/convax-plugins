import { describe, expect, test } from "bun:test"

import { assertPendingHostCapabilityHistory } from "./host-capability-history.mjs"
import {
  hostCapabilityRequestSemanticDigest,
} from "./host-capability-request.mjs"
import { parseHostCapabilityPolicy } from "./lib.mjs"

const acceptedImageApiContracts = [
  {
    id: "canvas.inputs.image.close",
    digest: `sha256:${"1".repeat(64)}`,
  },
  {
    id: "canvas.inputs.image.open",
    digest: `sha256:${"2".repeat(64)}`,
  },
]

function request(id, affected, acceptedApiContracts = []) {
  const document = `docs/host-capability-requests/${id}.md`
  return {
    acceptedApiContracts,
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

function policy(requests, resolutions = []) {
  return parseHostCapabilityPolicy({
    requests,
    resolutions,
    schema: "convax.host-capability-policy/2",
  })
}

function legacyPolicy(requests) {
  return parseHostCapabilityPolicy({
    requests: requests.map(({ acceptedApiContracts: _acceptedApiContracts, ...request }) => request),
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
  ], acceptedImageApiContracts)

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

  test("accepts removal only with an exact resolution tombstone and verified receipt", () => {
    const resolution = {
      id: "image-input-read",
      receipt: {
        repository: "convaxai/convax-plugins",
        releaseTag:
          `host-capability-decision-v1-image-input-read-${"0".repeat(64)}`,
        asset: "image-input-read.decision.json",
        sha256: "1".repeat(64),
      },
    }
    expect(() =>
      assertPendingHostCapabilityHistory(
        policy([baseRequest]),
        policy([], [resolution]),
        semanticDigests(),
        new Map([["image-input-read", { decision: "approved" }]]),
      ),
    ).not.toThrow()
    expect(() =>
      assertPendingHostCapabilityHistory(
        policy([baseRequest]),
        policy([], [resolution]),
        semanticDigests(),
      ),
    ).toThrow("cannot be removed without a protected external human-decision receipt")
  })

  test("resolves same-version requests independently and requires every exact receipt", () => {
    const generationRequest = request("generation-input-binding", [
      { id: "viewer", kind: "plugin", version: "1.0.0" },
    ])
    const imageRequest = request("image-input-read", [
      { id: "viewer", kind: "plugin", version: "1.0.0" },
    ], acceptedImageApiContracts)
    const imageResolution = {
      id: "image-input-read",
      receipt: {
        repository: "convaxai/convax-plugins",
        releaseTag:
          `host-capability-decision-v1-image-input-read-${"0".repeat(64)}`,
        asset: "image-input-read.decision.json",
        sha256: "1".repeat(64),
      },
    }
    const generationResolution = {
      id: "generation-input-binding",
      receipt: {
        repository: "convaxai/convax-plugins",
        releaseTag:
          `host-capability-decision-v1-generation-input-binding-${"2".repeat(64)}`,
        asset: "generation-input-binding.decision.json",
        sha256: "3".repeat(64),
      },
    }
    const digests = semanticDigests([
      ["generation-input-binding", "generation-semantic-v1"],
      ["image-input-read", "image-semantic-v1"],
    ])
    const base = policy([imageRequest, generationRequest])

    expect(() =>
      assertPendingHostCapabilityHistory(
        base,
        policy([generationRequest], [imageResolution]),
        digests,
        new Map([["image-input-read", { decision: "approved" }]]),
      ),
    ).not.toThrow()
    expect(() =>
      assertPendingHostCapabilityHistory(
        base,
        policy([generationRequest], [imageResolution]),
        digests,
      ),
    ).toThrow(
      "pending Host capability request image-input-read cannot be removed",
    )
    expect(() =>
      assertPendingHostCapabilityHistory(
        base,
        policy([], [imageResolution, generationResolution]),
        digests,
        new Map([
          ["generation-input-binding", { decision: "approved" }],
          ["image-input-read", { decision: "approved" }],
        ]),
      ),
    ).not.toThrow()
    expect(() =>
      assertPendingHostCapabilityHistory(
        base,
        policy([], [imageResolution, generationResolution]),
        digests,
        new Map([["image-input-read", { decision: "approved" }]]),
      ),
    ).toThrow(
      "pending Host capability request generation-input-binding cannot be removed",
    )
  })

  test("bounds and deterministically orders same-version request bindings", () => {
    const sameVersion = [
      request("zeta-contract", [
        { id: "viewer", kind: "plugin", version: "1.0.0" },
      ]),
      request("alpha-contract", [
        { id: "viewer", kind: "plugin", version: "1.0.0" },
      ]),
    ]
    expect(
      policy(sameVersion).packages.map((item) => item.requestId),
    ).toEqual(["alpha-contract", "zeta-contract"])
    expect(() => policy([sameVersion[0], sameVersion[0]])).toThrow(
      "contains duplicate request ids",
    )
    expect(() =>
      policy(Array.from(
        { length: 17 },
        (_, index) =>
          request(`contract-${index + 1}`, [
            { id: "viewer", kind: "plugin", version: "1.0.0" },
          ]),
      )),
    ).toThrow("plugin/viewer@1.0.0 binds more than 16 pending requests")
  })

  test("does not collapse bindings for different exact package versions", () => {
    const parsed = policy([
      request("version-one-contract", [
        { id: "viewer", kind: "plugin", version: "1.0.0" },
      ]),
      request("version-two-contract", [
        { id: "viewer", kind: "plugin", version: "2.0.0" },
      ]),
    ])
    expect(parsed.packages.map((item) => [
      `${item.kind}/${item.id}@${item.version}`,
      item.requestId,
    ])).toEqual([
      ["plugin/viewer@1.0.0", "version-one-contract"],
      ["plugin/viewer@2.0.0", "version-two-contract"],
    ])
  })

  test("keeps resolved receipt tombstones append-only", () => {
    const baseResolution = {
      id: "image-input-read",
      receipt: {
        repository: "convaxai/convax-plugins",
        releaseTag:
          `host-capability-decision-v1-image-input-read-${"0".repeat(64)}`,
        asset: "image-input-read.decision.json",
        sha256: "1".repeat(64),
      },
    }
    expect(() =>
      assertPendingHostCapabilityHistory(
        policy([], [baseResolution]),
        policy([]),
      ),
    ).toThrow("receipt tombstone cannot be removed or changed")
  })

  test("keeps every affected package blocked across version bumps", () => {
    expect(() =>
      assertPendingHostCapabilityHistory(
        policy([baseRequest]),
        policy([
          request("image-input-read", [
            { id: "viewer", kind: "plugin", version: "1.1.0" },
          ], acceptedImageApiContracts),
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
          ], acceptedImageApiContracts),
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

  test("rejects replacing an accepted API id or contract digest in place", () => {
    const changed = request(
      "image-input-read",
      [
        { id: "viewer", kind: "plugin", version: "1.0.0" },
        { id: "viewer-guide", kind: "skill", version: "1.0.0" },
      ],
      acceptedImageApiContracts.map((contract) =>
        contract.id === "canvas.inputs.image.open"
          ? { ...contract, digest: `sha256:${"3".repeat(64)}` }
          : contract,
      ),
    )
    expect(() =>
      assertPendingHostCapabilityHistory(
        policy([baseRequest]),
        policy([changed]),
        semanticDigests(),
      ),
    ).toThrow("accepted API contracts cannot change")
  })

  test("allows one v1-to-v2 cutover to bind contracts while the request remains pending", () => {
    expect(() =>
      assertPendingHostCapabilityHistory(
        legacyPolicy([baseRequest]),
        policy([baseRequest]),
        {
          base: new Map([["image-input-read", "legacy-request"]]),
          current: new Map([["image-input-read", "accepted-contract-request"]]),
        },
      ),
    ).not.toThrow()
  })

  test("does not use the v2 cutover to rewrite a request without binding a contract", () => {
    const requestWithoutContracts = request(
      "image-input-read",
      [
        { id: "viewer", kind: "plugin", version: "1.0.0" },
        { id: "viewer-guide", kind: "skill", version: "1.0.0" },
      ],
    )
    expect(() =>
      assertPendingHostCapabilityHistory(
        legacyPolicy([requestWithoutContracts]),
        policy([requestWithoutContracts]),
        {
          base: new Map([["image-input-read", "legacy-request"]]),
          current: new Map([["image-input-read", "rewritten-without-contract"]]),
        },
      ),
    ).toThrow("semantic contract cannot change")
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
