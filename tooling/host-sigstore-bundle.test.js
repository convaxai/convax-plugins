import { describe, expect, test } from "bun:test"
import {
  hostSigstoreVerificationSchema,
  verifyHostSigstoreBundle,
} from "./host-sigstore-bundle.mjs"

const oids = {
  issuer: "1.3.6.1.4.1.57264.1.8",
  buildSignerUri: "1.3.6.1.4.1.57264.1.9",
  runnerEnvironment: "1.3.6.1.4.1.57264.1.11",
  sourceRepositoryUri: "1.3.6.1.4.1.57264.1.12",
  sourceRepositoryDigest: "1.3.6.1.4.1.57264.1.13",
  sourceRepositoryRef: "1.3.6.1.4.1.57264.1.14",
  sourceRepositoryIdentifier: "1.3.6.1.4.1.57264.1.15",
  sourceRepositoryOwnerUri: "1.3.6.1.4.1.57264.1.16",
  sourceRepositoryOwnerIdentifier: "1.3.6.1.4.1.57264.1.17",
  buildTrigger: "1.3.6.1.4.1.57264.1.20",
}

function lengthBytes(length) {
  if (length < 128) return Buffer.from([length])
  const bytes = []
  let remaining = length
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff)
    remaining = Math.floor(remaining / 256)
  }
  return Buffer.from([0x80 | bytes.length, ...bytes])
}

function tlv(tag, content = Buffer.alloc(0)) {
  return Buffer.concat([Buffer.from([tag]), lengthBytes(content.length), content])
}

function sequence(...items) {
  return tlv(0x30, Buffer.concat(items))
}

function oid(value) {
  const parts = value.split(".").map(Number)
  const bytes = [parts[0] * 40 + parts[1]]
  for (const part of parts.slice(2)) {
    const encoded = [part & 0x7f]
    let remaining = Math.floor(part / 128)
    while (remaining > 0) {
      encoded.unshift(0x80 | (remaining & 0x7f))
      remaining = Math.floor(remaining / 128)
    }
    bytes.push(...encoded)
  }
  return tlv(0x06, Buffer.from(bytes))
}

function extension(id, value) {
  return sequence(
    oid(id),
    tlv(0x04, tlv(0x0c, Buffer.from(value, "utf8"))),
  )
}

function certificate(overrides = {}, duplicate) {
  const commit = "a".repeat(40)
  const workflow =
    "microvoid/convax/.github/workflows/plugin-api-release.yml@refs/heads/convax-next"
  const values = {
    issuer: "https://token.actions.githubusercontent.com",
    buildSignerUri: `https://github.com/${workflow}`,
    runnerEnvironment: "github-hosted",
    sourceRepositoryUri: "https://github.com/microvoid/convax",
    sourceRepositoryDigest: commit,
    sourceRepositoryRef: "refs/heads/convax-next",
    sourceRepositoryIdentifier: "1293264965",
    sourceRepositoryOwnerUri: "https://github.com/microvoid",
    sourceRepositoryOwnerIdentifier: "125447777",
    buildTrigger: "workflow_dispatch",
    ...overrides,
  }
  const extensions = Object.entries(values).map(([key, value]) =>
    extension(oids[key], value),
  )
  if (duplicate) extensions.push(extension(oids[duplicate], values[duplicate]))
  const tbsCertificate = sequence(
    tlv(0xa0, tlv(0x02, Buffer.from([2]))),
    tlv(0x02, Buffer.from([1])),
    sequence(),
    sequence(),
    sequence(),
    sequence(),
    sequence(),
    tlv(0xa3, sequence(...extensions)),
  )
  return sequence(tbsCertificate, sequence(), tlv(0x03, Buffer.from([0])))
}

function fixture(certificateBytes = certificate()) {
  const bundle = {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
    verificationMaterial: {
      certificate: { rawBytes: certificateBytes.toString("base64") },
      tlogEntries: [
        {
          inclusionProof: {
            checkpoint: { envelope: "rekor.example checkpoint" },
            hashes: ["hash"],
            rootHash: "root",
            treeSize: "123",
          },
          integratedTime: "1720000000",
          logId: { keyId: "cmVrb3ItbG9nLWlk" },
          logIndex: "0",
        },
      ],
    },
  }
  return {
    assetBytes: Buffer.from("immutable Host asset"),
    assetName: "plugin-api.json",
    bundle,
    bundleBytes: Buffer.from(JSON.stringify(bundle)),
    commit: "a".repeat(40),
    repositoryMetadata: {
      full_name: "microvoid/convax",
      id: 1293264965,
      owner: { id: 125447777, login: "microvoid" },
      private: true,
    },
    trigger: "workflow_dispatch",
    workflowRef:
      "microvoid/convax/.github/workflows/plugin-api-release.yml@refs/heads/convax-next",
  }
}

describe("Host Sigstore bundle evidence", () => {
  test("binds bytes to immutable Host and GitHub Actions certificate claims", () => {
    const verification = verifyHostSigstoreBundle(fixture())
    expect(verification).toEqual(
      expect.objectContaining({
        schema: hostSigstoreVerificationSchema,
        asset: expect.objectContaining({
          name: "plugin-api.json",
          size: 20,
        }),
        certificate: expect.objectContaining({
          runnerEnvironment: "github-hosted",
          sourceRepositoryIdentifier: "1293264965",
          sourceRepositoryOwnerIdentifier: "125447777",
          trigger: "workflow_dispatch",
        }),
        hostIdentity: {
          owner: {
            id: "125447777",
            login: "microvoid",
            uri: "https://github.com/microvoid",
          },
          repository: {
            fullName: "microvoid/convax",
            id: "1293264965",
            private: true,
            uri: "https://github.com/microvoid/convax",
          },
        },
        transparencyLog: {
          integratedTime: 1720000000,
          logId: "cmVrb3ItbG9nLWlk",
          logIndex: 0,
          treeSize: 123,
        },
      }),
    )
  })

  for (const [label, changed, message] of [
    [
      "repository id",
      { sourceRepositoryIdentifier: "9999" },
      "sourceRepositoryIdentifier",
    ],
    [
      "owner id",
      { sourceRepositoryOwnerIdentifier: "9999" },
      "sourceRepositoryOwnerIdentifier",
    ],
    [
      "runner environment",
      { runnerEnvironment: "self-hosted" },
      "runnerEnvironment",
    ],
    [
      "commit",
      { sourceRepositoryDigest: "b".repeat(40) },
      "sourceRepositoryDigest",
    ],
    ["trigger", { buildTrigger: "push" }, "buildTrigger"],
  ]) {
    test(`rejects a mismatched ${label} claim`, () => {
      expect(() =>
        verifyHostSigstoreBundle(fixture(certificate(changed))),
      ).toThrow(message)
    })
  }

  test("rejects a bundle without a Rekor inclusion proof", () => {
    const input = fixture()
    delete input.bundle.verificationMaterial.tlogEntries[0].inclusionProof
    input.bundleBytes = Buffer.from(JSON.stringify(input.bundle))
    expect(() => verifyHostSigstoreBundle(input)).toThrow(
      "Rekor inclusion proof",
    )
  })

  test("rejects non-canonical transparency-log integers", () => {
    const input = fixture()
    input.bundle.verificationMaterial.tlogEntries[0].inclusionProof.treeSize =
      "1e3"
    input.bundleBytes = Buffer.from(JSON.stringify(input.bundle))
    expect(() => verifyHostSigstoreBundle(input)).toThrow(
      "canonical decimal integer",
    )
  })

  test("rejects empty in-memory bundle bytes", () => {
    const input = fixture()
    input.bundleBytes = Buffer.alloc(0)
    expect(() => verifyHostSigstoreBundle(input)).toThrow(
      "non-empty byte buffer",
    )
  })

  for (const [label, mutate] of [
    [
      "live repository id",
      (input) => {
        input.repositoryMetadata.id = 9999
      },
    ],
    [
      "live owner id",
      (input) => {
        input.repositoryMetadata.owner.id = 9999
      },
    ],
  ]) {
    test(`rejects a mismatched ${label} even when the name matches`, () => {
      const input = fixture()
      mutate(input)
      expect(() => verifyHostSigstoreBundle(input)).toThrow("pinned ids")
    })
  }

  test("rejects an unadmitted Host workflow on the protected branch", () => {
    const input = fixture()
    input.workflowRef =
      "microvoid/convax/.github/workflows/other.yml@refs/heads/convax-next"
    expect(() => verifyHostSigstoreBundle(input)).toThrow(
      "admitted Host release workflow",
    )
  })

  test("rejects duplicate security claims", () => {
    expect(() =>
      verifyHostSigstoreBundle(
        fixture(certificate({}, "sourceRepositoryIdentifier")),
      ),
    ).toThrow("duplicate extension")
  })
})
