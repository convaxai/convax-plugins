import { describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import path from "node:path"

import { discoverPackages, loadPublicationPolicy, root } from "./lib.mjs"

describe("automated Plugin contract governance", () => {
  test("binds current Catalog contracts without producing review blockers", async () => {
    const policy = await loadPublicationPolicy(root)
    expect(policy.schema).toBe("convax.host-capability-policy/3")
    expect(policy.requirements.map(({ id }) => id)).toEqual([
      "public-plugin-ui-foundation",
      "sdk-owned-pet-surface-client",
      "verified-companion-toolchain",
      "web-plugin-generation-input-binding",
      "web-plugin-image-input-read",
    ])
    const generation = policy.requirements.find(
      ({ id }) => id === "web-plugin-generation-input-binding",
    )
    expect(generation).toMatchObject({
      verification: "catalog-contracts",
      acceptedApiContracts: [
        {
          id: "generation.execute",
          digest:
            "sha256:c00cba532377ce144fb27d0bc2e9195b6cda796159cff251bce218c3a55da26e",
        },
      ],
    })
    expect(policy.packages).toEqual([
      {
        kind: "plugin",
        id: "chatcut",
        version: "0.4.2",
        policyId: "verified-companion-toolchain",
        status: "blocked",
        blockers: [
          {
            code: "unverified-runtime-dependency",
            note: expect.stringContaining("ambient PATH"),
          },
        ],
      },
    ])
  })

  test("admits resolved Plugins and keeps only the concrete runtime gap blocked", async () => {
    const packages = await discoverPackages()
    const publications = new Map(
      packages.map((pkg) => [
        `${pkg.metadata.kind}/${pkg.metadata.id}`,
        pkg.metadata.publication,
      ]),
    )
    for (const identity of [
      "plugin/convax-pet",
      "plugin/jianying-editor",
      "skill/jianying-editor",
      "plugin/multi-angle",
      "plugin/panorama-viewer",
      "plugin/relight-studio",
      "skill/relight-studio",
    ]) {
      expect(publications.get(identity)).toEqual({
        status: "ready",
        blockers: [],
      })
    }
    expect(publications.get("plugin/chatcut")).toMatchObject({
      status: "blocked",
      blockers: [{ code: "unverified-runtime-dependency" }],
    })
    expect(publications.get("skill/chatcut")).toEqual({
      status: "ready",
      blockers: [],
    })
  })

  test("keeps ChatCut blocked on an observable technical dependency", async () => {
    const source = await fs.readFile(
      path.join(
        root,
        "packages",
        "tools",
        "chatcut-media-import-mcp",
        "src",
        "media.ts",
      ),
      "utf8",
    )
    expect(source).toContain('this.#which("ffmpeg")')
    expect(source).toContain('this.#which("ffprobe")')
    expect(source).toContain("commands on PATH")
  })
})
