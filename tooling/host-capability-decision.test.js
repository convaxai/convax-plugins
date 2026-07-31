import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  canonicalReceiptBytes,
  parseHostCapabilityDecisionReceipt,
  sha256Bytes,
  verifyHostCapabilityDecisionReceipt,
} from "./host-capability-decision.mjs"
import {
  createHostCapabilityDecisionReceipt,
} from "./create-host-capability-decision-receipt.mjs"
import {
  parsePluginApiRuntimeConformance,
} from "./plugin-api-runtime-conformance.mjs"

const hostRuntimeSuites = [
  "packages/desktop/src/main/plugin-host-api-service.test.ts",
  "packages/desktop/src/main/plugin-host-api-main-adapter.test.ts",
  "packages/desktop/src/main/plugin-capability-production.test.ts",
  "packages/desktop/src/main/plugin-asset-protocol.test.ts",
  "packages/desktop/src/main/plugin-connected-media-service.test.ts",
  "packages/desktop/src/main/plugin-connected-image-inspector.test.ts",
]
const acceptedImageApiContracts = [
  {
    id: "canvas.inputs.image.close",
    digest:
      "sha256:419a4c7ebf078c5ec95bc193cbd07d66b96c3c4ebfe3a31f188ebec1995bbc2e",
  },
  {
    id: "canvas.inputs.image.open",
    digest:
      "sha256:3c5ee38bad065463f9abd292ef399a12777aa1530837dab2fdc1f017c7784e9d",
  },
]

function imageApiCatalog(version = "1.1.0") {
  return {
    schema: "convax.plugin-api-catalog/3",
    version,
    apis: acceptedImageApiContracts.map(({ id, digest }) => ({
      id,
      contract: { digest },
    })),
  }
}

function runtimeConformance({
  catalogSha256,
  commit,
  tarballIntegrity,
  tarballSha256,
  version = "1.1.0",
  contractCoverage = acceptedImageApiContracts,
}) {
  return {
    schema: "convax.plugin-api-runtime-conformance/1",
    profile: "convax.plugin-api-host-runtime/1",
    host: {
      repository: "microvoid/convax",
      commit,
    },
    workflow: {
      ref:
        "microvoid/convax/.github/workflows/plugin-api-release.yml@refs/heads/convax-next",
      runId: "777",
      runAttempt: "2",
    },
    pluginApi: {
      package: "@convax/plugin-api",
      version,
      catalogSchema: "convax.plugin-api-catalog/3",
      catalogSha256,
      tarballSha256,
      tarballIntegrity,
      contractCoverage,
      contractCoverageSha256: createHash("sha256")
        .update(JSON.stringify(contractCoverage))
        .digest("hex"),
    },
    checks: [
      {
        id: "plugin-api-typecheck",
        command: "bun --cwd packages/plugin-api typecheck",
        status: "passed",
      },
      {
        id: "plugin-api-test",
        command: "bun --cwd packages/plugin-api test",
        status: "passed",
      },
      {
        id: "plugin-api-compat",
        command: "bun --cwd packages/plugin-api compat",
        status: "passed",
      },
      {
        id: "plugin-api-generate-check",
        command: "bun --cwd packages/plugin-api generate:check",
        status: "passed",
      },
      {
        id: "plugin-api-pack-check",
        command: "bun --cwd packages/plugin-api pack:check",
        status: "passed",
      },
      {
        id: "release-evidence-policy",
        command: "bun test scripts/plugin-api-release-evidence.test.ts",
        status: "passed",
      },
      {
        id: "host-runtime-conformance",
        command: `bun test --isolate ${hostRuntimeSuites.join(" ")}`,
        suites: hostRuntimeSuites,
        status: "passed",
      },
    ],
  }
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value)}\n`)
}

function receipt(overrides = {}) {
  const catalogSha256 = overrides.catalogSha256 ?? "a".repeat(64)
  const id = "image-input-read"
  const hostReleaseTag = "plugin-api-v1.1.0"
  return {
    schema: "convax.host-capability-decision-receipt/1",
    decision: "approved",
    request: {
      id,
      acceptedApiContracts: acceptedImageApiContracts,
      semanticSha256: "b".repeat(64),
      affected: ["plugin/viewer"],
    },
    pluginApi: {
      package: "@convax/plugin-api",
      version: "1.1.0",
      catalogSha256,
      catalogUrl:
        `https://github.com/microvoid/convax/releases/download/` +
        `${hostReleaseTag}/plugin-api.json`,
      tarballSha256: "9".repeat(64),
      tarballUrl:
        `https://github.com/microvoid/convax/releases/download/` +
        `${hostReleaseTag}/convax-plugin-api-1.1.0.tgz`,
      npmIntegrity: `sha512-${"A".repeat(86)}==`,
      npmTarballUrl:
        "https://registry.npmjs.org/@convax/plugin-api/-/plugin-api-1.1.0.tgz",
    },
    host: {
      repository: "microvoid/convax",
      commit: "c".repeat(40),
      pullRequest: {
        number: 89,
        url: "https://github.com/microvoid/convax/pull/89",
        mergedAt: "2026-07-30T10:00:00Z",
      },
      release: {
        tag: hostReleaseTag,
        url:
          `https://github.com/microvoid/convax/releases/tag/` +
          hostReleaseTag,
      },
      runtimeConformance: {
        url:
          `https://github.com/microvoid/convax/releases/download/` +
          `${hostReleaseTag}/runtime-conformance.json`,
        sha256: "d".repeat(64),
      },
    },
    review: {
      environment: "plugin-host-capability-governance",
      reviewer: {
        login: "human-reviewer",
        id: 42,
        nodeId: "MDQ6VXNlcjQy",
        type: "User",
      },
      reviewedAt: "2026-07-30T10:10:00Z",
    },
    provenance: {
      repository: "microvoid/convax-plugins",
      workflow: ".github/workflows/approve-host-capability.yml",
      workflowRef:
        "microvoid/convax-plugins/.github/workflows/approve-host-capability.yml@refs/heads/main",
      sourceRef: "refs/heads/main",
      sourceSha: "e".repeat(40),
      runId: 100,
      runAttempt: 1,
    },
    ...overrides.receipt,
  }
}

async function withFixture(run, catalog = imageApiCatalog()) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "convax-host-decision-test-"),
  )
  try {
    const catalogBytes = Buffer.from(
      `${JSON.stringify(catalog, null, 2)}\n`,
    )
    const parsed = receipt({ catalogSha256: sha256Bytes(catalogBytes) })
    const receiptBytes = canonicalReceiptBytes(parsed)
    const receiptPath = path.join(root, "image-input-read.decision.json")
    const catalogPath = path.join(root, "plugin-api.json")
    await Promise.all([
      fs.writeFile(receiptPath, receiptBytes),
      fs.writeFile(catalogPath, catalogBytes),
    ])
    await run({
      catalogPath,
      parsed,
      receiptBytes,
      receiptPath,
    })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

describe("protected Host capability decision receipts", () => {
  test("requires an immutable Release, exact asset and protected workflow attestation", async () => {
    await withFixture(async ({
      catalogPath,
      parsed,
      receiptBytes,
      receiptPath,
    }) => {
      const commands = []
      const verified = await verifyHostCapabilityDecisionReceipt({
        acceptedApiContracts: acceptedImageApiContracts,
        affected: ["plugin/viewer"],
        catalogPath,
        receiptPath,
        receiptReference: {
          repository: "microvoid/convax-plugins",
          releaseTag:
            `host-capability-decision-v1-image-input-read-` +
            parsed.pluginApi.catalogSha256,
          asset: "image-input-read.decision.json",
          sha256: sha256Bytes(receiptBytes),
        },
        requestId: "image-input-read",
        semanticSha256: "b".repeat(64),
        verifyCommand(args) {
          commands.push(args)
          return args[0] === "attestation" ? "[{}]" : "{}"
        },
      })
      expect(verified.review.reviewer.login).toBe("human-reviewer")
      expect(commands.map((args) => args.slice(0, 2))).toEqual([
        ["release", "verify"],
        ["release", "verify-asset"],
        ["attestation", "verify"],
      ])
      expect(commands[2]).toContain(
        "microvoid/convax-plugins/.github/workflows/approve-host-capability.yml",
      )
      expect(commands[2]).toContain(parsed.provenance.sourceSha)
    })
  })

  test("fails closed for mutable releases and replaced receipt bytes", async () => {
    await withFixture(async ({
      catalogPath,
      parsed,
      receiptBytes,
      receiptPath,
    }) => {
      const reference = {
        repository: "microvoid/convax-plugins",
        releaseTag:
          `host-capability-decision-v1-image-input-read-` +
          parsed.pluginApi.catalogSha256,
        asset: "image-input-read.decision.json",
        sha256: sha256Bytes(receiptBytes),
      }
      await expect(
        verifyHostCapabilityDecisionReceipt({
          acceptedApiContracts: acceptedImageApiContracts,
          affected: ["plugin/viewer"],
          catalogPath,
          receiptPath,
          receiptReference: { ...reference, sha256: "f".repeat(64) },
          requestId: "image-input-read",
          semanticSha256: "b".repeat(64),
          verifyCommand: () => "{}",
        }),
      ).rejects.toThrow("bytes do not match policy SHA-256")
      await expect(
        verifyHostCapabilityDecisionReceipt({
          acceptedApiContracts: acceptedImageApiContracts,
          affected: ["plugin/viewer"],
          catalogPath,
          receiptPath,
          receiptReference: reference,
          requestId: "image-input-read",
          semanticSha256: "b".repeat(64),
          verifyCommand(args) {
            if (args[0] === "release") throw new Error("mutable")
            return "[{}]"
          },
        }),
      ).rejects.toThrow("immutable GitHub Release verification failed")
      await expect(
        verifyHostCapabilityDecisionReceipt({
          acceptedApiContracts: acceptedImageApiContracts.map((contract) =>
            contract.id === "canvas.inputs.image.open"
              ? { ...contract, digest: `sha256:${"0".repeat(64)}` }
              : contract,
          ),
          affected: ["plugin/viewer"],
          catalogPath,
          receiptPath,
          receiptReference: reference,
          requestId: "image-input-read",
          semanticSha256: "b".repeat(64),
          verifyCommand: () => "{}",
        }),
      ).rejects.toThrow("accepted API contracts do not match protected base")
    })
  })

  test("rejects a legacy wire Catalog even when its digest and version match", async () => {
    await withFixture(async ({ catalogPath, receiptPath }) => {
      const legacyCatalogBytes = Buffer.from(
        '{"schema":"convax.plugin-api-catalog/2","version":"1.1.0","apis":[]}\n',
      )
      const legacyCatalogPath = path.join(
        path.dirname(catalogPath),
        "legacy-plugin-api.json",
      )
      const legacyReceipt = receipt({
        catalogSha256: sha256Bytes(legacyCatalogBytes),
      })
      const legacyReceiptBytes = canonicalReceiptBytes(legacyReceipt)
      const legacyReceiptPath = path.join(
        path.dirname(receiptPath),
        "legacy-image-input-read.decision.json",
      )
      await Promise.all([
        fs.writeFile(legacyCatalogPath, legacyCatalogBytes),
        fs.writeFile(legacyReceiptPath, legacyReceiptBytes),
      ])
      await expect(
        verifyHostCapabilityDecisionReceipt({
          acceptedApiContracts: acceptedImageApiContracts,
          affected: ["plugin/viewer"],
          catalogPath: legacyCatalogPath,
          receiptPath: legacyReceiptPath,
          receiptReference: {
            repository: "microvoid/convax-plugins",
            releaseTag:
              `host-capability-decision-v1-image-input-read-` +
              legacyReceipt.pluginApi.catalogSha256,
            asset: "image-input-read.decision.json",
            sha256: sha256Bytes(legacyReceiptBytes),
          },
          requestId: "image-input-read",
          semanticSha256: "b".repeat(64),
          verifyCommand: () => "{}",
        }),
      ).rejects.toThrow("Catalog schema/version does not match receipt")
    })
  })

  test("rejects a receipt-bound Catalog that omits or changes an accepted API", async () => {
    const hostileCatalogs = [
      [
        {
          ...imageApiCatalog(),
          apis: [],
        },
        "omits accepted API canvas.inputs.image.close",
      ],
      [
        {
          ...imageApiCatalog(),
          apis: imageApiCatalog().apis.map((api) =>
            api.id === "canvas.inputs.image.open"
              ? {
                  ...api,
                  contract: { digest: `sha256:${"f".repeat(64)}` },
                }
              : api,
          ),
        },
        "accepted API canvas.inputs.image.open contract digest does not match",
      ],
    ]
    for (const [catalog, message] of hostileCatalogs) {
      await withFixture(async ({
        catalogPath,
        parsed,
        receiptBytes,
        receiptPath,
      }) => {
        await expect(
          verifyHostCapabilityDecisionReceipt({
            acceptedApiContracts: acceptedImageApiContracts,
            affected: ["plugin/viewer"],
            catalogPath,
            receiptPath,
            receiptReference: {
              repository: "microvoid/convax-plugins",
              releaseTag:
                `host-capability-decision-v1-image-input-read-` +
                parsed.pluginApi.catalogSha256,
              asset: "image-input-read.decision.json",
              sha256: sha256Bytes(receiptBytes),
            },
            requestId: "image-input-read",
            semanticSha256: "b".repeat(64),
            verifyCommand: () => "{}",
          }),
        ).rejects.toThrow(message)
      }, catalog)
    }
  })

  test("rejects forged, incomplete, duplicated, or stale runtime conformance", () => {
    const expected = {
      repository: "microvoid/convax",
      commit: "3".repeat(40),
      version: "1.1.0",
      catalogSha256: "4".repeat(64),
      tarballSha256: "5".repeat(64),
      tarballIntegrity: `sha512-${"A".repeat(86)}==`,
      contractCoverage: acceptedImageApiContracts,
    }
    const valid = runtimeConformance({
      catalogSha256: expected.catalogSha256,
      commit: expected.commit,
      tarballIntegrity: expected.tarballIntegrity,
      tarballSha256: expected.tarballSha256,
    })
    expect(
      parsePluginApiRuntimeConformance(jsonBytes(valid), expected),
    ).toEqual(valid)

    const hostileCases = [
      [
        (value) => {
          value.unknown = true
        },
        "top-level evidence keys must be exactly",
      ],
      [
        (value) => {
          value.profile = "convax.plugin-api-host-runtime/999"
        },
        "schema/profile must be exactly",
      ],
      [
        (value) => {
          value.host.repository = "attacker/convax"
        },
        "host repository and commit",
      ],
      [
        (value) => {
          value.host.commit = "6".repeat(40)
        },
        "host repository and commit",
      ],
      [
        (value) => {
          value.workflow.ref =
            "microvoid/convax/.github/workflows/plugin-api-bootstrap.yml@refs/heads/convax-next"
        },
        "protected Plugin API release workflow",
      ],
      [
        (value) => {
          value.workflow.runId = "0"
        },
        "positive integer strings",
      ],
      [
        (value) => {
          value.pluginApi.extra = "self-asserted"
        },
        "pluginApi keys must be exactly",
      ],
      [
        (value) => {
          value.pluginApi.package = "@attacker/plugin-api"
        },
        "package identity",
      ],
      [
        (value) => {
          value.pluginApi.version = "1.1.1"
        },
        "package identity",
      ],
      [
        (value) => {
          value.pluginApi.catalogSchema = "convax.plugin-api-catalog/2"
        },
        "Catalog /3 schema and digest",
      ],
      [
        (value) => {
          value.pluginApi.catalogSha256 = "7".repeat(64)
        },
        "Catalog /3 schema and digest",
      ],
      [
        (value) => {
          value.pluginApi.tarballSha256 = "8".repeat(64)
        },
        "tarball digest and npm integrity",
      ],
      [
        (value) => {
          value.pluginApi.tarballIntegrity = `sha512-${"B".repeat(86)}==`
        },
        "tarball digest and npm integrity",
      ],
      [
        (value) => {
          value.pluginApi.contractCoverage.reverse()
        },
        "sorted, unique Catalog contract identities",
      ],
      [
        (value) => {
          value.pluginApi.contractCoverage.pop()
        },
        "contract coverage and digest",
      ],
      [
        (value) => {
          value.checks.push({
            id: "self-asserted-check",
            command: "true",
            status: "passed",
          })
        },
        "unknown check id",
      ],
      [
        (value) => {
          value.checks.pop()
        },
        "missing required checks",
      ],
      [
        (value) => {
          value.checks.push({ ...value.checks[0] })
        },
        "duplicate check id",
      ],
      [
        (value) => {
          value.checks[0].status = "failed"
        },
        "did not pass",
      ],
      [
        (value) => {
          value.checks.at(-1).suites =
            value.checks.at(-1).suites.filter(
              (suite) => !suite.endsWith("/plugin-asset-protocol.test.ts"),
            )
        },
        "exact required suite list",
      ],
    ]
    for (const [mutate, message] of hostileCases) {
      const hostile = structuredClone(valid)
      mutate(hostile)
      expect(
        () => parsePluginApiRuntimeConformance(jsonBytes(hostile), expected),
      ).toThrow(message)
    }
  })

  test("rejects bot reviewers and non-authority provenance", () => {
    const bot = receipt()
    bot.review.reviewer.login = "automation[bot]"
    expect(() => parseHostCapabilityDecisionReceipt(bot)).toThrow(
      "non-bot GitHub user",
    )
    const wrongRepository = receipt()
    wrongRepository.provenance.repository = "attacker/fork"
    expect(() => parseHostCapabilityDecisionReceipt(wrongRepository)).toThrow(
      "protected default-branch workflow",
    )
  })

  test("issuance requires protected environment review distinct from dispatcher", async () => {
    const catalogBytes = Buffer.from(
      `${JSON.stringify(imageApiCatalog())}\n`,
    )
    const packageTarballBytes = Buffer.from("exact published package tarball")
    const npmIntegrity =
      `sha512-${createHash("sha512")
        .update(packageTarballBytes)
        .digest("base64")}`
    const mergeCommit = "1".repeat(40)
    const sourceSha = "2".repeat(40)
    const hostCommit = "3".repeat(40)
    const conformanceBytes = jsonBytes(runtimeConformance({
      catalogSha256: sha256Bytes(catalogBytes),
      commit: hostCommit,
      tarballIntegrity: npmIntegrity,
      tarballSha256: sha256Bytes(packageTarballBytes),
    }))
    const values = {
      requestId: "image-input-read",
      pluginApiVersion: "1.1.0",
      catalogSha256: sha256Bytes(catalogBytes),
      conformanceSha256: sha256Bytes(conformanceBytes),
      packageSha256: sha256Bytes(packageTarballBytes),
      hostCommit,
      hostPullRequest: 89,
      hostReleaseTag: "plugin-api-v1.1.0",
      catalogAsset: "plugin-api.json",
      conformanceAsset: "runtime-conformance.json",
      packageAsset: "convax-plugin-api-1.1.0.tgz",
      actor: "dispatcher",
      sourceSha,
      runId: 100,
      runAttempt: 1,
    }
    const environment = {
      id: 9,
      name: "plugin-host-capability-governance",
      can_admins_bypass: false,
      protection_rules: [{
        type: "required_reviewers",
        prevent_self_review: true,
        reviewers: [{ type: "User", reviewer: { login: "reviewer" } }],
      }],
    }
    const input = {
      approvals: [{
        state: "approved",
        environments: [{ id: 9, name: environment.name }],
        user: {
          login: "reviewer",
          id: 42,
          node_id: "MDQ6VXNlcjQy",
          type: "User",
        },
      }],
      catalogBytes,
      conformanceBytes,
      packageCatalogBytes: catalogBytes,
      packageJson: {
        name: "@convax/plugin-api",
        version: "1.1.0",
      },
      packageTarballBytes,
      npmMetadata: {
        dist: {
          integrity: npmIntegrity,
          tarball:
            "https://registry.npmjs.org/@convax/plugin-api/-/plugin-api-1.1.0.tgz",
        },
      },
      npmTarballBytes: packageTarballBytes,
      environment,
      hostCompare: {
        status: "ahead",
        base_commit: { sha: mergeCommit },
        merge_base_commit: { sha: mergeCommit },
      },
      hostPullRequest: {
        number: 89,
        html_url: "https://github.com/microvoid/convax/pull/89",
        merged_at: "2026-07-30T10:00:00Z",
        merge_commit_sha: mergeCommit,
      },
      hostRelease: {
        tag_name: values.hostReleaseTag,
        draft: false,
        html_url:
          `https://github.com/microvoid/convax/releases/tag/` +
          values.hostReleaseTag,
      },
      hostTagSha: values.hostCommit,
      policy: {
        requests: [{
          id: values.requestId,
          acceptedApiContracts: acceptedImageApiContracts,
          affected: [{ kind: "plugin", id: "viewer" }],
        }],
        resolutions: [],
      },
      requestSource:
        "# Host capability request: image input\n\n## User problem\nread image\n",
      values,
      workflowRun: {
        id: 100,
        run_attempt: 1,
        event: "workflow_dispatch",
        head_branch: "main",
        head_sha: sourceSha,
        path: ".github/workflows/approve-host-capability.yml",
        actor: { login: "dispatcher" },
        updated_at: "2026-07-30T10:10:00Z",
      },
    }
    await expect(
      createHostCapabilityDecisionReceipt(input),
    ).resolves.toEqual(
      expect.objectContaining({
        decision: "approved",
        review: expect.objectContaining({
          reviewer: expect.objectContaining({ login: "reviewer" }),
        }),
      }),
    )
    await expect(
      createHostCapabilityDecisionReceipt({
        ...input,
        environment: { ...environment, can_admins_bypass: true },
      }),
    ).rejects.toThrow("disallow administrator bypass")
    await expect(
      createHostCapabilityDecisionReceipt({
        ...input,
        approvals: [{
          ...input.approvals[0],
          user: { ...input.approvals[0].user, login: "dispatcher" },
        }],
      }),
    ).rejects.toThrow("no independent human approval")

    const fakeConformanceBytes = Buffer.from('{"passed":true}\n')
    await expect(
      createHostCapabilityDecisionReceipt({
        ...input,
        conformanceBytes: fakeConformanceBytes,
        values: {
          ...values,
          conformanceSha256: sha256Bytes(fakeConformanceBytes),
        },
      }),
    ).rejects.toThrow("top-level evidence keys must be exactly")

    const hostileCatalogs = [
      [
        { ...imageApiCatalog(), apis: [] },
        "omits accepted API canvas.inputs.image.close",
      ],
      [
        {
          ...imageApiCatalog(),
          apis: imageApiCatalog().apis.map((api) =>
            api.id === "canvas.inputs.image.open"
              ? {
                  ...api,
                  contract: { digest: `sha256:${"e".repeat(64)}` },
                }
              : api,
          ),
        },
        "accepted API canvas.inputs.image.open contract digest does not match",
      ],
    ]
    for (const [catalog, message] of hostileCatalogs) {
      const hostileCatalogBytes = jsonBytes(catalog)
      await expect(
        createHostCapabilityDecisionReceipt({
          ...input,
          catalogBytes: hostileCatalogBytes,
          packageCatalogBytes: hostileCatalogBytes,
          values: {
            ...values,
            catalogSha256: sha256Bytes(hostileCatalogBytes),
          },
        }),
      ).rejects.toThrow(message)
    }

    const legacyCatalogBytes = Buffer.from(
      '{"schema":"convax.plugin-api-catalog/2","version":"1.1.0","apis":[]}\n',
    )
    await expect(
      createHostCapabilityDecisionReceipt({
        ...input,
        catalogBytes: legacyCatalogBytes,
        packageCatalogBytes: legacyCatalogBytes,
        values: {
          ...values,
          catalogSha256: sha256Bytes(legacyCatalogBytes),
        },
      }),
    ).rejects.toThrow(
      "published Catalog schema/version does not match the approved version",
    )
  })
})
