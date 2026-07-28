import { describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  assertOfficialMarketplaceSource,
  loadOfficialMarketplaceSource,
} from "./official-marketplace.mjs"
import { officialBuildArgs } from "./official-marketplace-build.mjs"
import { fetchPreviousRegistry } from "./fetch-marketplace-previous.mjs"
import { root, sha256 } from "./lib.mjs"

describe("Official and Builtin marketplace source", () => {
  const strictRegistryParser = (version) => (value) => {
    const topLevel = version === 2
      ? ["schema", "marketplaceId", "sequence", "revision", "packages"]
      : ["schema", "sequence", "revision", "packages"]
    const unknown = Object.keys(value).find((key) => !topLevel.includes(key))
    if (unknown) throw new Error(`unknown field ${unknown}`)
    const identities = new Set()
    for (const entry of value.packages) {
      if (typeof entry?.kind !== "string" || typeof entry.id !== "string") {
        throw new Error("bad package")
      }
      const identity = `${entry.kind}/${entry.id}`
      if (identities.has(identity)) throw new Error(`duplicate ${identity}`)
      identities.add(identity)
    }
    return value
  }

  test("owns the approved descriptor, Builtin member, and preinstalled closure", async () => {
    const source = await loadOfficialMarketplaceSource(root)
    expect(source.descriptor).toEqual({
      schema: "convax.marketplace/1",
      id: "convax-official",
      name: "Convax Official",
      publisher: {
        name: "Microvoid",
      },
      repository: { owner: "microvoid", name: "convax-plugins" },
      registry: {
        v1: { url: "https://microvoid.github.io/convax-plugins/registry/v1/index.json" },
        v2: { url: "https://microvoid.github.io/convax-plugins/registry/v2/index.json" },
      },
      showcase: {
        v2: { url: "https://microvoid.github.io/convax-plugins/showcase/v2/index.json" },
      },
      compatibility: { convax: ">=0.1.0" },
      delivery: { kind: "github-pages-releases" },
    })
    expect(source.builtin.members).toEqual([
      { kind: "skill", id: "canvas-storyboard" },
    ])
    expect(source.preinstalled).toEqual([
      {
        marketplaceId: "convax-official",
        kind: "plugin",
        id: "ffmpeg-tools",
        targets: ["darwin-arm64"],
        setup: "explicit",
      },
    ])
    expect(() => assertOfficialMarketplaceSource(source)).not.toThrow()
  })

  test("keeps the approved standalone Storyboard Skill bytes fixed in its sole source", async () => {
    const sourceSkill = await fs.readFile(path.join(
      root,
      "packages/skills/canvas-storyboard/package/SKILL.md",
    ))
    expect(sha256(sourceSkill)).toBe("76efa86e73ae8ca0581f3000ec6a622ee8479ec42a6d1e15892ec0051506b9d8")
  })

  test("publishes HTTP and managed-stdio MCP Server fixtures without mixing profiles", async () => {
    const http = JSON.parse(await fs.readFile(
      path.join(root, "tooling/fixtures/mcp-servers/official-http-example/server.json"),
      "utf8",
    ))
    expect(http.remotes).toEqual([
      {
        type: "streamable-http",
        url: "https://mcp.example.com/v1",
      },
    ])
    await expect(fs.stat(path.join(
      root,
      "tooling/fixtures/mcp-servers/official-http-example/convax-mcp.json",
    ))).rejects.toMatchObject({ code: "ENOENT" })

    const managedRoot = path.join(root, "tooling/fixtures/mcp-servers/official-managed-example")
    const managed = JSON.parse(await fs.readFile(path.join(managedRoot, "server.json"), "utf8"))
    const extension = JSON.parse(await fs.readFile(path.join(managedRoot, "convax-mcp.json"), "utf8"))
    expect(managed.remotes ?? []).toEqual([])
    expect(managed.packages ?? []).toEqual([])
    expect(extension.runtime.kind).toBe("managed-stdio")
    expect(extension.runtime.command).toBe("convax-managed-example-mcp")
    expect(extension.runtime.argv).toEqual([])
    expect(extension).not.toHaveProperty("id")
    expect(extension).not.toHaveProperty("version")
  })

  test("uses an explicit production snapshot in CI and an explicit initial candidate locally", () => {
    expect(officialBuildArgs({
      changed: "dist/release-plan.json",
      previous: "dist/production/registry-v2.json",
      v1Revision: "a".repeat(40),
    })).toEqual([
      "build-index",
      ".",
      "--out",
      "dist/catalog",
      "--official",
      "--changed",
      "dist/release-plan.json",
      "--previous",
      "dist/production/registry-v2.json",
      "--v1-revision",
      "a".repeat(40),
    ])
    expect(officialBuildArgs({
      bootstrapPreviousV1: "dist/production/registry-v1.json",
      v1Revision: "a".repeat(40),
    })).toEqual([
      "build-index",
      ".",
      "--out",
      "dist/catalog",
      "--official",
      "--bootstrap-previous-v1",
      "dist/production/registry-v1.json",
      "--v1-revision",
      "a".repeat(40),
    ])
    expect(officialBuildArgs({ v1Revision: "a".repeat(40) })).toEqual([
      "build-index",
      ".",
      "--out",
      "dist/catalog",
      "--official",
      "--initial",
      "--v1-revision",
      "a".repeat(40),
    ])
    expect(() => officialBuildArgs({
      bootstrapPreviousV1: "dist/production/registry-v1.json",
      previous: "dist/production/registry-v2.json",
      v1Revision: "a".repeat(40),
    })).toThrow("exactly one previous Registry mode")
    expect(() => officialBuildArgs({ v1Revision: "bad" }))
      .toThrow("v1 revision must be an exact Git SHA")
  })

  test("prefers production v2 and bootstraps from strict v1 only after an exact v2 404", async () => {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), "convax-marketplace-previous-"))
    try {
      const v2Bytes = JSON.stringify({
        schema: "convax.registry/2",
        marketplaceId: "convax-official",
        sequence: 45,
        revision: "a".repeat(64),
        packages: [],
      })
      let requests = []
      const v2 = await fetchPreviousRegistry({
        fetchImpl: async (url) => {
          requests.push(url)
          return new Response(v2Bytes, { status: 200 })
        },
        outputDirectory: output,
        parseV1: strictRegistryParser(1),
        parseV2: strictRegistryParser(2),
        v1Url: "https://example.test/v1",
        v2Url: "https://example.test/v2",
      })
      expect(v2.mode).toBe("v2")
      expect(requests).toEqual(["https://example.test/v2"])

      requests = []
      const bootstrap = await fetchPreviousRegistry({
        fetchImpl: async (url) => {
          requests.push(url)
          return url.endsWith("/v2")
            ? new Response("", { status: 404 })
            : new Response(JSON.stringify({
                schema: "convax.registry/1",
                sequence: 44,
                revision: "b".repeat(40),
                packages: [],
              }), { status: 200 })
        },
        outputDirectory: output,
        parseV1: strictRegistryParser(1),
        parseV2: strictRegistryParser(2),
        v1Url: "https://example.test/v1",
        v2Url: "https://example.test/v2",
      })
      expect(bootstrap.mode).toBe("bootstrap-v1")
      expect(requests).toEqual(["https://example.test/v2", "https://example.test/v1"])

      requests = []
      await expect(fetchPreviousRegistry({
        fetchImpl: async (url) => {
          requests.push(url)
          return new Response("", { status: 503 })
        },
        outputDirectory: output,
        parseV1: strictRegistryParser(1),
        parseV2: strictRegistryParser(2),
        v1Url: "https://example.test/v1",
        v2Url: "https://example.test/v2",
      })).rejects.toThrow("v2 returned HTTP 503")
      expect(requests).toEqual(["https://example.test/v2"])

      await expect(fetchPreviousRegistry({
        fetchImpl: async (url) => url.endsWith("/v2")
          ? new Response("", { status: 404 })
          : new Response(JSON.stringify({
              schema: "convax.registry/1",
              sequence: 0,
              revision: "bad",
              packages: [],
            }), { status: 200 }),
        outputDirectory: output,
        parseV1: strictRegistryParser(1),
        parseV2: strictRegistryParser(2),
        v1Url: "https://example.test/v1",
        v2Url: "https://example.test/v2",
      })).rejects.toThrow("v1 is not a strict sequence input")

      await expect(fetchPreviousRegistry({
        fetchImpl: async () => new Response(JSON.stringify({
          schema: "convax.registry/2",
          marketplaceId: "convax-official",
          sequence: 45,
          revision: "a".repeat(64),
          packages: [
            { kind: "skill", id: "duplicate" },
            { kind: "skill", id: "duplicate" },
          ],
          unexpected: true,
        }), { status: 200 }),
        outputDirectory: output,
        parseV1: strictRegistryParser(1),
        parseV2: strictRegistryParser(2),
        v1Url: "https://example.test/v1",
        v2Url: "https://example.test/v2",
      })).rejects.toThrow("strict validation failed")
    } finally {
      await fs.rm(output, { recursive: true, force: true })
    }
  })

  test("keeps no-op publication inert and deploys only reverified low-privilege bytes", async () => {
    const releaseWorkflow = await fs.readFile(
      path.join(root, ".github/workflows/release-on-main.yml"),
      "utf8",
    )
    const pagesWorkflow = await fs.readFile(
      path.join(root, ".github/workflows/pages.yml"),
      "utf8",
    )
    expect(releaseWorkflow).toContain("branches: [main]")
    expect(releaseWorkflow).not.toContain("pull_request_target")
    expect(releaseWorkflow).toContain("if: steps.plan.outputs.count != '0'")
    expect(releaseWorkflow).toContain("if: needs.verify.outputs.count != '0'")
    expect(releaseWorkflow).toContain("needs: [verify, publish]")
    expect(releaseWorkflow).toContain("uses: ./.github/workflows/pages.yml")
    expect(pagesWorkflow).toContain(
      "bun tooling/verify-marketplace-output.mjs dist/catalog",
    )
    expect(pagesWorkflow).toContain(
      "bun tooling/verify-product-lock-input.mjs dist/product-lock-input.json",
    )
    expect(releaseWorkflow).toContain(
      "cp schemas/*.json dist/catalog/site/schemas/",
    )
    expect(pagesWorkflow).toContain('cmp "$schema" "dist/catalog/site/schemas/$(basename "$schema")"')
    expect(pagesWorkflow).toContain("path: dist/catalog/site")
    expect(pagesWorkflow).not.toContain("cp schemas/*.json")
    expect(pagesWorkflow).not.toContain("cp dist/catalog/registry-v2.json")
    expect(pagesWorkflow).not.toContain("cp dist/catalog/showcase-v2.json")
    expect(pagesWorkflow).not.toContain("path: dist/site")
  })
})
