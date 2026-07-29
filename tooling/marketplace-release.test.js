import { afterAll, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  changedPackageVersions,
  gitTreePackageSnapshot,
  packageVersionSnapshot,
} from "./marketplace-release.mjs"
import { composePublicationPlan } from "./publication-plan.mjs"

const temporaryDirectories = []

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "convax-marketplace-release-"))
  temporaryDirectories.push(directory)
  return directory
}

async function writePackage(root, kind, id, version, body = {}) {
  const directory = path.join(root, "packages", kind, id)
  await fs.mkdir(directory, { recursive: true })
  const marker = kind === "mcp-servers"
    ? { name: `io.github.microvoid/${id}`, description: `${id} server`, version, ...body }
    : {
        schema: "convax.package/2",
        kind: kind === "plugins" ? "plugin" : "skill",
        id,
        name: id,
        description: `${id} package`,
        version,
        ...body,
      }
  await fs.writeFile(
    path.join(directory, kind === "mcp-servers" ? "server.json" : "convax-package.json"),
    `${JSON.stringify(marker, null, 2)}\n`,
  )
}

async function writePluginClosure(root, version = "1.0.0") {
  await writePackage(root, "plugins", "closed-plugin", version, {
    companions: [{
      command: "closed-tool",
      version: "1.0.0",
      source: "packages/tools/closed-tool",
      targets: [{ platform: "darwin", arch: "arm64", path: "dist/closed-tool" }],
    }],
  })
  await fs.mkdir(path.join(root, "packages/plugins/closed-plugin/package"), { recursive: true })
  await fs.writeFile(
    path.join(root, "packages/plugins/closed-plugin/package/manifest.json"),
    `${JSON.stringify({
      schema: "convax.plugin/4",
      id: "closed-plugin",
      version,
      name: "Closed Plugin",
      contributes: { skills: [{ name: "closed-skill", path: "skills/closed-skill" }] },
    }, null, 2)}\n`,
  )
  await writePackage(root, "skills", "closed-skill", version, {
    ownerPluginId: "closed-plugin",
  })
  await fs.mkdir(path.join(root, "packages/skills/closed-skill/package"), { recursive: true })
  await fs.writeFile(
    path.join(root, "packages/skills/closed-skill/package/SKILL.md"),
    "---\nname: closed-skill\n---\n\n# Closed Skill\n",
  )
  await fs.mkdir(path.join(root, "packages/tools/closed-tool/src"), { recursive: true })
  await fs.writeFile(path.join(root, "packages/tools/closed-tool/src/main.ts"), "export const version = 1\n")
}

async function writeManagedMcpCompanion(root, id, bytes) {
  const itemKey = createHash("sha256")
    .update(Buffer.from(`mcp-server\0${id}`, "utf8"))
    .digest("hex")
  const companion = path.join(
    root,
    ".marketplace",
    "companion-inputs",
    itemKey,
    "darwin-arm64",
    "fixture-mcp",
  )
  await fs.mkdir(path.dirname(companion), { recursive: true })
  await fs.writeFile(companion, bytes)
}

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) =>
    fs.rm(directory, { recursive: true, force: true })))
})

describe("default-branch version-change release selection", () => {
  test("returns an exact empty plan when every package version and byte is unchanged", async () => {
    const unchanged = await temporaryDirectory()
    await writePackage(unchanged, "plugins", "example-plugin", "1.0.0")
    await writePackage(unchanged, "skills", "example-skill", "2.0.0")
    await writePackage(unchanged, "mcp-servers", "example-http", "2026.07")
    const snapshot = await packageVersionSnapshot(unchanged)

    expect(changedPackageVersions(snapshot, snapshot)).toEqual([])
  })

  test("selects Plugin, Skill, and MCP Server version changes with stable release identities", async () => {
    const previous = await temporaryDirectory()
    const current = await temporaryDirectory()
    for (const root of [previous, current]) {
      await writePackage(root, "plugins", "example-plugin", root === previous ? "1.0.0" : "1.1.0")
      await writePackage(root, "skills", "example-skill", "2.0.0")
      await writePackage(root, "mcp-servers", "example-http", root === previous ? "2026.07" : "2026.08")
    }

    const changes = changedPackageVersions(
      await packageVersionSnapshot(previous),
      await packageVersionSnapshot(current),
    )

    expect(changes).toEqual([
      {
        id: "io.github.microvoid/example-http",
        itemKey: expect.stringMatching(/^[a-f0-9]{64}$/),
        kind: "mcp-server",
        previousVersion: "2026.07",
        releaseTag: expect.stringMatching(/^mcp-server-[a-f0-9]{16}-v2026\.08$/),
        version: "2026.08",
      },
      {
        id: "example-plugin",
        itemKey: expect.stringMatching(/^[a-f0-9]{64}$/),
        kind: "plugin",
        previousVersion: "1.0.0",
        releaseTag: "plugin-example-plugin-v1.1.0",
        version: "1.1.0",
      },
    ])
  })

  test("rejects changed immutable package bytes without a version change", async () => {
    const previous = await temporaryDirectory()
    const current = await temporaryDirectory()
    await writePackage(previous, "skills", "example-skill", "1.0.0", { description: "old bytes" })
    await writePackage(current, "skills", "example-skill", "1.0.0", { description: "new bytes" })

    const previousSnapshot = await packageVersionSnapshot(previous)
    const currentSnapshot = await packageVersionSnapshot(current)
    expect(() => changedPackageVersions(previousSnapshot, currentSnapshot))
      .toThrow("changed without a version change")
  })

  test("requires a reviewed yanked version instead of silently removing a package", async () => {
    const previous = await temporaryDirectory()
    const current = await temporaryDirectory()
    await writePackage(previous, "skills", "removed-skill", "1.0.0")

    const previousSnapshot = await packageVersionSnapshot(previous)
    const currentSnapshot = await packageVersionSnapshot(current)
    expect(() => changedPackageVersions(previousSnapshot, currentSnapshot))
      .toThrow("skill/removed-skill@1.0.0 was removed")
  })

  test("binds linked companion and owned Skill sources to the Plugin version", async () => {
    const previous = await temporaryDirectory()
    const current = await temporaryDirectory()
    await writePluginClosure(previous)
    await writePluginClosure(current)

    await fs.writeFile(
      path.join(current, "packages/tools/closed-tool/src/main.ts"),
      "export const version = 2\n",
    )
    const previousSnapshot = await packageVersionSnapshot(previous)
    let currentSnapshot = await packageVersionSnapshot(current)
    expect(() => changedPackageVersions(previousSnapshot, currentSnapshot))
      .toThrow("plugin/closed-plugin@1.0.0 changed without a version change")

    await fs.writeFile(
      path.join(current, "packages/tools/closed-tool/src/main.ts"),
      "export const version = 1\n",
    )
    await fs.writeFile(
      path.join(current, "packages/skills/closed-skill/package/SKILL.md"),
      "---\nname: closed-skill\n---\n\n# Changed Skill\n",
    )
    currentSnapshot = await packageVersionSnapshot(current)
    expect(() => changedPackageVersions(previousSnapshot, currentSnapshot))
      .toThrow("plugin/closed-plugin@1.0.0 changed without a version change")
  })

  test("binds scaffold-owned managed MCP companion inputs to the MCP Server version", async () => {
    const previous = await temporaryDirectory()
    const current = await temporaryDirectory()
    const id = "io.github.microvoid/managed-example"
    for (const root of [previous, current]) {
      await writePackage(root, "mcp-servers", "managed-example", "1.0.0", {
        name: id,
      })
    }
    await writeManagedMcpCompanion(previous, id, "previous companion bytes")
    await writeManagedMcpCompanion(current, id, "changed companion bytes")

    const previousSnapshot = await packageVersionSnapshot(previous)
    const currentSnapshot = await packageVersionSnapshot(current)
    expect(() => changedPackageVersions(
      previousSnapshot,
      currentSnapshot,
    )).toThrow("mcp-server/io.github.microvoid/managed-example@1.0.0 changed without a version change")
  })

  test("uses the same managed MCP companion closure for the production Git-tree selector", async () => {
    const repository = await temporaryDirectory()
    const id = "io.github.microvoid/git-managed-example"
    await writePackage(repository, "mcp-servers", "git-managed-example", "1.0.0", {
      name: id,
    })
    await writeManagedMcpCompanion(repository, id, "previous companion bytes")
    const git = (args) => execFileSync("git", args, {
      cwd: repository,
      encoding: "utf8",
    }).trim()
    git(["init"])
    git(["config", "user.email", "fixture@example.test"])
    git(["config", "user.name", "Fixture"])
    git(["add", "."])
    git(["commit", "-m", "initial"])
    const previousRevision = git(["rev-parse", "HEAD"])

    await writeManagedMcpCompanion(repository, id, "changed companion bytes")
    git(["add", "."])
    git(["commit", "-m", "change companion"])
    const currentRevision = git(["rev-parse", "HEAD"])

    expect(() => changedPackageVersions(
      gitTreePackageSnapshot(repository, previousRevision),
      gitTreePackageSnapshot(repository, currentRevision),
    )).toThrow("mcp-server/io.github.microvoid/git-managed-example@1.0.0 changed without a version change")
  })

  test("does not follow a scaffold-owned managed MCP companion root outside the repository", async () => {
    const repository = await temporaryDirectory()
    const outside = await temporaryDirectory()
    const id = "io.github.microvoid/symlinked-managed-example"
    await writePackage(repository, "mcp-servers", "symlinked-managed-example", "1.0.0", {
      name: id,
    })
    await fs.writeFile(path.join(outside, "outside-companion"), "outside bytes")
    const itemKey = createHash("sha256")
      .update(Buffer.from(`mcp-server\0${id}`, "utf8"))
      .digest("hex")
    const inputs = path.join(repository, ".marketplace", "companion-inputs")
    await fs.mkdir(inputs, { recursive: true })
    await fs.symlink(outside, path.join(inputs, itemKey))

    await expect(packageVersionSnapshot(repository))
      .rejects.toThrow("managed MCP companion input must be a real directory")
  })

  test("publishes versions and redeploys the verified catalog only from the protected default branch", async () => {
    const workflow = await fs.readFile(path.join(
      import.meta.dir,
      "..",
      ".github/workflows/release-on-main.yml",
    ), "utf8")
    const pages = await fs.readFile(path.join(
      import.meta.dir,
      "..",
      ".github/workflows/pages.yml",
    ), "utf8")
    expect(workflow).toContain("branches: [main]")
    expect(workflow).not.toContain("tags:")
    expect(workflow).toContain("bun tooling/marketplace-release.mjs")
    expect(workflow).toContain("--base \"$CONVAX_MARKETPLACE_BASE_SHA\"")
    expect(workflow).toContain("permissions:\n  contents: read")
    expect(workflow).toContain("attestations: write")
    expect(workflow).toContain("contents: write")
    expect(workflow).toContain("id-token: write")
    expect(workflow).toContain("dist/catalog/releases/$tag")
    expect(workflow).toContain("uses: ./.github/workflows/pages.yml")
    expect(workflow).toContain("fetch-marketplace-previous.mjs")
    expect(workflow).toContain("publication-plan.mjs")
    expect(workflow).toContain("gh release download")
    expect(workflow).toContain("cmp \"$asset\"")
    expect(workflow).toContain(
      "repos/$GITHUB_REPOSITORY/compare/$remote_tag...$GITHUB_SHA",
    )
    expect(workflow).toContain("ahead|identical")
    expect(workflow).not.toContain("already exists; immutable versions are never overwritten")
    expect(workflow).not.toContain("if: steps.plan.outputs.count != '0'")
    expect(workflow).not.toContain("if: needs.verify.outputs.count != '0'")
    expect(workflow).toContain("needs.publish.result == 'success'")
    expect(workflow).not.toContain("needs.publish.result == 'skipped'")
    expect(workflow).not.toContain("pull_request_target")
    expect(pages).toContain("workflow_call:")
    expect(pages).not.toContain("workflow_run:")
    expect(pages).not.toContain("concurrency:")
    expect(pages).toContain("CONVAX_MARKETPLACE_CHANGED: dist/release-plan.json")
  })

  test("publishes changed packages with one metadata Release and the changed Builtin bundle", () => {
    const selected = [
      {
        kind: "plugin",
        id: "ffmpeg-tools",
        releaseTag: "plugin-ffmpeg-tools-v0.3.1",
      },
      {
        kind: "skill",
        id: "canvas-storyboard",
        releaseTag: "skill-canvas-storyboard-v0.1.0",
      },
    ]
    const catalog = {
      schema: "convax.release-plan/1",
      releases: [
        {
          tag: "plugin-ffmpeg-tools-v0.3.1",
          assets: [{ path: "releases/plugin-ffmpeg-tools-v0.3.1/plugin.zip" }],
        },
        {
          tag: "skill-canvas-storyboard-v0.1.0",
          assets: [{ path: "releases/skill-canvas-storyboard-v0.1.0/skill.zip" }],
        },
        {
          tag: `registry-v2-${"a".repeat(64)}`,
          assets: [{ path: `releases/registry-v2-${"a".repeat(64)}/registry-v2.json` }],
        },
      ],
    }
    const builtin = {
      schema: "convax.release-plan/1",
      releases: [{
        tag: "builtin-release",
        assets: [{ path: "releases/builtin-release/convax-builtin-bundle.zip" }],
      }],
    }
    expect(composePublicationPlan({ builtin, catalog, selected })).toEqual({
      schema: "convax.publication-plan/1",
      releases: [
        {
          directory: "builtin/releases/builtin-release",
          tag: "builtin-release",
        },
        {
          directory: "catalog/releases/plugin-ffmpeg-tools-v0.3.1",
          tag: "plugin-ffmpeg-tools-v0.3.1",
        },
        {
          directory: `catalog/releases/registry-v2-${"a".repeat(64)}`,
          tag: `registry-v2-${"a".repeat(64)}`,
        },
        {
          directory: "catalog/releases/skill-canvas-storyboard-v0.1.0",
          tag: "skill-canvas-storyboard-v0.1.0",
        },
      ],
    })
    expect(() => composePublicationPlan({
      builtin,
      catalog: {
        ...catalog,
        releases: catalog.releases.filter((entry) => !entry.tag.startsWith("registry-v2-")),
      },
      selected,
    })).toThrow("exactly one Registry metadata Release")
  })
})
