import { describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import path from "node:path"

import {
  assertPluginStatic,
  collectFiles,
  discoverPackages,
  parsePluginManifest,
  readJson,
  root,
} from "./lib.mjs"

const sourceRoot = path.join(root, "packages", "plugins", "panorama-viewer")
const packageRoot = path.join(sourceRoot, "package")

describe("panorama-viewer package", () => {
  test("ships one static Chinese Panorama Viewer with explicit viewport capture authority", async () => {
    const [plugin] = await discoverPackages({ kind: "plugin", id: "panorama-viewer" })
    const metadata = plugin.metadata
    const manifest = parsePluginManifest(
      await readJson(path.join(packageRoot, "manifest.json")),
      "plugin/panorama-viewer manifest",
    )

    expect(metadata).toEqual({
      schema: "convax.package/2",
      kind: "plugin",
      id: "panorama-viewer",
      name: "全景图预览",
      description: manifest.description,
      version: "0.3.2",
      publication: {
        status: "blocked",
        blockers: [
          {
            code: "host-capability-review-required",
            note: expect.stringContaining(
              "docs/host-capability-requests/web-plugin-image-input-read.md",
            ),
          },
        ],
      },
      yanked: false,
    })
    expect(manifest).toEqual(expect.objectContaining({
      schema: "convax.plugin/8",
      id: metadata.id,
      name: metadata.name,
      description: metadata.description,
      version: metadata.version,
      entry: "index.html",
      capabilities: [
        "canvas.connectedInputs.read",
        "canvas.connectedImages.read",
        "canvas.image.write",
        "canvas.node.write",
        "ui.fullscreen",
      ],
      hostApi: {
        major: 3,
        required: [
          "canvas.inputs.image.close",
          "canvas.inputs.image.open",
          "canvas.inputs.list",
          "canvas.node.state.replace",
          "canvas.resource.image.create",
          "host.context.get",
        ],
        optional: [],
      },
    }))
    expect(manifest.contributes.canvas.commands).toEqual([
      {
        id: "panorama.capture-viewport",
        title: { default: "Capture viewport", "zh-CN": "截取画面" },
        target: {
          type: "renderer-message",
          message: "renderer.panorama.capture-viewport",
        },
      },
      {
        id: "panorama.reset",
        title: { default: "Reset view", "zh-CN": "重置视角" },
        target: {
          type: "renderer-message",
          message: "renderer.panorama.reset",
        },
      },
      {
        id: "panorama.toggle-auto-rotate",
        title: { default: "Toggle auto-rotate", "zh-CN": "自动旋转" },
        target: {
          type: "renderer-message",
          message: "renderer.panorama.toggle-auto-rotate",
        },
      },
      {
        id: "panorama.refresh-connections",
        title: { default: "Refresh images", "zh-CN": "刷新图片" },
        icon: "refresh",
        target: {
          type: "renderer-message",
          message: "renderer.panorama.refresh-connections",
        },
      },
    ])
    expect(manifest.contributes.canvas.toolbar).toEqual([
      { command: "panorama.capture-viewport", id: "capture-viewport", order: 10 },
      { command: "panorama.reset", id: "reset", order: 20 },
      { command: "panorama.toggle-auto-rotate", id: "auto-rotate", order: 30 },
      { command: "panorama.refresh-connections", id: "refresh", order: 40 },
    ])
  })

  test("contains only offline static browser files and implements PNG viewport capture", async () => {
    const files = await collectFiles(packageRoot, 0)
    assertPluginStatic(files, "plugin/panorama-viewer")
    expect(files.map((file) => file.relativePath)).toEqual([
      "LICENSE",
      "assets/app.js",
      "assets/panorama-image.js",
      "assets/panorama-renderer.js",
      "assets/plugin-host-client.js",
      "assets/styles.css",
      "index.html",
      "manifest.json",
    ])

    const [app, renderer] = await Promise.all([
      fs.readFile(path.join(packageRoot, "assets", "app.js"), "utf8"),
      fs.readFile(path.join(packageRoot, "assets", "panorama-renderer.js"), "utf8"),
    ])
    expect(app).toContain('hostRequest("canvas.resource.image.create"')
    expect(app).toContain("全景视口截图.png")
    expect(renderer).toContain("gl.readPixels")
    expect(renderer).toContain('output.toBlob')
  })
})
