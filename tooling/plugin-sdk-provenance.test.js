import { createHash } from "node:crypto"
import { describe, expect, test } from "bun:test"

import {
  buildPluginBundleProvenance,
  canonicalJson,
  inspectFrozenPluginSdkLock,
  parseHostPackageRelease,
  parsePluginBundleProvenance,
  parseStrictJson,
  satisfiesCaret,
  sha256,
  verifyPluginSdkClosure,
} from "./plugin-sdk-provenance.mjs"

const apiSuites = [
  "packages/desktop/src/main/plugin-host-api-service.test.ts",
  "packages/desktop/src/main/plugin-host-api-main-adapter.test.ts",
  "packages/desktop/src/main/plugin-capability-production.test.ts",
  "packages/desktop/src/main/plugin-asset-protocol.test.ts",
  "packages/desktop/src/main/plugin-connected-media-service.test.ts",
  "packages/desktop/src/main/plugin-connected-image-inspector.test.ts",
]
const sdkChecks = [
  ["plugin-api-release-dependency-build", "bun --cwd packages/plugin-api build"],
  ["plugin-sdk-typecheck", "bun --cwd packages/plugin-sdk typecheck"],
  ["plugin-sdk-test", "bun --cwd packages/plugin-sdk test"],
  ["plugin-sdk-pack-check", "bun --cwd packages/plugin-sdk pack:check"],
  ["package-boundaries", "bun run package:boundaries"],
  [
    "release-evidence-policy",
    "bun test scripts/plugin-sdk-release-evidence.test.ts scripts/plugin-sdk-release-workflows.test.ts",
  ],
]

function integrity(bytes) {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`
}

function catalog(version) {
  return Buffer.from(`${JSON.stringify({
    schema: "convax.plugin-api-catalog/3",
    version,
    apis: [],
  })}\n`)
}

function runtimeConformance({
  catalogBytes,
  commit,
  tarballBytes,
  tarballIntegrity,
  version,
}) {
  return Buffer.from(`${JSON.stringify({
    schema: "convax.plugin-api-runtime-conformance/1",
    profile: "convax.plugin-api-host-runtime/1",
    host: {
      repository: "convaxai/convax",
      commit,
    },
    workflow: {
      ref:
        "convaxai/convax/.github/workflows/plugin-api-release.yml@refs/heads/main",
      runId: "88",
      runAttempt: "2",
    },
    pluginApi: {
      package: "@convax/plugin-api",
      version,
      catalogSchema: "convax.plugin-api-catalog/3",
      catalogSha256: sha256(catalogBytes),
      tarballSha256: sha256(tarballBytes),
      tarballIntegrity,
      contractCoverage: [],
      contractCoverageSha256: sha256(Buffer.from("[]")),
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
        command: `bun test --isolate ${apiSuites.join(" ")}`,
        suites: apiSuites,
        status: "passed",
      },
    ],
  })}\n`)
}

function fixture() {
  const sdkVersion = "0.1.0"
  const releaseApiVersion = "1.0.0"
  const actualApiVersion = "1.1.0"
  const sdkCommit = "a".repeat(40)
  const apiCommit = "b".repeat(40)
  const sdkTarballBytes = Buffer.from("exact-sdk-tarball")
  const releaseApiTarballBytes = Buffer.from("release-time-api-tarball")
  const actualApiTarballBytes = Buffer.from("actual-locked-api-tarball")
  const releaseApiCatalogBytes = catalog(releaseApiVersion)
  const actualApiCatalogBytes = catalog(actualApiVersion)
  const sdkIntegrity = integrity(sdkTarballBytes)
  const releaseApiIntegrity = integrity(releaseApiTarballBytes)
  const actualApiIntegrity = integrity(actualApiTarballBytes)
  const frozenLock = {
    schema: "convax.plugin-sdk-frozen-lock/1",
    registry: "https://registry.npmjs.org",
    lockfile: {
      path: "bun.lock",
      sha256: "c".repeat(64),
    },
    dependencies: [
      {
        name: "@convax/plugin-api",
        version: actualApiVersion,
        tarballIntegrity: actualApiIntegrity,
      },
      {
        name: "@convax/plugin-sdk",
        version: sdkVersion,
        tarballIntegrity: sdkIntegrity,
      },
    ],
  }
  const sdkHostPackageRelease = {
    schema: "convax.host-package-release/1",
    profile: "convax.plugin-sdk-authoring-package/1",
    host: {
      repository: "convaxai/convax",
      commit: sdkCommit,
    },
    workflow: {
      ref:
        "convaxai/convax/.github/workflows/plugin-sdk-release.yml@refs/heads/main",
      runId: "77",
      runAttempt: "1",
    },
    package: {
      name: "@convax/plugin-sdk",
      version: sdkVersion,
      tarballSha256: sha256(sdkTarballBytes),
      tarballIntegrity: sdkIntegrity,
    },
    dependencies: [
      {
        name: "@convax/plugin-api",
        declaredRange: "^1.0.0",
        resolvedVersion: releaseApiVersion,
        tarballSha256: sha256(releaseApiTarballBytes),
        tarballIntegrity: releaseApiIntegrity,
        catalogSchema: "convax.plugin-api-catalog/3",
        catalogVersion: releaseApiVersion,
        catalogSha256: sha256(releaseApiCatalogBytes),
      },
    ],
    checks: sdkChecks.map(([id, command]) => ({ id, command, status: "passed" })),
  }
  return {
    actualApiCatalogBytes,
    actualApiMetadata: {
      name: "@convax/plugin-api",
      version: actualApiVersion,
      dist: {
        tarball:
          `https://registry.npmjs.org/@convax/plugin-api/-/plugin-api-${actualApiVersion}.tgz`,
        integrity: actualApiIntegrity,
      },
    },
    actualApiPackageJson: {
      name: "@convax/plugin-api",
      version: actualApiVersion,
    },
    actualApiRelease: {
      repository: "convaxai/convax",
      commit: apiCommit,
      tag: `plugin-api-v${actualApiVersion}-${apiCommit}`,
      workflowRef:
        "convaxai/convax/.github/workflows/plugin-api-release.yml@refs/heads/main",
    },
    actualApiRuntimeConformanceBytes: runtimeConformance({
      catalogBytes: actualApiCatalogBytes,
      commit: apiCommit,
      tarballBytes: actualApiTarballBytes,
      tarballIntegrity: actualApiIntegrity,
      version: actualApiVersion,
    }),
    actualApiTarballBytes,
    frozenLock,
    sdkHostPackageRelease,
    sdkMetadata: {
      name: "@convax/plugin-sdk",
      version: sdkVersion,
      dist: {
        tarball:
          `https://registry.npmjs.org/@convax/plugin-sdk/-/plugin-sdk-${sdkVersion}.tgz`,
        integrity: sdkIntegrity,
      },
    },
    sdkPackageJson: {
      name: "@convax/plugin-sdk",
      version: sdkVersion,
      dependencies: {
        "@convax/plugin-api": "^1.0.0",
      },
    },
    sdkRelease: {
      repository: "convaxai/convax",
      commit: sdkCommit,
      tag: `plugin-sdk-v${sdkVersion}-${sdkCommit}`,
      workflowRef:
        "convaxai/convax/.github/workflows/plugin-sdk-release.yml@refs/heads/main",
    },
    sdkReleaseApiCatalogBytes: releaseApiCatalogBytes,
    sdkReleaseApiPackageJson: {
      name: "@convax/plugin-api",
      version: releaseApiVersion,
    },
    sdkReleaseApiTarballBytes: releaseApiTarballBytes,
    sdkTarballBytes,
  }
}

describe("Plugin SDK consumer provenance", () => {
  test("rejects workspace/Git/file sources and records the exact npm lock closure", () => {
    const sdkBytes = Buffer.from("sdk")
    const apiBytes = Buffer.from("api")
    const lock = {
      lockfileVersion: 1,
      workspaces: {
        "": {
          devDependencies: {
            "@convax/plugin-api": "1.1.0",
            "@convax/plugin-sdk": "0.1.0",
          },
        },
      },
      packages: {
        "@convax/plugin-api": [
          "@convax/plugin-api@1.1.0",
          "",
          {},
          integrity(apiBytes),
        ],
        "@convax/plugin-sdk": [
          "@convax/plugin-sdk@0.1.0",
          "",
          { dependencies: { "@convax/plugin-api": "^1.0.0" } },
          integrity(sdkBytes),
        ],
      },
    }
    const input = {
      bunfigBytes: Buffer.from(
        '[install]\nregistry = "https://registry.npmjs.org"\n',
      ),
      lock,
      lockBytes: Buffer.from("frozen lock bytes"),
      rootPackage: {
        devDependencies: {
          "@convax/plugin-api": "1.1.0",
          "@convax/plugin-sdk": "0.1.0",
        },
      },
    }
    expect(inspectFrozenPluginSdkLock(input)).toEqual({
      schema: "convax.plugin-sdk-frozen-lock/1",
      registry: "https://registry.npmjs.org",
      lockfile: {
        path: "bun.lock",
        sha256: sha256(input.lockBytes),
      },
      dependencies: [
        {
          name: "@convax/plugin-api",
          version: "1.1.0",
          tarballIntegrity: integrity(apiBytes),
        },
        {
          name: "@convax/plugin-sdk",
          version: "0.1.0",
          tarballIntegrity: integrity(sdkBytes),
        },
      ],
    })

    lock.packages["@convax/plugin-sdk"][0] =
      "@convax/plugin-sdk@workspace:vendor/plugin-sdk"
    expect(() => inspectFrozenPluginSdkLock(input)).toThrow(
      "never Git/file/workspace",
    )
    lock.packages["@convax/plugin-sdk"][0] = "@convax/plugin-sdk@0.1.0"
    lock.workspaces["vendor/plugin-sdk"] = {
      name: "@convax/plugin-sdk",
      version: "0.1.0",
    }
    expect(() => inspectFrozenPluginSdkLock(input)).toThrow(
      "must not be shadowed by workspaces",
    )
  })

  test("cross-checks Host release, npm bytes, actual API closure and independent runtime evidence", () => {
    const input = fixture()
    const closure = verifyPluginSdkClosure(input)
    expect(closure.frozenLock.dependencies).toEqual([
      expect.objectContaining({
        name: "@convax/plugin-api",
        version: "1.1.0",
        tarballSha256: sha256(input.actualApiTarballBytes),
      }),
      expect.objectContaining({
        name: "@convax/plugin-sdk",
        version: "0.1.0",
        tarballSha256: sha256(input.sdkTarballBytes),
      }),
    ])
    expect(closure.hostReleases.pluginSdk.releaseTimeApiVersion).toBe("1.0.0")
    expect(closure.hostReleases.pluginApi.catalogSha256).toBe(
      sha256(input.actualApiCatalogBytes),
    )

    expect(() =>
      verifyPluginSdkClosure({
        ...input,
        actualApiTarballBytes: Buffer.from("different"),
      }),
    ).toThrow()
    expect(() =>
      verifyPluginSdkClosure({
        ...input,
        sdkRelease: {
          ...input.sdkRelease,
          workflowRef:
            "convaxai/convax/.github/workflows/plugin-sdk-bootstrap.yml@refs/heads/main",
        },
      }),
    ).toThrow("protected final release workflow")
  })

  test("does not allow a Host package release to substitute for capability approval", () => {
    const input = fixture()
    const release = parseHostPackageRelease(input.sdkHostPackageRelease, {
      ...input.sdkRelease,
      version: "0.1.0",
    })
    expect(release).not.toHaveProperty("decision")
    expect(release).not.toHaveProperty("request")
    expect(release.schema).not.toContain("capability-decision")
  })

  test("emits canonical bundle statements bound to lock, source entrypoints and exact ZIP", () => {
    const closure = verifyPluginSdkClosure(fixture())
    const statement = buildPluginBundleProvenance({
      buildEntrypoints: [
        {
          command: "bun tooling/official-marketplace-build.mjs",
          path: "tooling/official-marketplace-build.mjs",
          sha256: "d".repeat(64),
        },
      ],
      closure,
      commit: "e".repeat(40),
      output: {
        path: "catalog/releases/plugin-demo-v1.0.0/demo.zip",
        sha256: "f".repeat(64),
        size: 1024,
      },
      packageManifestSha256: "1".repeat(64),
      plugin: {
        id: "demo",
        version: "1.0.0",
        workspace: "packages/plugins/demo",
      },
    })
    const bytes = Buffer.from(`${canonicalJson(statement)}\n`)
    expect(parsePluginBundleProvenance(bytes)).toEqual(statement)
    expect(statement).not.toHaveProperty("capabilityDecision")
    expect(() =>
      parsePluginBundleProvenance(
        Buffer.from(`${JSON.stringify(statement, null, 2)}\n`),
      ),
    ).toThrow("canonical JSON")
    expect(() =>
      parseStrictJson(
        Buffer.from('{"schema":"x","schema":"y"}'),
        "duplicate fixture",
      ),
    ).toThrow("duplicate field schema")
  })

  test("implements stable caret ranges without accepting prerelease or adjacent majors", () => {
    expect(satisfiesCaret("1.9.0", "^1.0.0")).toBe(true)
    expect(satisfiesCaret("2.0.0", "^1.0.0")).toBe(false)
    expect(satisfiesCaret("0.1.9", "^0.1.0")).toBe(true)
    expect(satisfiesCaret("0.2.0", "^0.1.0")).toBe(false)
    expect(satisfiesCaret("1.1.0-beta.1", "^1.0.0")).toBe(false)
  })
})
