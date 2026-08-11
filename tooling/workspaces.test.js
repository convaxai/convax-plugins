import { describe, expect, test } from "bun:test"
import { renderPluginApiJson } from "@convax/plugin-api/generator"
import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  discoverPackages,
  readJson,
  readJsonc,
  readStoredZip,
  root,
} from "./lib.mjs"
import {
  createPackSelection,
  packFromArgs,
  packPackages,
} from "./pack.mjs"
import { runWorkspaceScript } from "./run-workspace-script.mjs"

const collections = ["plugins", "skills", "tools"]

describe("Bun workspace ownership", () => {
  test("parses Bun's JSONC lockfile without weakening strict package JSON", async () => {
    const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "convax-bun-lock-"))
    try {
      const lockPath = path.join(fixture, "bun.lock")
      await fs.writeFile(lockPath, '{\n  // Bun lockfiles are JSONC\n  "lockfileVersion": 1,\n}\n')

      await expect(readJson(lockPath)).rejects.toThrow("invalid JSON")
      await expect(readJsonc(lockPath)).resolves.toEqual({ lockfileVersion: 1 })
    } finally {
      await fs.rm(fixture, { force: true, recursive: true })
    }
  })

  test("declares Plugin, Skill, MCP Server, and Tool source collections", async () => {
    const rootPackage = await readJson(path.join(root, "package.json"))
    expect(rootPackage.workspaces).toEqual([
      "vendor/host-packages/*",
      "packages/plugins/*",
      "packages/skills/*",
      "packages/mcp-servers/*",
      "packages/tools/*",
    ])

    for (const collection of collections) {
      const directory = path.join(root, "packages", collection)
      const entries = await fs.readdir(directory, { withFileTypes: true })
      for (const entry of entries.filter((item) => item.isDirectory())) {
        const workspace = await readJson(path.join(directory, entry.name, "package.json"))
        expect(workspace.private).toBe(true)
        expect(workspace.type).toBe("module")
        expect(typeof workspace.name).toBe("string")
        expect(typeof workspace.version).toBe("string")
        if (workspace.scripts?.pack?.includes("tooling/pack.mjs")) {
          expect(workspace.scripts.pack).toContain(
            '--catalog "${CONVAX_PLUGIN_API_CATALOG:-../../../node_modules/@convax/plugin-api/dist/generated/plugin-api.json}"',
          )
        }
        await expect(fs.stat(path.join(directory, entry.name, "bun.lock"))).rejects.toMatchObject({ code: "ENOENT" })
      }
    }
  })

  test("uses the official npm registry and keeps one frozen root lockfile", async () => {
    const lockPath = path.join(root, "bun.lock")
    const [lock, lockText, bunfig] = await Promise.all([
      readJsonc(lockPath),
      fs.readFile(lockPath, "utf8"),
      fs.readFile(path.join(root, "bunfig.toml"), "utf8"),
    ])

    expect(bunfig).toBe('[install]\nregistry = "https://registry.npmjs.org"\n')
    for (const entry of Object.values(lock.packages)) {
      const source = Array.isArray(entry) ? entry[1] : undefined
      if (typeof source === "string" && source.startsWith("http")) {
        expect(source).toStartWith("https://registry.npmjs.org/")
      }
    }

    expect(lock.lockfileVersion).toBe(1)
    expect(Object.keys(lock.workspaces)).toContain("packages/tools/codex-mcp")
    expect(Object.keys(lock.workspaces)).toContain("packages/plugins/codex-service")
    expect(Object.keys(lock.workspaces)).toContain("packages/tools/ffmpeg-mcp")
    expect(Object.keys(lock.workspaces)).toContain("packages/skills/ffmpeg-canvas")
  })

  test("dogfoods one exact public Kit and documents the third-party scaffold path", async () => {
    const [rootPackage, candidateReadme, readme, readmeZh] = await Promise.all([
      readJson(path.join(root, "package.json")),
      fs.readFile(path.join(root, "vendor", "README.md"), "utf8"),
      fs.readFile(path.join(root, "README.md"), "utf8"),
      fs.readFile(path.join(root, "README.zh-CN.md"), "utf8"),
    ])
    expect(rootPackage.devDependencies["@convax/marketplace-kit"]).toBe("workspace:*")
    expect(rootPackage.devDependencies["@convax/plugin-api"]).toBe("workspace:*")
    expect(rootPackage.devDependencies["@convax/plugin-sdk"]).toBe("workspace:*")
    expect(rootPackage.devDependencies["@convax/marketplace-kit"]).not.toContain("file:")
    expect(candidateReadme).toContain("temporary CI inputs")
    expect(candidateReadme).toContain("own or modify their source")
    expect(candidateReadme).toContain("workspace:*")
    const hostCandidates = {
      "bounded-value": ["@convax/bounded-value", "0.1.0"],
      marketplace: ["@convax/marketplace", "0.2.1"],
      "marketplace-kit": ["@convax/marketplace-kit", "0.2.2"],
      "plugin-api": ["@convax/plugin-api", "3.0.0"],
      "plugin-sdk": ["@convax/plugin-sdk", "0.2.0"],
      "plugin-ui": ["@convax/plugin-ui", "0.1.0"],
    }
    for (const [directory, [packageName, version]] of Object.entries(hostCandidates)) {
      const candidatePath = path.join(root, "vendor", "host-packages", directory)
      const [candidatePackage, entries, stat] = await Promise.all([
        readJson(path.join(candidatePath, "package.json")),
        fs.readdir(candidatePath),
        fs.lstat(candidatePath),
      ])
      expect(stat.isDirectory()).toBe(true)
      expect(stat.isSymbolicLink()).toBe(false)
      expect(candidatePackage.name).toBe(packageName)
      expect(candidatePackage.version).toBe(version)
      expect(candidatePackage.scripts).toBeUndefined()
      expect(candidatePackage.devDependencies).toBeUndefined()
      expect(entries).toContain("dist")
      expect(entries).not.toContain("src")
    }
    const marketplaceKit = await readJson(
      path.join(root, "vendor", "host-packages", "marketplace-kit", "package.json"),
    )
    expect(marketplaceKit.dependencies).toEqual({
      "@convax/marketplace": "workspace:*",
      "@convax/plugin-api": "workspace:*",
      "@convax/plugin-sdk": "workspace:*",
    })
    const pluginSdk = await readJson(
      path.join(root, "vendor", "host-packages", "plugin-sdk", "package.json"),
    )
    expect(pluginSdk.dependencies).toEqual({
      "@convax/bounded-value": "workspace:*",
      "@convax/plugin-api": "workspace:*",
    })
    expect(rootPackage.scripts["marketplace:check"]).toBe(
      "bun tooling/marketplace-preflight.mjs --catalog \"${CONVAX_PLUGIN_API_CATALOG:-node_modules/@convax/plugin-api/dist/generated/plugin-api.json}\" && convax-marketplace check .",
    )
    expect(rootPackage.scripts.pack).toBe(
      "bun tooling/pack.mjs --catalog \"${CONVAX_PLUGIN_API_CATALOG:-node_modules/@convax/plugin-api/dist/generated/plugin-api.json}\"",
    )
    expect(rootPackage.scripts["skill-api:check"]).toBe(
      "bun tooling/generate-skill-api-references.mjs --catalog \"${CONVAX_PLUGIN_API_CATALOG:-node_modules/@convax/plugin-api/dist/generated/plugin-api.json}\" --check",
    )
    expect(rootPackage.scripts["marketplace:build-index"]).toBe(
      "CONVAX_PLUGIN_API_CATALOG=\"${CONVAX_PLUGIN_API_CATALOG:-node_modules/@convax/plugin-api/dist/generated/plugin-api.json}\" bun tooling/official-marketplace-build.mjs",
    )
    for (const template of ["plugin-basic", "skill-basic"]) {
      const templatePackage = await readJson(
        path.join(root, "templates", template, "package.json"),
      )
      expect(templatePackage.scripts.pack).toContain(
        '--catalog "${CONVAX_PLUGIN_API_CATALOG:-../../../node_modules/@convax/plugin-api/dist/generated/plugin-api.json}"',
      )
    }
    for (const text of [readme, readmeZh]) {
      expect(text).toContain("create-convax-marketplace@0.1.0")
      expect(text).toContain("--starter mcp-server")
      expect(text).toContain("convax-marketplace")
      expect(text).toContain("add-target")
    }
  })

  test("keeps workspace versions synchronized with the root lockfile", async () => {
    const lock = await readJsonc(path.join(root, "bun.lock"))

    for (const collection of collections) {
      const directory = path.join(root, "packages", collection)
      const entries = await fs.readdir(directory, { withFileTypes: true })
      for (const entry of entries.filter((item) => item.isDirectory())) {
        const workspacePath = path.posix.join("packages", collection, entry.name)
        const workspace = await readJson(path.join(directory, entry.name, "package.json"))
        expect(lock.workspaces[workspacePath]?.version).toBe(workspace.version)
      }
    }
  })

  test("documents the public v8 pet package contract", async () => {
    const packageReadme = await fs.readFile(
      path.join(root, "packages", "plugins", "convax-pet", "package", "README.md"),
      "utf8",
    )
    expect(packageReadme).toContain("contributes.pet")
    expect(packageReadme).toContain("convax.pet-library/1")
    expect(packageReadme).toContain("convax.pet-host/1")
    expect(packageReadme).toContain("1536×1872")
    expect(packageReadme).toContain("feature Plugin")

    const [readme, authoring] = await Promise.all([
      fs.readFile(path.join(root, "README.md"), "utf8"),
      fs.readFile(path.join(root, "docs", "plugin-authoring.md"), "utf8"),
    ])
    expect(readme).toContain("convax.plugin/8")
    expect(readme).toContain("convax.plugin-host/8")
    expect(readme).toContain("contributes.pet")
    expect(readme).toContain("convax.pet-host/1")
    expect(readme).toContain("One Pet feature Plugin")
    expect(authoring).toContain("convax.plugin/8")

    const [pet] = await discoverPackages({ kind: "plugin", id: "convax-pet" })
    const blockerNotes = pet.metadata.publication.blockers.map((blocker) => blocker.note)
    expect(pet.metadata).toEqual(expect.objectContaining({
      schema: "convax.package/2",
      publication: {
        status: "blocked",
        blockers: [
          {
            code: "host-capability-review-required",
            note: expect.any(String),
          },
          {
            code: "host-capability-review-required",
            note: expect.any(String),
          },
        ],
      },
    }))
    expect(blockerNotes).toEqual(expect.arrayContaining([
      expect.stringContaining("docs/host-capability-requests/public-plugin-ui-foundation.md"),
      expect.stringContaining("docs/host-capability-requests/sdk-owned-pet-surface-client.md"),
    ]))
    expect(pet.manifest).toEqual(expect.objectContaining({
      schema: "convax.plugin/8",
      hostApi: { major: 3, required: [], optional: [] },
    }))
    expect(pet.manifest.contributes.pet).toEqual({
      library: "pet-library.json",
      overlay: "pet/index.html",
      protocol: "convax.pet-host/1",
      settings: "settings/index.html",
    })
  })

  test("runs package builds in dependency order before repository validation and packing", async () => {
    const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "convax-workspace-build-"))
    try {
      const skill = path.join(fixture, "packages", "skills", "source-skill")
      const plugin = path.join(fixture, "packages", "plugins", "owner-plugin")
      await fs.mkdir(skill, { recursive: true })
      await fs.mkdir(plugin, { recursive: true })
      await fs.writeFile(path.join(skill, "package.json"), JSON.stringify({
        name: "fixture-skill",
        scripts: { build: `${JSON.stringify(process.execPath)} build.mjs` },
      }))
      await fs.writeFile(path.join(skill, "build.mjs"), [
        'import { promises as fs } from "node:fs"',
        'await fs.mkdir("package", { recursive: true })',
        'await fs.writeFile("package/generated.txt", "skill-built")',
      ].join("\n"))
      await fs.writeFile(path.join(plugin, "package.json"), JSON.stringify({
        name: "fixture-plugin",
        scripts: { build: `${JSON.stringify(process.execPath)} build.mjs` },
      }))
      await fs.writeFile(path.join(plugin, "build.mjs"), [
        'import { promises as fs } from "node:fs"',
        'const source = await fs.readFile("../../skills/source-skill/package/generated.txt", "utf8")',
        'await fs.mkdir("package", { recursive: true })',
        'await fs.writeFile("package/embedded.txt", source + ":plugin-built")',
      ].join("\n"))

      expect(await runWorkspaceScript("build", ["skills", "plugins"], fixture)).toEqual([
        "skills/source-skill",
        "plugins/owner-plugin",
      ])
      expect(await fs.readFile(path.join(plugin, "package", "embedded.txt"), "utf8")).toBe(
        "skill-built:plugin-built",
      )

      const rootPackage = await readJson(path.join(root, "package.json"))
      expect(rootPackage.scripts["workspaces:build:check"]).toBe(
        "bun tooling/run-workspace-script.mjs build:check plugins",
      )
      expect(rootPackage.scripts.check.indexOf("workspaces:build:check")).toBeLessThan(
        rootPackage.scripts.check.indexOf("workspaces:build:packages"),
      )
      expect(rootPackage.scripts.check.indexOf("workspaces:build:packages")).toBeLessThan(
        rootPackage.scripts.check.indexOf("validate"),
      )
      expect(rootPackage.scripts.check.indexOf("workspaces:build:packages")).toBeLessThan(
        rootPackage.scripts.check.indexOf("marketplace:build"),
      )
    } finally {
      await fs.rm(fixture, { force: true, recursive: true })
    }
  })

  test("loads only the selected package and its required ownership closure", async () => {
    const ffmpegClosure = await discoverPackages({ kind: "plugin", id: "ffmpeg-tools" })
    expect(ffmpegClosure.map((pkg) => `${pkg.kind}/${pkg.id}`)).toEqual([
      "plugin/ffmpeg-tools",
      "skill/ffmpeg-canvas",
    ])

    const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "convax-workspace-selection-"))
    try {
      const target = path.join(fixture, "packages", "skills", "target-skill")
      const broken = path.join(fixture, "packages", "skills", "broken-sibling")
      await fs.mkdir(path.join(target, "package"), { recursive: true })
      await fs.mkdir(path.join(fixture, "registry"), { recursive: true })
      await fs.mkdir(
        path.join(fixture, "docs", "host-capability-requests"),
        { recursive: true },
      )
      await fs.writeFile(
        path.join(fixture, "registry", "host-capability-policy.json"),
        JSON.stringify({
          schema: "convax.host-capability-policy/1",
          requests: [],
        }),
      )
      await fs.writeFile(path.join(target, "package.json"), JSON.stringify({
        name: "@microvoid/convax-skill-target-skill",
        version: "1.0.0",
        private: true,
        type: "module",
        scripts: { validate: "true", pack: "true" },
      }))
      await fs.writeFile(path.join(target, "convax-package.json"), JSON.stringify({
        schema: "convax.package/2",
        kind: "skill",
        id: "target-skill",
        name: "Target Skill",
        description: "A valid target used to verify workspace selection.",
        version: "1.0.0",
        yanked: false,
      }))
      await fs.writeFile(path.join(target, "package", "SKILL.md"), [
        "---",
        "name: target-skill",
        "version: 1.0.0",
        "description: Verify that one selected workspace ignores an unrelated broken sibling.",
        "---",
        "",
        "# Target Skill",
        "",
        "Return the verified target result.",
      ].join("\n"))
      const selected = await discoverPackages({
        kind: "skill",
        id: "target-skill",
        workspaceRoot: fixture,
      })
      expect(selected.map((pkg) => `${pkg.kind}/${pkg.id}`)).toEqual(["skill/target-skill"])
      await fs.mkdir(broken, { recursive: true })
      await fs.writeFile(path.join(broken, "convax-package.json"), "{")
      await expect(discoverPackages({ workspaceRoot: fixture })).rejects.toThrow("not valid UTF-8 JSON")
    } finally {
      await fs.rm(fixture, { force: true, recursive: true })
    }
  })

  test("single-package packing preserves sibling outputs", async () => {
    const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "convax-workspace-pack-"))
    try {
      const siblingFile = path.join(outputDirectory, "skill-existing-v1.0.0", "keep.txt")
      const catalogPath = path.join(outputDirectory, "plugin-api.json")
      const catalogSource = renderPluginApiJson()
      const catalog = JSON.parse(catalogSource)
      await fs.mkdir(path.dirname(siblingFile), { recursive: true })
      await fs.writeFile(siblingFile, "keep")
      await fs.writeFile(catalogPath, catalogSource)

      await expect(
        packFromArgs(
          ["--kind", "plugin", "--id", "hello-convax"],
          { outputDirectory },
        ),
      ).rejects.toThrow("exactly one --catalog path is required")
      await expect(
        packFromArgs(
          [
            "--catalog",
            catalogPath,
            "--catalog",
            catalogPath,
            "--kind",
            "plugin",
            "--id",
            "hello-convax",
          ],
          { outputDirectory },
        ),
      ).rejects.toThrow("exactly one --catalog path is required")
      await expect(
        packPackages([], outputDirectory),
      ).rejects.toThrow("catalog-bound Skill reference plan is required")

      const [packed] = await packFromArgs(
        [
          "--catalog",
          catalogPath,
          "--kind",
          "plugin",
          "--id",
          "hello-convax",
        ],
        { outputDirectory },
      )

      expect(await fs.readFile(siblingFile, "utf8")).toBe("keep")
      expect(packed.tag).toBe("plugin-hello-convax-v0.2.2")
      expect(catalog).toMatchObject({
        schema: "convax.plugin-api-catalog/3",
        version: "3.0.0",
      })
      expect(packed.catalogVersion).toBe(catalog.version)
      expect(packed.catalogDigest).toBe(
        createHash("sha256").update(catalogSource).digest("hex"),
      )
      expect((await fs.stat(packed.zipPath)).isFile()).toBe(true)
      expect(packed).not.toHaveProperty("entry")
      expect(packed).not.toHaveProperty("showcaseEntry")
      expect(await fs.readdir(packed.directory)).not.toContain(
        "registry-entry.json",
      )
      expect(await fs.readdir(packed.directory)).not.toContain(
        "showcase-entry.json",
      )
      const paths = readStoredZip(packed.zip).map((entry) => entry.relativePath)
      expect(paths).toContain(
        "skills/hello-convax-guide/references/convax-capabilities.md",
      )
      expect(paths).toContain(
        "skills/hello-convax-guide/references/plugin-capabilities.md",
      )
    } finally {
      await fs.rm(outputDirectory, { force: true, recursive: true })
    }
  })

  test("repository packing omits blocked ownership closures while exact packing fails closed", () => {
    const blocker = {
      code: "host-capability-review-required",
      note: "[example-request] Pending exact Host capability review.",
    }
    const blockedPlugin = {
      metadata: {
        kind: "plugin",
        id: "blocked-plugin",
        version: "1.0.0",
        publication: { status: "blocked", blockers: [blocker] },
      },
      manifest: {
        contributes: { skills: [{ name: "owned-skill" }] },
      },
    }
    const ownedSkill = {
      metadata: {
        kind: "skill",
        id: "owned-skill",
        ownerPluginId: "blocked-plugin",
        version: "1.0.0",
        publication: { status: "ready", blockers: [] },
      },
    }
    const readySkill = {
      metadata: {
        kind: "skill",
        id: "ready-skill",
        version: "1.0.0",
        publication: { status: "ready", blockers: [] },
      },
    }

    const repositorySelection = createPackSelection([
      blockedPlugin,
      ownedSkill,
      readySkill,
    ])
    expect(repositorySelection.packages).toEqual([readySkill])
    expect(repositorySelection.omitted.map((entry) =>
      `${entry.kind}/${entry.id}`)).toEqual([
      "plugin/blocked-plugin",
      "skill/owned-skill",
    ])
    expect(repositorySelection.omitted[1].publication).toEqual({
      status: "blocked",
      blockedBy: ["plugin/blocked-plugin"],
      blockers: [blocker],
    })
    expect(() => createPackSelection([{
      metadata: {
        kind: "skill",
        id: "blocked-skill",
        version: "1.0.0",
        publication: { status: "blocked", blockers: [blocker] },
      },
    }], { exact: true })).toThrow("blocked packages cannot be published")
  })
})
