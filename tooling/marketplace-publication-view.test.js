import { afterAll, describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  createMarketplacePublicationView,
  disposeMarketplacePublicationView,
} from "./marketplace-publication-view.mjs"

const temporaryDirectories = []

async function temporaryDirectory(prefix) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

async function write(root, relative, contents = "{}\n") {
  const target = path.join(root, relative)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, contents)
}

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) =>
    fs.rm(directory, { force: true, recursive: true })))
})

describe("ready-only Marketplace publication view", () => {
  test("excludes a blocked owner and its owned Skill while retaining unrelated ready source", async () => {
    const workspaceRoot = await temporaryDirectory("convax-publication-source-")
    await write(workspaceRoot, "marketplace.json")
    await write(workspaceRoot, "catalogs/builtin.json")
    await write(workspaceRoot, "catalogs/preinstalled.json")
    await write(workspaceRoot, "registry/config.json")
    for (const relative of [
      "packages/plugins/blocked-plugin/package/manifest.json",
      "packages/skills/blocked-skill/package/SKILL.md",
      "packages/skills/ready-skill/package/SKILL.md",
    ]) {
      await write(workspaceRoot, relative)
    }
    const blockedPublication = {
      status: "blocked",
      blockers: [
        {
          code: "host-capability-review-required",
          note: "[alpha-contract] Pending alpha contract.",
        },
        {
          code: "host-capability-review-required",
          note: "[zeta-contract] Pending zeta contract.",
        },
      ],
    }
    const packages = [
      {
        metadata: {
          kind: "plugin",
          id: "blocked-plugin",
          version: "1.0.0",
          publication: blockedPublication,
        },
        manifest: {
          contributes: {
            skills: [{ name: "blocked-skill" }],
          },
        },
      },
      {
        metadata: {
          kind: "skill",
          id: "blocked-skill",
          ownerPluginId: "blocked-plugin",
          version: "1.0.0",
          publication: { status: "ready", blockers: [] },
        },
      },
      {
        metadata: {
          kind: "skill",
          id: "ready-skill",
          version: "1.0.0",
          publication: { status: "ready", blockers: [] },
        },
      },
    ]
    const candidates = [
      {
        kind: "plugin",
        id: "blocked-plugin",
        root: path.join(workspaceRoot, "packages/plugins/blocked-plugin"),
      },
      {
        kind: "skill",
        id: "blocked-skill",
        root: path.join(workspaceRoot, "packages/skills/blocked-skill"),
      },
      {
        kind: "skill",
        id: "ready-skill",
        root: path.join(workspaceRoot, "packages/skills/ready-skill"),
      },
    ]
    const view = await createMarketplacePublicationView({
      candidates,
      packages,
      workspaceRoot,
    })
    try {
      await expect(fs.stat(path.join(
        view.root,
        "packages/skills/ready-skill/package/SKILL.md",
      ))).resolves.toBeDefined()
      await expect(fs.stat(path.join(
        view.root,
        "packages/plugins/blocked-plugin",
      ))).rejects.toMatchObject({ code: "ENOENT" })
      await expect(fs.stat(path.join(
        view.root,
        "packages/skills/blocked-skill",
      ))).rejects.toMatchObject({ code: "ENOENT" })
      expect(view.omissions.omitted.map((entry) =>
        `${entry.kind}/${entry.id}`)).toEqual([
        "plugin/blocked-plugin",
        "skill/blocked-skill",
      ])
      expect(view.omissions.omitted[1].publication.blockedBy).toEqual([
        "plugin/blocked-plugin",
      ])
      expect(view.omissions.omitted[1].publication.blockers).toEqual(
        blockedPublication.blockers,
      )
    } finally {
      await disposeMarketplacePublicationView(view)
    }
  })
})
