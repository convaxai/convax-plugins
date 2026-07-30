import { describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  assertOfficialMarketplaceSource,
  loadOfficialMarketplaceSource,
} from "./official-marketplace.mjs"
import {
  officialBuildArgs,
  officialBuildInvocation,
  runOfficialBuild,
} from "./official-marketplace-build.mjs"
import { fetchPreviousRegistry } from "./fetch-marketplace-previous.mjs"
import { root } from "./lib.mjs"

const registryUrl = "https://microvoid.github.io/convax-plugins/registry/v2/index.json"
const showcaseUrl = "https://microvoid.github.io/convax-plugins/showcase/v2/index.json"
const emptyRegistryRevision = "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"

function officialDescriptor() {
  return {
    schema: "convax.marketplace/1",
    id: "convax-official",
    name: "Convax Official",
    publisher: {
      name: "Microvoid",
    },
    repository: { owner: "microvoid", name: "convax-plugins" },
    registry: {
      v2: { url: registryUrl },
    },
    showcase: {
      v2: { url: showcaseUrl },
    },
    compatibility: { convax: ">=0.1.0" },
    delivery: { kind: "github-pages-releases" },
  }
}

function registryFixture(overrides = {}) {
  return {
    schema: "convax.registry/2",
    marketplaceId: "convax-official",
    sequence: 45,
    revision: emptyRegistryRevision,
    packages: [],
    ...overrides,
  }
}

function showcaseFixture(overrides = {}) {
  return {
    schema: "convax.showcase/2",
    marketplaceId: "convax-official",
    revision: emptyRegistryRevision,
    packages: [],
    ...overrides,
  }
}

describe("Official Marketplace tooling", () => {
  test("owns the v2-only descriptor, Builtin member, and preinstalled closure", async () => {
    const source = await loadOfficialMarketplaceSource(root)
    expect(source.descriptor).toEqual(officialDescriptor())
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

    expect(() => assertOfficialMarketplaceSource({
      ...source,
      descriptor: {
        ...source.descriptor,
        registry: {
          ...source.descriptor.registry,
          unexpected: { url: registryUrl },
        },
      },
    })).toThrow("unsupported field unexpected")
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

  test("passes only a complete v2 closure or an initial marker to Marketplace Kit", () => {
    expect(officialBuildArgs({
      changed: "dist/release-plan.json",
      previousDescriptor: "dist/production/marketplace.json",
      previous: "dist/production/registry-v2.json",
      previousShowcase: "dist/production/showcase-v2.json",
    })).toEqual([
      "build-index",
      ".",
      "--out",
      "dist/catalog",
      "--official",
      "--changed",
      "dist/release-plan.json",
      "--previous-descriptor",
      "dist/production/marketplace.json",
      "--previous",
      "dist/production/registry-v2.json",
      "--previous-showcase",
      "dist/production/showcase-v2.json",
    ])
    expect(officialBuildArgs({})).toEqual([
      "build-index",
      ".",
      "--out",
      "dist/catalog",
      "--official",
      "--initial",
    ])
    expect(() => officialBuildArgs({
      previous: "dist/production/registry-v2.json",
    })).toThrow("complete previous v2 closure")
    expect(() => officialBuildArgs({
      changed: "dist/release-plan.json",
    })).toThrow("Selective Official build requires a complete previous v2 closure")
    expect(() => officialBuildArgs({
      previousDescriptor: "dist/production/marketplace.json",
      previous: "dist/production/registry-v2.json",
      previousShowcase: "dist/production/showcase-v2.json",
    })).toThrow(
      "Non-initial Official build requires an exact ready-only change selection",
    )
  })

  test("runs the locked Marketplace Kit CLI with the current runtime", () => {
    expect(officialBuildInvocation([
      "build-index",
      ".",
      "--initial",
    ])).toEqual({
      args: [
        fileURLToPath(import.meta.resolve("@convax/marketplace-kit/cli")),
        "build-index",
        ".",
        "--initial",
      ],
      command: process.execPath,
    })
  })

  test("requires and forwards the Host API Catalog before spawning Marketplace Kit", async () => {
    let preflightOptions
    let spawnInvocation
    await expect(runOfficialBuild({
      environment: {},
      preflight: async () => {
        throw new Error("must not run")
      },
      spawn: () => {
        throw new Error("must not spawn")
      },
    })).rejects.toThrow("CONVAX_PLUGIN_API_CATALOG")

    await runOfficialBuild({
      environment: {
        CONVAX_PLUGIN_API_CATALOG: "fixtures/plugin-api.json",
      },
      preflight: async (options) => {
        preflightOptions = options
        return { packages: [] }
      },
      createView: async () => ({
        omissions: {
          schema: "convax.marketplace-build-omissions/1",
          omitted: [],
        },
        root: "/tmp/unused-publication-view",
      }),
      discover: async () => [],
      disposeView: async () => {},
      spawn: (command, args, options) => {
        spawnInvocation = { command, args, options }
        return { status: 0 }
      },
    })
    expect(preflightOptions).toEqual({
      catalogPath: "fixtures/plugin-api.json",
      workspaceRoot: `${root}${path.sep}`,
    })
    expect(spawnInvocation.command).toBe(process.execPath)
    expect(spawnInvocation.args.slice(1)).toEqual([
      "build-index",
      ".",
      "--out",
      "dist/catalog",
      "--official",
      "--initial",
    ])
    expect(spawnInvocation.options.env.CONVAX_PLUGIN_API_CATALOG)
      .toBe("fixtures/plugin-api.json")
  })

  test("uses a ready-only initial staging view when source contains blocked packages", async () => {
    let buildOptions
    let disposed
    await runOfficialBuild({
      build: async (options) => {
        buildOptions = options
      },
      createView: async () => ({
        omissions: {
          schema: "convax.marketplace-build-omissions/1",
          omitted: [{
            kind: "plugin",
            id: "blocked-plugin",
            version: "1.0.0",
            publication: {
              status: "blocked",
              blockers: [{
                code: "host-capability-review-required",
                note: "Pending generic contract.",
              }],
              blockedBy: ["plugin/blocked-plugin"],
            },
          }],
        },
        root: "/tmp/ready-only-publication-view",
      }),
      discover: async () => [],
      disposeView: async () => {
        disposed = true
      },
      environment: {
        CONVAX_PLUGIN_API_CATALOG: "fixtures/plugin-api.json",
      },
      preflight: async () => ({
        packages: [{
          metadata: {
            kind: "plugin",
            id: "blocked-plugin",
            version: "1.0.0",
            publication: {
              status: "blocked",
              blockers: [{
                code: "host-capability-review-required",
                note: "Pending generic contract.",
              }],
            },
          },
          manifest: { contributes: {} },
        }],
      }),
      spawn: () => {
        throw new Error("initial blocked build must not use the unfiltered root")
      },
    })
    expect(buildOptions).toEqual({
      initialOfficial: true,
      official: true,
      outDir: path.join(root, "dist", "catalog"),
      root: "/tmp/ready-only-publication-view",
    })
    expect(disposed).toBe(true)
  })

  test("fails closed when blocked source has a previous closure but no ready-only selection", async () => {
    let spawned = false
    await expect(runOfficialBuild({
      environment: {
        CONVAX_MARKETPLACE_PREVIOUS: "dist/production/registry-v2.json",
        CONVAX_MARKETPLACE_PREVIOUS_DESCRIPTOR:
          "dist/production/marketplace.json",
        CONVAX_MARKETPLACE_PREVIOUS_SHOWCASE:
          "dist/production/showcase-v2.json",
        CONVAX_PLUGIN_API_CATALOG: "fixtures/plugin-api.json",
      },
      preflight: async () => ({
        packages: [{
          metadata: {
            kind: "plugin",
            id: "blocked-plugin",
            version: "1.0.0",
            publication: {
              status: "blocked",
              blockers: [{
                code: "host-capability-review-required",
                note: "Pending generic contract.",
              }],
            },
          },
          manifest: { contributes: {} },
        }],
      }),
      spawn: () => {
        spawned = true
        return { status: 0 }
      },
    })).rejects.toThrow(
      "Non-initial Official build requires an exact ready-only change selection",
    )
    expect(spawned).toBe(false)
  })

  test("fetches and snapshots exactly one strict v2 production closure", async () => {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), "convax-marketplace-previous-"))
    try {
      const requests = []
      const result = await fetchPreviousRegistry({
        fetchImpl: async (url) => {
          requests.push(url)
          if (url.endsWith("/descriptor")) {
            return new Response(JSON.stringify(officialDescriptor()), { status: 200 })
          }
          if (url === registryUrl) {
            return new Response(JSON.stringify(registryFixture()), { status: 200 })
          }
          if (url === showcaseUrl) {
            return new Response(JSON.stringify(showcaseFixture()), { status: 200 })
          }
          return new Response("", { status: 404 })
        },
        descriptorUrl: "https://example.test/descriptor",
        outputDirectory: output,
        registryUrl,
        showcaseUrl,
      })
      expect(result).toMatchObject({
        baseRevision: `registry-v2-${emptyRegistryRevision}`,
        descriptorSnapshot: path.join(output, "marketplace.json"),
        snapshot: path.join(output, "registry-v2.json"),
        showcaseSnapshot: path.join(output, "showcase-v2.json"),
      })
      expect(requests).toEqual([
        "https://example.test/descriptor",
        registryUrl,
        showcaseUrl,
      ])
      expect(JSON.parse(await fs.readFile(result.snapshot, "utf8"))).toEqual(registryFixture())
      expect(JSON.parse(await fs.readFile(result.showcaseSnapshot, "utf8"))).toEqual(showcaseFixture())
    } finally {
      await fs.rm(output, { recursive: true, force: true })
    }
  })

  test("fails closed on missing or inconsistent v2 production inputs", async () => {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), "convax-marketplace-invalid-"))
    const fetchClosure = (fetchImpl, overrides = {}) => fetchPreviousRegistry({
      fetchImpl,
      descriptorUrl: "https://example.test/descriptor",
      outputDirectory: output,
      registryUrl,
      showcaseUrl,
      ...overrides,
    })
    try {
      const descriptorBytes = JSON.stringify(officialDescriptor())
      await expect(fetchClosure(async () => new Response("", { status: 404 })))
        .rejects.toThrow("descriptor returned HTTP 404")

      await expect(fetchClosure(async (url) => (
        url.endsWith("/descriptor")
          ? new Response(descriptorBytes, { status: 200 })
          : new Response("", { status: 404 })
      ))).rejects.toThrow("Registry v2 returned HTTP 404")

      await expect(fetchClosure(async (url) => {
        if (url.endsWith("/descriptor")) return new Response(descriptorBytes, { status: 200 })
        if (url === registryUrl) {
          return new Response(JSON.stringify(registryFixture({ unexpected: true })), { status: 200 })
        }
        return new Response(JSON.stringify(showcaseFixture()), { status: 200 })
      })).rejects.toThrow("Registry v2 strict validation failed")

      await expect(fetchClosure(async (url) => {
        if (url.endsWith("/descriptor")) return new Response(descriptorBytes, { status: 200 })
        if (url === registryUrl) {
          return new Response(JSON.stringify(registryFixture()), { status: 200 })
        }
        return new Response(JSON.stringify(showcaseFixture({ revision: "b".repeat(64) })), {
          status: 200,
        })
      })).rejects.toThrow("Showcase v2 is not a strict Registry-bound input")

      await expect(fetchClosure(
        async (url) => (
          url.endsWith("/descriptor")
            ? new Response(descriptorBytes, { status: 200 })
            : new Response("", { status: 404 })
        ),
        { registryUrl: "https://example.test/unpinned.json" },
      )).rejects.toThrow("URLs differ from the pinned Official closure")
    } finally {
      await fs.rm(output, { recursive: true, force: true })
    }
  })
})
