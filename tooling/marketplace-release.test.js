import { afterAll, describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  buildMarketplace,
  changedMarketplaceVersions,
} from "@convax/marketplace-kit"
import {
  assertSelectedCandidatesMatchSnapshot,
  createReleaseSelectionPlan,
  includeCatalogReactivations,
  includeMissingProductionPackages,
  packageVersionSnapshot,
} from "./marketplace-release.mjs"
import { createV8CutoverSelections } from "./marketplace-v8-cutover.mjs"
import { composePublicationPlan } from "./publication-plan.mjs"

const temporaryDirectories = []

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "convax-marketplace-release-"),
  )
  temporaryDirectories.push(directory)
  return directory
}

async function writePolicy(root, requests = []) {
  await fs.mkdir(path.join(root, "registry"), { recursive: true })
  await fs.mkdir(path.join(root, "docs", "host-capability-requests"), {
    recursive: true,
  })
  await fs.writeFile(
    path.join(root, "registry", "host-capability-policy.json"),
    `${JSON.stringify(
      {
        schema: "convax.host-capability-policy/3",
        requirements: requests.map((request) => ({
          id: request.id,
          verification: "package-conformance",
          acceptedApiContracts: [],
          affected: request.affected.map(({ kind, id, version }) => ({
            kind,
            id,
            version,
          })),
        })),
        blockers: requests.map((request) => ({
          id: request.id,
          affected: request.affected.map(({ kind, id, version, blocker }) => ({
            kind,
            id,
            version,
            blocker: {
              code: blocker.code,
              note: blocker.note,
            },
          })),
        })),
      },
      null,
      2,
    )}\n`,
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
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"))
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
    `${JSON.stringify(
      {
        schema: "convax.package/2",
        kind: "plugin",
        id: "example-plugin",
        name: "Example Plugin",
        description: "An example Plugin.",
        version,
        yanked: false,
      },
      null,
      2,
    )}\n`,
  )
  await fs.writeFile(
    path.join(directory, "package.json"),
    `${JSON.stringify(
      {
        name: "@microvoid/convax-plugin-example-plugin",
        version,
        private: true,
        type: "module",
        scripts: {
          validate: "true",
          pack: "true",
        },
      },
      null,
      2,
    )}\n`,
  )
  await fs.writeFile(
    path.join(directory, "package", "manifest.json"),
    `${JSON.stringify(
      {
        schema: "convax.plugin/8",
        id: "example-plugin",
        name: "Example Plugin",
        description: "An example Plugin.",
        version,
        entry: "index.html",
        capabilities: [],
        hostApi: {
          major: 3,
          required: ["host.context.get"],
          optional: [],
        },
        contributes: {
          canvas: { renderer: { create: true } },
        },
      },
      null,
      2,
    )}\n`,
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

async function writeOwnedSkillMarketplaceFixture(root) {
  await fs.copyFile(
    path.resolve(import.meta.dir, "..", "marketplace.json"),
    path.join(root, "marketplace.json"),
  )
  await writePlugin(root)
  const manifestPath = path.join(
    root,
    "packages",
    "plugins",
    "example-plugin",
    "package",
    "manifest.json",
  )
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
  manifest.contributes.skills = [
    { name: "example-guide", path: "skills/example-guide" },
  ]
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const skillRoot = path.join(
    root,
    "packages",
    "skills",
    "example-guide",
  )
  await fs.mkdir(path.join(skillRoot, "package"), { recursive: true })
  await fs.writeFile(
    path.join(skillRoot, "convax-package.json"),
    `${JSON.stringify(
      {
        schema: "convax.package/2",
        kind: "skill",
        id: "example-guide",
        name: "Example Guide",
        description: "An owned example Skill.",
        version: "1.0.0",
        ownerPluginId: "example-plugin",
        yanked: false,
      },
      null,
      2,
    )}\n`,
  )
  await fs.writeFile(
    path.join(skillRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "@example/convax-skill-example-guide",
        version: "1.0.0",
        private: true,
        type: "module",
        scripts: { validate: "true", pack: "true" },
      },
      null,
      2,
    )}\n`,
  )
  await fs.writeFile(
    path.join(skillRoot, "package", "SKILL.md"),
    [
      "---",
      "name: example-guide",
      "version: 1.0.0",
      "description: Exercise an owned example Skill.",
      "---",
      "",
      "# Example Guide",
      "",
      "Use the owning Plugin through its documented contracts.",
      "",
    ].join("\n"),
  )
}

async function writePendingRequestDocument(root, document, name) {
  await fs.mkdir(path.join(root, path.dirname(document)), {
    recursive: true,
  })
  await fs.writeFile(
    path.join(root, document),
    `# Archived capability note: ${name}\n`,
  )
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
      fs.rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe("Marketplace Kit release selection and publication policy", () => {
  test("requires every legacy production package to advance during the v8 cutover", () => {
    const previous = {
      packages: [
        {
          kind: "plugin",
          id: "example-plugin",
          version: "1.0.0",
        },
      ],
    }
    const current = new Map([
      [
        "plugin\0example-plugin",
        {
          kind: "plugin",
          id: "example-plugin",
          version: "2.0.0",
          releaseTag: "plugin-example-plugin-v2.0.0",
        },
      ],
      [
        "skill\0new-skill",
        {
          kind: "skill",
          id: "new-skill",
          version: "1.0.0",
          releaseTag: "skill-new-skill-v1.0.0",
        },
      ],
    ])
    expect(createV8CutoverSelections(previous, current)).toEqual([
      {
        kind: "plugin",
        id: "example-plugin",
        version: "2.0.0",
        previousVersion: "1.0.0",
        releaseTag: "plugin-example-plugin-v2.0.0",
      },
      {
        kind: "skill",
        id: "new-skill",
        version: "1.0.0",
        releaseTag: "skill-new-skill-v1.0.0",
      },
    ])
    expect(() =>
      createV8CutoverSelections(
        previous,
        new Map([
          [
            "plugin\0example-plugin",
            {
              ...current.get("plugin\0example-plugin"),
              version: "1.0.0",
            },
          ],
        ]),
      ),
    ).toThrow("version must advance beyond 1.0.0")
    expect(() => createV8CutoverSelections(previous, new Map())).toThrow(
      "cannot silently remove plugin/example-plugin",
    )
  })

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
    const helloGuide = snapshot.get("skill\0hello-convax-guide")
    expect(helloGuide?.ownerPluginId).toBe("hello-convax")
    const excludedHello = createReleaseSelectionPlan(
      [
        {
          kind: helloGuide.kind,
          id: helloGuide.id,
          version: helloGuide.version,
          releaseTag: helloGuide.releaseTag,
        },
      ],
      snapshot,
      {
        excluded: [{ kind: "plugin", id: "hello-convax" }],
      },
    )
    expect(excludedHello.selected).toEqual([])
    expect(excludedHello.omissions.omitted).toMatchObject([
      {
        kind: "skill",
        id: "hello-convax-guide",
        publication: {
          blockers: [{ code: "catalog-policy-excluded" }],
        },
      },
    ])
  }, 30_000)

  test("reactivates an unchanged Plugin and its owned Skill when catalog exclusion is removed", () => {
    const current = new Map([
      [
        "plugin\0hello-convax",
        {
          kind: "plugin",
          id: "hello-convax",
          version: "0.2.1",
          releaseTag: "plugin-hello-convax-v0.2.1",
          publication: { status: "ready", blockers: [], blockedBy: [] },
        },
      ],
      [
        "skill\0hello-convax-guide",
        {
          kind: "skill",
          id: "hello-convax-guide",
          ownerPluginId: "hello-convax",
          version: "0.3.0",
          releaseTag: "skill-hello-convax-guide-v0.3.0",
          publication: { status: "ready", blockers: [], blockedBy: [] },
        },
      ],
      [
        "plugin\0new-plugin",
        {
          kind: "plugin",
          id: "new-plugin",
          version: "1.0.0",
          releaseTag: "plugin-new-plugin-v1.0.0",
          publication: { status: "ready", blockers: [], blockedBy: [] },
        },
      ],
    ])
    const changed = [
      {
        kind: "plugin",
        id: "new-plugin",
        version: "1.0.0",
        releaseTag: "plugin-new-plugin-v1.0.0",
      },
    ]
    expect(
      includeCatalogReactivations(changed, current, {
        excluded: [],
        previousExcluded: [{ kind: "plugin", id: "hello-convax" }],
      }),
    ).toEqual([
      {
        kind: "plugin",
        id: "hello-convax",
        version: "0.2.1",
        releaseTag: "plugin-hello-convax-v0.2.1",
      },
      changed[0],
      {
        kind: "skill",
        id: "hello-convax-guide",
        version: "0.3.0",
        releaseTag: "skill-hello-convax-guide-v0.3.0",
      },
    ])
  })

  test("reactivates an automatically ready closure missing from production", () => {
    const current = new Map([
      [
        "plugin\0jianying-editor",
        {
          kind: "plugin",
          id: "jianying-editor",
          version: "3.0.3",
          releaseTag: "plugin-jianying-editor-v3.0.3",
          publication: { status: "ready", blockers: [], blockedBy: [] },
        },
      ],
      [
        "skill\0jianying-editor",
        {
          kind: "skill",
          id: "jianying-editor",
          ownerPluginId: "jianying-editor",
          version: "3.0.0",
          releaseTag: "skill-jianying-editor-v3.0.0",
          publication: { status: "ready", blockers: [], blockedBy: [] },
        },
      ],
      [
        "plugin\0chatcut",
        {
          kind: "plugin",
          id: "chatcut",
          version: "0.4.2",
          releaseTag: "plugin-chatcut-v0.4.2",
          publication: {
            status: "blocked",
            blockers: [
              {
                code: "unverified-runtime-dependency",
                note: "Uses ambient PATH.",
              },
            ],
            blockedBy: ["plugin/chatcut"],
          },
        },
      ],
    ])
    const production = {
      packages: [{ kind: "plugin", id: "unrelated", version: "1.0.0" }],
    }
    expect(includeMissingProductionPackages([], current, production)).toEqual([
      {
        kind: "plugin",
        id: "jianying-editor",
        version: "3.0.3",
        releaseTag: "plugin-jianying-editor-v3.0.3",
      },
      {
        kind: "skill",
        id: "jianying-editor",
        version: "3.0.0",
        releaseTag: "skill-jianying-editor-v3.0.0",
      },
    ])

    expect(
      includeMissingProductionPackages([], current, {
        packages: [{ kind: "plugin", id: "jianying-editor", version: "3.0.3" }],
      }),
    ).toEqual([
      {
        kind: "skill",
        id: "jianying-editor",
        version: "3.0.0",
        releaseTag: "skill-jianying-editor-v3.0.0",
      },
    ])
  })

  test("inherits an exact production owner while selectively adding its missing Skill", async () => {
    const fixture = await temporaryDirectory()
    await writeOwnedSkillMarketplaceFixture(fixture)
    const initialOut = path.join(fixture, "initial")
    const initial = await buildMarketplace({
      root: fixture,
      outDir: initialOut,
      sequence: 7,
    })
    const owner = initial.registry.packages.find(
      (entry) => entry.kind === "plugin" && entry.id === "example-plugin",
    )
    expect(owner).toBeDefined()
    const productionPackages = [owner]
    const productionRevision = sha256(canonicalJson(productionPackages))
    const productionRegistry = {
      schema: "convax.registry/2",
      marketplaceId: "convax-official",
      sequence: initial.registry.sequence,
      revision: productionRevision,
      packages: productionPackages,
    }
    const productionShowcase = {
      schema: "convax.showcase/2",
      marketplaceId: "convax-official",
      revision: productionRevision,
      packages: [],
    }
    const previousRoot = path.join(fixture, "previous")
    await fs.mkdir(previousRoot)
    const previousDescriptorPath = path.join(previousRoot, "marketplace.json")
    const previousRegistryPath = path.join(previousRoot, "registry-v2.json")
    const previousShowcasePath = path.join(previousRoot, "showcase-v2.json")
    await Promise.all([
      fs.copyFile(path.join(fixture, "marketplace.json"), previousDescriptorPath),
      fs.writeFile(
        previousRegistryPath,
        `${JSON.stringify(productionRegistry, null, 2)}\n`,
      ),
      fs.writeFile(
        previousShowcasePath,
        `${JSON.stringify(productionShowcase, null, 2)}\n`,
      ),
    ])

    const current = new Map([
      [
        "plugin\0example-plugin",
        {
          kind: "plugin",
          id: "example-plugin",
          version: "1.0.0",
          releaseTag: "plugin-example-plugin-v1.0.0",
          publication: { status: "ready", blockers: [], blockedBy: [] },
        },
      ],
      [
        "skill\0example-guide",
        {
          kind: "skill",
          id: "example-guide",
          ownerPluginId: "example-plugin",
          version: "1.0.0",
          releaseTag: "skill-example-guide-v1.0.0",
          publication: { status: "ready", blockers: [], blockedBy: [] },
        },
      ],
    ])
    const selections = includeMissingProductionPackages(
      [],
      current,
      productionRegistry,
    )
    expect(selections).toEqual([
      {
        kind: "skill",
        id: "example-guide",
        version: "1.0.0",
        releaseTag: "skill-example-guide-v1.0.0",
      },
    ])

    const inheritedArtifacts = new Map(
      initial.artifacts.map((artifact) => [artifact.url, artifact]),
    )
    const selective = await buildMarketplace({
      root: fixture,
      outDir: path.join(fixture, "selective"),
      previousDescriptorPath,
      previousRegistryPath,
      previousShowcasePath,
      publishSelections: selections,
      fetchArtifact: async (artifact) => {
        const inherited = inheritedArtifacts.get(artifact.url)
        if (!inherited) throw new Error(`Unexpected inherited artifact ${artifact.url}`)
        return new Uint8Array(await fs.readFile(inherited.path))
      },
    })
    expect(
      selective.selectionContext?.selectedPackages.map(
        ({ kind, id, productionPreviousVersion }) => ({
          kind,
          id,
          productionPreviousVersion,
        }),
      ),
    ).toEqual([
      {
        kind: "skill",
        id: "example-guide",
        productionPreviousVersion: undefined,
      },
    ])
    expect(
      selective.registry.packages.map(({ kind, id, version }) => ({
        kind,
        id,
        version,
      })),
    ).toEqual([
      { kind: "plugin", id: "example-plugin", version: "1.0.0" },
      { kind: "skill", id: "example-guide", version: "1.0.0" },
    ])
    expect(
      selective.registry.packages.find(
        (entry) => entry.kind === "plugin" && entry.id === "example-plugin",
      ),
    ).toEqual(owner)
  })

  test("fails closed when the sole publication policy is missing", async () => {
    const fixture = await temporaryDirectory()
    await writePlugin(fixture)
    await expect(packageVersionSnapshot(fixture)).rejects.toThrow(
      "Automated publication policy: cannot read",
    )
  })

  test("does not treat archival request text as publication authority", async () => {
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
    await expect(packageVersionSnapshot(fixture)).resolves.toBeInstanceOf(Map)
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
    const document = "docs/host-capability-requests/example-host-capability.md"
    await writePendingRequestDocument(
      fixture,
      document,
      "example host capability",
    )
    await writePolicy(fixture, [
      {
        id: "example-host-capability",
        affected: [
          {
            kind: "plugin",
            id: "example-plugin",
            version: "1.0.0",
            blocker: {
              code: "unverified-runtime-dependency",
              note: `Missing generic contract. ${document}`,
            },
          },
        ],
      },
    ])
    const blockedSnapshot = await packageVersionSnapshot(fixture)
    expect(
      blockedSnapshot.get("plugin\0example-plugin")?.publication,
    ).toMatchObject({
      blockedBy: ["plugin/example-plugin"],
      status: "blocked",
    })

    const policy = JSON.parse(
      await fs.readFile(
        path.join(fixture, "registry", "host-capability-policy.json"),
        "utf8",
      ),
    )
    policy.requirements = []
    await fs.writeFile(
      path.join(fixture, "registry", "host-capability-policy.json"),
      `${JSON.stringify(policy, null, 2)}\n`,
    )
    await expect(packageVersionSnapshot(fixture)).rejects.toThrow(
      "declared automated requirement example-host-capability is missing from publication policy",
    )
  })

  test("keeps every orthogonal request on one exact package version independently blocked", async () => {
    const fixture = await temporaryDirectory()
    await writePlugin(fixture)
    const generationDocument =
      "docs/host-capability-requests/generation-input-binding.md"
    const imageDocument = "docs/host-capability-requests/image-input-read.md"
    await Promise.all([
      writePendingRequestDocument(
        fixture,
        generationDocument,
        "generation input binding",
      ),
      writePendingRequestDocument(fixture, imageDocument, "image input read"),
    ])
    await writePolicy(fixture, [
      {
        id: "image-input-read",
        affected: [
          {
            kind: "plugin",
            id: "example-plugin",
            version: "1.0.0",
            blocker: {
              code: "unverified-runtime-dependency",
              note: `Missing image contract. ${imageDocument}`,
            },
          },
        ],
      },
      {
        id: "generation-input-binding",
        affected: [
          {
            kind: "plugin",
            id: "example-plugin",
            version: "1.0.0",
            blocker: {
              code: "unverified-runtime-dependency",
              note: `Missing generation contract. ${generationDocument}`,
            },
          },
        ],
      },
    ])

    const snapshot = await packageVersionSnapshot(fixture)
    const publication = snapshot.get("plugin\0example-plugin")?.publication
    expect(publication).toEqual({
      blockedBy: ["plugin/example-plugin"],
      blockers: [
        {
          code: "unverified-runtime-dependency",
          note: expect.stringContaining("[generation-input-binding]"),
        },
        {
          code: "unverified-runtime-dependency",
          note: expect.stringContaining("[image-input-read]"),
        },
      ],
      status: "blocked",
    })
    expect(() =>
      assertSelectedCandidatesMatchSnapshot(
        [
          {
            kind: "plugin",
            id: "example-plugin",
            version: "1.0.0",
            releaseTag: "plugin-example-plugin-v1.0.0",
          },
        ],
        snapshot,
      ),
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
    await expect(packageVersionSnapshot(duplicateFixture)).rejects.toThrow(
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
    await expect(packageVersionSnapshot(overBoundFixture)).rejects.toThrow(
      "convax.hostCapabilityRequests must contain at most 16 unique request ids",
    )

    const driftFixture = await temporaryDirectory()
    await writePlugin(driftFixture, "1.0.0")
    const driftDocument = "docs/host-capability-requests/version-drift.md"
    await writePendingRequestDocument(
      driftFixture,
      driftDocument,
      "version drift",
    )
    await writePolicy(driftFixture, [
      {
        id: "version-drift",
        affected: [
          {
            kind: "plugin",
            id: "example-plugin",
            version: "2.0.0",
            blocker: {
              code: "unverified-runtime-dependency",
              note: `Wrong package version. ${driftDocument}`,
            },
          },
        ],
      },
    ])
    await expect(packageVersionSnapshot(driftFixture)).rejects.toThrow(
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
    await writePolicy(fixture, [
      {
        id: "web-plugin-image-input-read",
        affected: [
          {
            kind: "plugin",
            id: "example-plugin",
            version: "1.0.0",
            blocker: {
              code: "unverified-runtime-dependency",
              note: `Missing generic contract. ${document}`,
            },
          },
        ],
      },
    ])
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
    await fs.writeFile(
      policyPath,
      `${JSON.stringify(
        {
          schema: "convax.host-capability-policy/3",
          requirements: [],
          blockers: [],
        },
        null,
        2,
      )}\n`,
    )
    await fs.unlink(path.join(fixture, document))
    await expect(packageVersionSnapshot(fixture)).rejects.toThrow(
      "declared automated requirement web-plugin-image-input-read is missing",
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
    expect(selected).toEqual([
      {
        kind: "plugin",
        id: "example-plugin",
        version: "1.1.0",
        previousVersion: "1.0.0",
        releaseTag: "plugin-example-plugin-v1.1.0",
      },
    ])
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
    const document = "docs/host-capability-requests/example-host-capability.md"
    await writePendingRequestDocument(
      fixture,
      document,
      "example host capability",
    )
    await writePolicy(fixture, [
      {
        id: "example-host-capability",
        affected: [
          {
            kind: "plugin",
            id: "example-plugin",
            version: "1.0.0",
            blocker: {
              code: "unverified-runtime-dependency",
              note: `Missing generic contract. ${document}`,
            },
          },
        ],
      },
    ])
    const snapshot = await packageVersionSnapshot(fixture)
    snapshot.set("skill\0ready-skill", {
      id: "ready-skill",
      kind: "skill",
      ownerPluginId: "example-plugin",
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
    expect(plan.omissions.omitted).toEqual([
      {
        ...blocked,
        publication: snapshot.get("plugin\0example-plugin").publication,
      },
    ])
    const excludedPlan = createReleaseSelectionPlan([ready], snapshot, {
      excluded: [{ kind: "plugin", id: "example-plugin" }],
    })
    expect(excludedPlan.selected).toEqual([])
    expect(excludedPlan.omissions.omitted).toEqual([
      {
        ...ready,
        publication: {
          status: "blocked",
          blockers: [
            {
              code: "catalog-policy-excluded",
              note: "Excluded from the Official Catalog publication view.",
            },
          ],
          blockedBy: [],
        },
      },
    ])
    expect(() =>
      assertSelectedCandidatesMatchSnapshot([blocked], snapshot),
    ).toThrow("is publication-blocked")
  })

  test("does not publish blocked Builtin or packaged bytes while unrelated ready releases continue", async () => {
    const [builtinConfig, packagedConfig] = await Promise.all([
      fs
        .readFile(
          path.join(import.meta.dir, "..", "catalogs", "builtin.json"),
          "utf8",
        )
        .then(JSON.parse),
      fs
        .readFile(
          path.join(import.meta.dir, "..", "catalogs", "packaged.json"),
          "utf8",
        )
        .then(JSON.parse),
    ])
    const builtin = builtinConfig.members[0]
    const packaged = packagedConfig.packages[0]
    const blockedPublication = {
      status: "blocked",
      blockers: [
        {
          code: "unverified-runtime-dependency",
          note: "Pending generic contract.",
        },
      ],
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
    const blockedPackaged = {
      kind: packaged.kind,
      id: packaged.id,
      version: "1.0.0",
      releaseTag: `plugin-${packaged.id}-v1.0.0`,
    }
    const snapshot = new Map([
      [
        `${blockedBuiltin.kind}\0${blockedBuiltin.id}`,
        { ...blockedBuiltin, publication: blockedPublication },
      ],
      [
        `${blockedPackaged.kind}\0${blockedPackaged.id}`,
        { ...blockedPackaged, publication: blockedPublication },
      ],
      [
        `${ready.kind}\0${ready.id}`,
        {
          ...ready,
          publication: { status: "ready", blockers: [], blockedBy: [] },
        },
      ],
    ])
    const selection = createReleaseSelectionPlan(
      [blockedBuiltin, blockedPackaged, ready],
      snapshot,
    )
    expect(selection.selected).toEqual([ready])
    expect(
      selection.omissions.omitted.map(({ kind, id }) => `${kind}/${id}`),
    ).toEqual([
      `${blockedBuiltin.kind}/${blockedBuiltin.id}`,
      `${blockedPackaged.kind}/${blockedPackaged.id}`,
    ])

    const metadataTag = `registry-v2-${"a".repeat(64)}`
    const builtinTag = `builtin-${"b".repeat(64)}`
    const publication = composePublicationPlan({
      builtin: {
        schema: "convax.release-plan/1",
        releases: [
          {
            tag: builtinTag,
            assets: [
              {
                path: `releases/${builtinTag}/convax-builtin-bundle.zip`,
              },
            ],
          },
        ],
      },
      catalog: {
        schema: "convax.release-plan/1",
        releases: [
          {
            tag: ready.releaseTag,
            assets: [
              {
                path: `releases/${ready.releaseTag}/plugin.zip`,
              },
            ],
          },
          {
            tag: metadataTag,
            assets: [
              {
                path: `releases/${metadataTag}/registry-v2.json`,
              },
            ],
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
      publication.releases.some(
        ({ tag }) =>
          tag === blockedBuiltin.releaseTag ||
          tag === blockedPackaged.releaseTag ||
          tag === builtinTag,
      ),
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
    expect(after.get("plugin\0example-plugin").digest).not.toBe(
      before.get("plugin\0example-plugin").digest,
    )
    await expect(changedMarketplaceVersions(fixture, base)).rejects.toThrow(
      /version|changed/i,
    )
  })

  test("composes only canonical selected package and Registry releases", () => {
    const selected = [
      {
        kind: "plugin",
        id: "example-plugin",
        version: "1.1.0",
        previousVersion: "1.0.0",
        releaseTag: "plugin-example-plugin-v1.1.0",
      },
    ]
    const catalog = {
      schema: "convax.release-plan/1",
      releases: [
        {
          tag: "plugin-example-plugin-v1.1.0",
          assets: [
            {
              path: "releases/plugin-example-plugin-v1.1.0/plugin.zip",
            },
          ],
        },
        {
          tag: `registry-v2-${"a".repeat(64)}`,
          assets: [
            {
              path: `releases/registry-v2-${"a".repeat(64)}/registry-v2.json`,
            },
          ],
        },
      ],
    }
    expect(
      composePublicationPlan({
        builtin: { schema: "convax.release-plan/1", releases: [] },
        catalog,
        selected,
      }),
    ).toEqual({
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
