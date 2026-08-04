import { describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import path from "node:path"
import { parsePluginManifestV8 } from "@convax/plugin-sdk"
import {
  buildPluginHostClient,
  buildPetSurfaceAssets,
  createPluginClientManifestProjection,
  petSdkClientBundleMarker,
  pluginSdkClientBundleMarker,
} from "./build-plugin-host-client.mjs"
import { root } from "./lib.mjs"

const pluginIds = [
  "chatcut",
  "hello-convax",
  "jianying-editor",
  "multi-angle",
  "panorama-viewer",
  "relight-studio",
  "storyai-3d-director-desk",
  "video-timeline",
]

function pluginRoot(id) {
  return path.join(root, "packages", "plugins", id)
}

async function readJson(pathname) {
  return JSON.parse(await fs.readFile(pathname, "utf8"))
}

describe("shared Plugin SDK client build", () => {
  test("builds Pet surfaces from the public SDK and standalone Plugin UI package", async () => {
    const packageRoot = pluginRoot("convax-pet")
    await buildPetSurfaceAssets({ check: true, packageRoot })
    const [application, authorSource, theme, workspace] = await Promise.all([
      fs.readFile(path.join(packageRoot, "package", "assets", "pet-host-client.js"), "utf8"),
      fs.readFile(path.join(packageRoot, "src", "pet-host-client.js"), "utf8"),
      fs.readFile(path.join(packageRoot, "package", "assets", "plugin-theme.css"), "utf8"),
      readJson(path.join(packageRoot, "package.json")),
    ])
    expect(workspace.devDependencies).toEqual({
      "@convax/plugin-sdk": "0.1.1",
      "@convax/plugin-ui": "0.1.0",
    })
    expect(authorSource).toContain('from "@convax/plugin-sdk/pet-client"')
    expect(application).toContain(petSdkClientBundleMarker)
    expect(application).not.toContain('pluginId:"convax-pet"')
    expect(theme).toContain("--ui-surface-canvas:")
    expect(theme).toContain("@media (prefers-color-scheme: dark)")
    expect(theme).not.toContain("@import")
  })

  test("projects only client declarations and preserves capability imports", () => {
    const boundedObject = {
      additionalProperties: false,
      properties: {},
      required: [],
      type: "object",
    }
    const imports = {
      optional: [],
      required: [
        {
          id: "media.asset.inspect",
          inputSchema: boundedObject,
          outputSchema: boundedObject,
          version: {
            maximumExclusive: "2.0.0",
            minimum: "1.0.0",
          },
        },
      ],
    }
    const projection = createPluginClientManifestProjection({
      schema: "convax.plugin/8",
      id: "projection-fixture",
      name: "Projection fixture",
      description: "Verifies the browser-safe SDK declaration.",
      version: "1.0.0",
      entry: "index.html",
      capabilities: ["agent.prompt"],
      contributes: {
        agent: {
          mcp: {
            type: "remote",
            url: "https://credentials.example.invalid/mcp",
          },
        },
        canvas: {
          renderer: { create: true, height: 400, width: 640 },
        },
        capabilities: {
          exports: [
            {
              id: "private.export",
              operation: "private.export",
            },
          ],
          imports,
        },
        skills: [{ name: "private-skill", path: "skills/private-skill" }],
      },
      hostApi: {
        major: 3,
        required: ["host.context.get"],
        optional: [],
      },
    })

    expect(projection).toEqual({
      schema: "convax.plugin/8",
      id: "projection-fixture",
      name: "Projection fixture",
      description: "Verifies the browser-safe SDK declaration.",
      version: "1.0.0",
      entry: "index.html",
      capabilities: [],
      contributes: {
        canvas: {
          renderer: { create: true, height: 400, width: 640 },
        },
        capabilities: {
          exports: [],
          imports,
        },
      },
      hostApi: {
        major: 3,
        required: ["host.context.get"],
        optional: [],
      },
    })
    expect(() => parsePluginManifestV8(projection)).not.toThrow()
    expect(JSON.stringify(projection)).not.toContain("https://")
    expect(JSON.stringify(projection)).not.toContain("private-skill")
    expect(JSON.stringify(projection)).not.toContain("private.export")
  })

  test("all Web packages use one deterministic browser bundle boundary", async () => {
    const roots = [
      ...pluginIds.map(pluginRoot),
      path.join(root, "templates", "plugin-basic"),
    ]
    const violations = []

    for (const packageRoot of roots) {
      await buildPluginHostClient({ check: true, packageRoot })
      const [application, manifest, source, workspace] = await Promise.all([
        fs.readFile(
          path.join(packageRoot, "package", "assets", "plugin-host-client.js"),
          "utf8",
        ),
        readJson(path.join(packageRoot, "package", "manifest.json")),
        fs.readFile(path.join(packageRoot, "src", "plugin-host-client.js"), "utf8"),
        readJson(path.join(packageRoot, "package.json")),
      ])
      const label = manifest.id
      if (workspace.devDependencies?.["@convax/plugin-sdk"] !== "0.1.1") {
        violations.push(`${label}: @convax/plugin-sdk must be exactly 0.1.1`)
      }
      if (
        workspace.scripts?.build !== "bun scripts/build.ts" ||
        workspace.scripts?.["build:check"] !== "bun scripts/build.ts --check"
      ) {
        violations.push(`${label}: build scripts do not use the package builder`)
      }
      if (
        !source.includes('from "@convax/plugin-sdk/client"') ||
        !source.includes("createPluginHostClient")
      ) {
        violations.push(`${label}: author source does not consume the SDK client`)
      }
      if (
        !application.includes(pluginSdkClientBundleMarker) ||
        !application.includes("convax.plugin-host/8")
      ) {
        violations.push(`${label}: generated SDK provenance is missing`)
      }
      if (
        application.includes("../convax/") ||
        application.includes("/Users/") ||
        /(?:^|\n)\/\/[^\n]*node_modules\//u.test(application) ||
        /https?:\/\//u.test(application)
      ) {
        violations.push(`${label}: generated SDK bundle leaked build or remote provenance`)
      }
    }

    expect(violations).toEqual([])
  })

  test("ChatCut client bundle excludes its remote MCP declaration", async () => {
    const source = await fs.readFile(
      path.join(
        pluginRoot("chatcut"),
        "package",
        "assets",
        "plugin-host-client.js",
      ),
      "utf8",
    )
    expect(source).not.toContain("api.chatcut.io")
    expect(source).not.toContain("external-mcp")
    expect(source).not.toContain("x-chatcut-mcp-surface")
    expect(source).toContain("agent.prompt")
    expect(source).toContain("canvas.inputs.list")
    expect(source).toContain("host.context.get")
  })

  test("authoring docs teach SDK commands instead of wire envelopes", async () => {
    const [authoring, templateAuthoring] = await Promise.all([
      fs.readFile(path.join(root, "docs", "plugin-authoring.md"), "utf8"),
      fs.readFile(
        path.join(root, "templates", "plugin-basic", "AUTHORING.md"),
        "utf8",
      ),
    ])
    for (const source of [authoring, templateAuthoring]) {
      expect(source).toContain("client.onCommand")
      expect(source).toContain("bun run build:check")
      expect(source).not.toContain('message.protocol === "convax.plugin-host/8"')
      expect(source).not.toContain("port.postMessage")
    }
  })
})
