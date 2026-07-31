import { afterAll, describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { changedMarketplaceVersions } from "@convax/marketplace-kit"
import {
  assertSelectedCandidatesMatchSnapshot,
  createReleaseSelectionPlan,
  packageVersionSnapshot,
} from "./marketplace-release.mjs"
import { currentPluginApiCatalogEvidence } from "./host-capability-request.mjs"
import { composePublicationPlan } from "./publication-plan.mjs"

const temporaryDirectories = []

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "convax-marketplace-release-"),
  )
  temporaryDirectories.push(directory)
  return directory
}

async function writePolicy(root, requests = []) {
  await fs.mkdir(path.join(root, "registry"), { recursive: true })
  await fs.mkdir(
    path.join(root, "docs", "host-capability-requests"),
    { recursive: true },
  )
  await fs.writeFile(
    path.join(root, "registry", "host-capability-policy.json"),
    `${JSON.stringify({
      schema: "convax.host-capability-policy/1",
      requests,
    }, null, 2)}\n`,
  )
  for (const request of requests) {
    for (const affected of request.affected) {
      const packageJsonPath = path.join(
        root,
        "packages",
        affected.kind === "plugin" ? "plugins" : "skills",
        affected.id,
        "package.json",
      )
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, "utf8"),
      )
      packageJson["convax.hostCapabilityRequests"] = [
        ...(packageJson["convax.hostCapabilityRequests"] ?? []),
        request.id,
      ]
      await fs.writeFile(
        packageJsonPath,
        `${JSON.stringify(packageJson, null, 2)}\n`,
      )
    }
  }
}

async function writePlugin(root, version = "1.0.0") {
  const directory = path.join(root, "packages", "plugins", "example-plugin")
  await fs.mkdir(path.join(directory, "package"), { recursive: true })
  await fs.writeFile(
    path.join(directory, "convax-package.json"),
    `${JSON.stringify({
      schema: "convax.package/2",
      kind: "plugin",
      id: "example-plugin",
      name: "Example Plugin",
      description: "An example Plugin.",
      version,
      yanked: false,
    }, null, 2)}\n`,
  )
  await fs.writeFile(
    path.join(directory, "package.json"),
    `${JSON.stringify({
      name: "@microvoid/convax-plugin-example-plugin",
      version,
      private: true,
      type: "module",
      scripts: {
        validate: "true",
        pack: "true",
      },
    }, null, 2)}\n`,
  )
  await fs.writeFile(
    path.join(directory, "package", "manifest.json"),
    `${JSON.stringify({
      schema: "convax.plugin/8",
      id: "example-plugin",
      name: "Example Plugin",
      description: "An example Plugin.",
      version,
      entry: "index.html",
      capabilities: [],
      hostApi: {
        major: 2,
        required: ["host.context.get"],
        optional: [],
      },
      contributes: {
        canvas: { renderer: { create: true } },
      },
    }, null, 2)}\n`,
  )
  await fs.writeFile(
    path.join(directory, "package", "index.html"),
    "<!doctype html><title>Example</title>\n",
  )
}

async function writeReadyFixture(root, version = "1.0.0") {
  await writePolicy(root)
  await writePlugin(root, version)
}

async function writePendingRequestDocument(root, document, name) {
  const { digest, version } = currentPluginApiCatalogEvidence()
  const template = await fs.readFile(
    path.join(
      import.meta.dir,
      "..",
      "packages",
      "skills",
      "convax-plugin-authoring",
      "package",
      "references",
      "host-capability-request.md",
    ),
    "utf8",
  )
  const source = template
    .replace("<generic name>", name)
    .replace(
      "- Checked Catalog version:",
      `- Checked Catalog version: \`@convax/plugin-api@${version}\` fresh renderPluginApiJson SHA-256 \`${digest}\`.`,
    )
    .replace(
      /^- ([^:\n]+):$/gmu,
      "- $1: fixture evidence pending independent human review.",
    )
  await fs.mkdir(path.join(root, path.dirname(document)), {
    recursive: true,
  })
  await fs.writeFile(path.join(root, document), source)
}

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
  }).trim()
}

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      fs.rm(directory, { recursive: true, force: true })),
  )
})

describe("Marketplace Kit release selection and publication policy", () => {
  test("packageVersionSnapshot carries effective publication state without globally rejecting blocked source", async () => {
    const snapshot = await packageVersionSnapshot(
      path.resolve(import.meta.dir, ".."),
    )
    expect(snapshot.get("plugin\0chatcut")?.publication.status).toBe("blocked")
    expect(snapshot.get("skill\0chatcut")?.publication).toMatchObject({
      blockedBy: ["plugin/chatcut"],
      status: "blocked",
    })
    expect(snapshot.get("plugin\0hello-convax")?.publication).toEqual({
      blockedBy: [],
      blockers: [],
      status: "ready",
    })
  }, 30_000)

  test("fails closed when the sole publication policy is missing", async () => {
    const fixture = await temporaryDirectory()
    await writePlugin(fixture)
    await expect(packageVersionSnapshot(fixture))
      .rejects.toThrow("Host capability publication policy: cannot read")
  })

  test("rejects free-text resolved files in the capability request directory", async () => {
    const fixture = await temporaryDirectory()
    await writeReadyFixture(fixture)
    await fs.writeFile(
      path.join(
        fixture,
        "docs",
        "host-capability-requests",
        "locally-approved.md",
      ),
      [
        "# Local integration note",
        "",
        "Status: approved and integrated locally",
        "",
        "No protected receipt exists.",
        "",
      ].join("\n"),
    )
    await expect(packageVersionSnapshot(fixture))
      .rejects.toThrow(
        "is not pending and has no trusted machine-verifiable resolution",
      )
  })

  test("admits a ready package only through SDK and Marketplace Kit discovery", async () => {
    const fixture = await temporaryDirectory()
    await writeReadyFixture(fixture)
    const snapshot = await packageVersionSnapshot(fixture)
    expect(snapshot.get("plugin\0example-plugin")).toEqual({
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      id: "example-plugin",
      itemKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      kind: "plugin",
      publication: {
        blockedBy: [],
        blockers: [],
        status: "ready",
      },
      releaseTag: "plugin-example-plugin-v1.0.0",
      version: "1.0.0",
    })
  })

  test("reverse-binds a pending request to the exact blocked package version", async () => {
    const fixture = await temporaryDirectory()
    await writePlugin(fixture)
    const document =
      "docs/host-capability-requests/example-host-capability.md"
    await writePendingRequestDocument(
      fixture,
      document,
      "example host capability",
    )
    await writePolicy(fixture, [{
      id: "example-host-capability",
      document,
      status: "pending",
      humanDecision: null,
      affected: [{
        kind: "plugin",
        id: "example-plugin",
        version: "1.0.0",
        blocker: {
          code: "host-capability-review-required",
          note: `Missing generic contract. ${document}`,
        },
      }],
    }])
    const blockedSnapshot = await packageVersionSnapshot(fixture)
    expect(
      blockedSnapshot.get("plugin\0example-plugin")?.publication,
    ).toMatchObject({
      blockedBy: ["plugin/example-plugin"],
      status: "blocked",
    })

    const policy = JSON.parse(await fs.readFile(
      path.join(fixture, "registry", "host-capability-policy.json"),
      "utf8",
    ))
    policy.requests = []
    await fs.writeFile(
      path.join(fixture, "registry", "host-capability-policy.json"),
      `${JSON.stringify(policy, null, 2)}\n`,
    )
    await expect(packageVersionSnapshot(fixture))
      .rejects.toThrow(
        "required pending request example-host-capability is missing from publication policy",
      )
  })

  test("keeps every orthogonal request on one exact package version independently blocked", async () => {
    const fixture = await temporaryDirectory()
    await writePlugin(fixture)
    const generationDocument =
      "docs/host-capability-requests/generation-input-binding.md"
    const imageDocument =
      "docs/host-capability-requests/image-input-read.md"
    await Promise.all([
      writePendingRequestDocument(
        fixture,
        generationDocument,
        "generation input binding",
      ),
      writePendingRequestDocument(
        fixture,
        imageDocument,
        "image input read",
      ),
    ])
    await writePolicy(fixture, [
      {
        id: "image-input-read",
        document: imageDocument,
        status: "pending",
        humanDecision: null,
        affected: [{
          kind: "plugin",
          id: "example-plugin",
          version: "1.0.0",
          blocker: {
            code: "host-capability-review-required",
            note: `Missing image contract. ${imageDocument}`,
          },
        }],
      },
      {
        id: "generation-input-binding",
        document: generationDocument,
        status: "pending",
        humanDecision: null,
        affected: [{
          kind: "plugin",
          id: "example-plugin",
          version: "1.0.0",
          blocker: {
            code: "host-capability-review-required",
            note: `Missing generation contract. ${generationDocument}`,
          },
        }],
      },
    ])

    const snapshot = await packageVersionSnapshot(fixture)
    const publication =
      snapshot.get("plugin\0example-plugin")?.publication
    expect(publication).toEqual({
      blockedBy: ["plugin/example-plugin"],
      blockers: [
        {
          code: "host-capability-review-required",
          note: expect.stringContaining("[generation-input-binding]"),
        },
        {
          code: "host-capability-review-required",
          note: expect.stringContaining("[image-input-read]"),
        },
      ],
      status: "blocked",
    })
    expect(() =>
      assertSelectedCandidatesMatchSnapshot([{
        kind: "plugin",
        id: "example-plugin",
        version: "1.0.0",
        releaseTag: "plugin-example-plugin-v1.0.0",
      }], snapshot),
    ).toThrow(/generation-input-binding.*image-input-read/u)
  })

  test("rejects duplicate, over-bound, and version-drifted request declarations", async () => {
    const duplicateFixture = await temporaryDirectory()
    await writeReadyFixture(duplicateFixture)
    const duplicatePackagePath = path.join(
      duplicateFixture,
      "packages",
      "plugins",
      "example-plugin",
      "package.json",
    )
    const duplicatePackage = JSON.parse(
      await fs.readFile(duplicatePackagePath, "utf8"),
    )
    duplicatePackage["convax.hostCapabilityRequests"] = [
      "same-request",
      "same-request",
    ]
    await fs.writeFile(
      duplicatePackagePath,
      `${JSON.stringify(duplicatePackage, null, 2)}\n`,
    )
    await expect(packageVersionSnapshot(duplicateFixture))
      .rejects.toThrow(
        "convax.hostCapabilityRequests must contain at most 16 unique request ids",
      )

    const overBoundFixture = await temporaryDirectory()
    await writeReadyFixture(overBoundFixture)
    const overBoundPackagePath = path.join(
      overBoundFixture,
      "packages",
      "plugins",
      "example-plugin",
      "package.json",
    )
    const overBoundPackage = JSON.parse(
      await fs.readFile(overBoundPackagePath, "utf8"),
    )
    overBoundPackage["convax.hostCapabilityRequests"] = Array.from(
      { length: 17 },
      (_, index) => `request-${index + 1}`,
    )
    await fs.writeFile(
      overBoundPackagePath,
      `${JSON.stringify(overBoundPackage, null, 2)}\n`,
    )
    await expect(packageVersionSnapshot(overBoundFixture))
      .rejects.toThrow(
        "convax.hostCapabilityRequests must contain at most 16 unique request ids",
      )

    const driftFixture = await temporaryDirectory()
    await writePlugin(driftFixture, "1.0.0")
    const driftDocument =
      "docs/host-capability-requests/version-drift.md"
    await writePendingRequestDocument(
      driftFixture,
      driftDocument,
      "version drift",
    )
    await writePolicy(driftFixture, [{
      id: "version-drift",
      document: driftDocument,
      status: "pending",
      humanDecision: null,
      affected: [{
        kind: "plugin",
        id: "example-plugin",
        version: "2.0.0",
        blocker: {
          code: "host-capability-review-required",
          note: `Wrong package version. ${driftDocument}`,
        },
      }],
    }])
    await expect(packageVersionSnapshot(driftFixture))
      .rejects.toThrow(
        "must exactly match workspace declarations and policy affected versions",
      )
  })

  test("keeps an exact dependency declaration blocked after policy, document, and implementation rewrites", async () => {
    const fixture = await temporaryDirectory()
    await writePlugin(fixture)
    const document =
      "docs/host-capability-requests/web-plugin-image-input-read.md"
    await writePendingRequestDocument(
      fixture,
      document,
      "web Plugin image input read",
    )
    await writePolicy(fixture, [{
      id: "web-plugin-image-input-read",
      document,
      status: "pending",
      humanDecision: null,
      affected: [{
        kind: "plugin",
        id: "example-plugin",
        version: "1.0.0",
        blocker: {
          code: "host-capability-review-required",
          note: `Missing generic contract. ${document}`,
        },
      }],
    }])
    await fs.writeFile(
      path.join(
        fixture,
        "packages",
        "plugins",
        "example-plugin",
        "package",
        "assets.js",
      ),
      "const url = URL.createObjectURL(new Blob([]));\n",
    )
    const policyPath = path.join(
      fixture,
      "registry",
      "host-capability-policy.json",
    )
    await fs.writeFile(policyPath, `${JSON.stringify({
      schema: "convax.host-capability-policy/1",
      requests: [],
    }, null, 2)}\n`)
    await fs.unlink(path.join(fixture, document))
    await expect(packageVersionSnapshot(fixture))
      .rejects.toThrow(
        "required pending request web-plugin-image-input-read is missing",
      )
  })

  test("binds Marketplace Kit git-tree selections back to the policy-checked filesystem snapshot", async () => {
    const fixture = await temporaryDirectory()
    await writeReadyFixture(fixture, "1.0.0")
    git(fixture, ["init"])
    git(fixture, ["config", "user.email", "fixture@example.test"])
    git(fixture, ["config", "user.name", "Fixture"])
    git(fixture, ["add", "."])
    git(fixture, ["commit", "-m", "initial"])
    const base = git(fixture, ["rev-parse", "HEAD"])
    await writePlugin(fixture, "1.1.0")
    git(fixture, ["add", "."])
    git(fixture, ["commit", "-m", "release 1.1.0"])
    const selected = await changedMarketplaceVersions(fixture, base)
    const current = await packageVersionSnapshot(fixture)
    expect(selected).toEqual([{
      kind: "plugin",
      id: "example-plugin",
      version: "1.1.0",
      previousVersion: "1.0.0",
      releaseTag: "plugin-example-plugin-v1.1.0",
    }])
    expect(() =>
      assertSelectedCandidatesMatchSnapshot(selected, current),
    ).not.toThrow()
    expect(() =>
      assertSelectedCandidatesMatchSnapshot(
        [{ ...selected[0], version: "9.9.9" }],
        current,
      ),
    ).toThrow("version differs from current source")
  })

  test("omits only blocked exact selections and keeps unrelated ready releases", async () => {
    const fixture = await temporaryDirectory()
    await writePlugin(fixture)
    const document =
      "docs/host-capability-requests/example-host-capability.md"
    await writePendingRequestDocument(
      fixture,
      document,
      "example host capability",
    )
    await writePolicy(fixture, [{
      id: "example-host-capability",
      document,
      status: "pending",
      humanDecision: null,
      affected: [{
        kind: "plugin",
        id: "example-plugin",
        version: "1.0.0",
        blocker: {
          code: "host-capability-review-required",
          note: `Missing generic contract. ${document}`,
        },
      }],
    }])
    const snapshot = await packageVersionSnapshot(fixture)
    snapshot.set("skill\0ready-skill", {
      id: "ready-skill",
      kind: "skill",
      publication: { status: "ready", blockers: [], blockedBy: [] },
      releaseTag: "skill-ready-skill-v1.0.0",
      version: "1.0.0",
    })
    const blocked = {
      kind: "plugin",
      id: "example-plugin",
      version: "1.0.0",
      releaseTag: "plugin-example-plugin-v1.0.0",
    }
    const ready = {
      kind: "skill",
      id: "ready-skill",
      version: "1.0.0",
      releaseTag: "skill-ready-skill-v1.0.0",
    }
    const plan = createReleaseSelectionPlan([blocked, ready], snapshot)
    expect(plan.selected).toEqual([ready])
    expect(plan.omissions.omitted).toEqual([{
      ...blocked,
      publication: snapshot.get("plugin\0example-plugin").publication,
    }])
    expect(() =>
      assertSelectedCandidatesMatchSnapshot([blocked], snapshot),
    ).toThrow("is publication-blocked")
  })

  test("does not publish blocked Builtin or preinstalled bytes while unrelated ready releases continue", async () => {
    const [builtinConfig, preinstalledConfig] = await Promise.all([
      fs.readFile(
        path.join(import.meta.dir, "..", "catalogs", "builtin.json"),
        "utf8",
      ).then(JSON.parse),
      fs.readFile(
        path.join(import.meta.dir, "..", "catalogs", "preinstalled.json"),
        "utf8",
      ).then(JSON.parse),
    ])
    const builtin = builtinConfig.members[0]
    const preinstalled = preinstalledConfig.packages[0]
    const blockedPublication = {
      status: "blocked",
      blockers: [{
        code: "host-capability-review-required",
        note: "Pending generic contract.",
      }],
      blockedBy: [],
    }
    const ready = {
      kind: "plugin",
      id: "ready-plugin",
      version: "1.0.0",
      releaseTag: "plugin-ready-plugin-v1.0.0",
    }
    const blockedBuiltin = {
      kind: builtin.kind,
      id: builtin.id,
      version: "1.0.0",
      releaseTag: `skill-${builtin.id}-v1.0.0`,
    }
    const blockedPreinstalled = {
      kind: preinstalled.kind,
      id: preinstalled.id,
      version: "1.0.0",
      releaseTag: `plugin-${preinstalled.id}-v1.0.0`,
    }
    const snapshot = new Map([
      [
        `${blockedBuiltin.kind}\0${blockedBuiltin.id}`,
        { ...blockedBuiltin, publication: blockedPublication },
      ],
      [
        `${blockedPreinstalled.kind}\0${blockedPreinstalled.id}`,
        { ...blockedPreinstalled, publication: blockedPublication },
      ],
      [
        `${ready.kind}\0${ready.id}`,
        {
          ...ready,
          publication: { status: "ready", blockers: [], blockedBy: [] },
        },
      ],
    ])
    const selection = createReleaseSelectionPlan([
      blockedBuiltin,
      blockedPreinstalled,
      ready,
    ], snapshot)
    expect(selection.selected).toEqual([ready])
    expect(selection.omissions.omitted.map(({ kind, id }) =>
      `${kind}/${id}`)).toEqual([
      `${blockedBuiltin.kind}/${blockedBuiltin.id}`,
      `${blockedPreinstalled.kind}/${blockedPreinstalled.id}`,
    ])

    const metadataTag = `registry-v2-${"a".repeat(64)}`
    const builtinTag = `builtin-${"b".repeat(64)}`
    const publication = composePublicationPlan({
      builtin: {
        schema: "convax.release-plan/1",
        releases: [{
          tag: builtinTag,
          assets: [{
            path: `releases/${builtinTag}/convax-builtin-bundle.zip`,
          }],
        }],
      },
      catalog: {
        schema: "convax.release-plan/1",
        releases: [
          {
            tag: ready.releaseTag,
            assets: [{
              path: `releases/${ready.releaseTag}/plugin.zip`,
            }],
          },
          {
            tag: metadataTag,
            assets: [{
              path: `releases/${metadataTag}/registry-v2.json`,
            }],
          },
        ],
      },
      selected: selection.selected,
    })
    expect(publication.releases).toEqual([
      {
        directory: `catalog/releases/${ready.releaseTag}`,
        tag: ready.releaseTag,
      },
      {
        directory: `catalog/releases/${metadataTag}`,
        tag: metadataTag,
      },
    ])
    expect(
      publication.releases.some(({ tag }) =>
        tag === blockedBuiltin.releaseTag ||
        tag === blockedPreinstalled.releaseTag ||
        tag === builtinTag),
    ).toBe(false)
  })

  test("rejects catalog-affecting metadata changes without a version bump", async () => {
    const fixture = await temporaryDirectory()
    await writeReadyFixture(fixture, "1.0.0")
    git(fixture, ["init"])
    git(fixture, ["config", "user.email", "fixture@example.test"])
    git(fixture, ["config", "user.name", "Fixture"])
    git(fixture, ["add", "."])
    git(fixture, ["commit", "-m", "initial"])
    const base = git(fixture, ["rev-parse", "HEAD"])
    const before = await packageVersionSnapshot(fixture)
    const metadataPath = path.join(
      fixture,
      "packages",
      "plugins",
      "example-plugin",
      "convax-package.json",
    )
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"))
    metadata.yanked = true
    await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
    const after = await packageVersionSnapshot(fixture)
    expect(after.get("plugin\0example-plugin").digest)
      .not.toBe(before.get("plugin\0example-plugin").digest)
    await expect(changedMarketplaceVersions(fixture, base))
      .rejects.toThrow(/version|changed/i)
  })

  test("composes only canonical selected package and Registry releases", () => {
    const selected = [{
      kind: "plugin",
      id: "example-plugin",
      version: "1.1.0",
      previousVersion: "1.0.0",
      releaseTag: "plugin-example-plugin-v1.1.0",
    }]
    const catalog = {
      schema: "convax.release-plan/1",
      releases: [
        {
          tag: "plugin-example-plugin-v1.1.0",
          assets: [{
            path: "releases/plugin-example-plugin-v1.1.0/plugin.zip",
          }],
        },
        {
          tag: `registry-v2-${"a".repeat(64)}`,
          assets: [{
            path: `releases/registry-v2-${"a".repeat(64)}/registry-v2.json`,
          }],
        },
      ],
    }
    expect(composePublicationPlan({
      builtin: { schema: "convax.release-plan/1", releases: [] },
      catalog,
      selected,
    })).toEqual({
      schema: "convax.publication-plan/1",
      releases: [
        {
          directory: "catalog/releases/plugin-example-plugin-v1.1.0",
          tag: "plugin-example-plugin-v1.1.0",
        },
        {
          directory: `catalog/releases/registry-v2-${"a".repeat(64)}`,
          tag: `registry-v2-${"a".repeat(64)}`,
        },
      ],
    })
  })
})
