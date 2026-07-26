import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

import {
  assertPluginStatic,
  collectFiles,
  parsePluginManifest,
  parseSourceMetadata,
  readJson,
  root,
} from "./lib.mjs"

const sourceRoot = path.join(root, "packages", "plugins", "storyai-3d-director-desk")
const packageRoot = path.join(sourceRoot, "package")
const upstreamCommit = "8c8bd361790be4d37158a7430365e65546e358fe"

async function read(relativePath) {
  return fs.readFile(path.join(packageRoot, ...relativePath.split("/")), "utf8")
}

async function sha256(relativePath) {
  return createHash("sha256")
    .update(await fs.readFile(path.join(packageRoot, ...relativePath.split("/"))))
    .digest("hex")
}

async function vendorSha256(relativePath) {
  return createHash("sha256")
    .update(await fs.readFile(path.join(sourceRoot, "vendor", ...relativePath.split("/"))))
    .digest("hex")
}

describe("storyai-3d-director-desk package", () => {
  test("publishes the pinned static Plugin and retains the legacy companion Skill lifecycle", async () => {
    const metadata = parseSourceMetadata(
      await readJson(path.join(sourceRoot, "convax-package.json")),
      "plugin/storyai-3d-director-desk",
    )
    const manifest = parsePluginManifest(
      await readJson(path.join(packageRoot, "manifest.json")),
      "plugin/storyai-3d-director-desk manifest",
    )

    expect(metadata).toEqual(expect.objectContaining({
      schema: "convax.package/1",
      kind: "plugin",
      id: "storyai-3d-director-desk",
      name: "3D Director Desk",
      description: manifest.description,
      version: "0.1.0",
      license: "MIT",
      compatibility: {
        pluginSchema: "convax.plugin/1",
        pluginHost: "convax.plugin-host/1",
      },
      yanked: false,
    }))
    expect(metadata.showcase).toEqual({
      poster: {
        path: "showcase/poster.png",
        alt: "3D Director Desk read-only planning and review workflow preview.",
        mime: "image/png",
        width: 1280,
        height: 720,
      },
      animation: {
        path: "showcase/animation.mp4",
        alt: "3D Director Desk reads a stage, offers blocking guidance, and reviews the user's adjustments.",
        mime: "video/mp4",
        width: 1280,
        height: 720,
      },
    })
    expect(manifest).toEqual(expect.objectContaining({
      schema: "convax.plugin/1",
      id: metadata.id,
      name: metadata.name,
      description: metadata.description,
      version: metadata.version,
      entry: "index.html",
      capabilities: ["canvas.node.write", "canvas.image.write"],
      skill: "SKILL.md",
    }))
    expect(manifest.contributes.canvas).toEqual({
      renderer: { create: true, width: 1100, height: 700 },
      toolbar: [{ command: "scene.play", id: "play", title: "关联当前帧" }],
    })
  })

  test("pins the licensed upstream build and excludes the non-open model", async () => {
    const files = await collectFiles(packageRoot, 0)
    assertPluginStatic(files, "plugin/storyai-3d-director-desk")
    expect(files.map((file) => file.relativePath)).toEqual([
      "LICENSE",
      "SKILL.md",
      "UPSTREAM.frame.patch",
      "UPSTREAM.md",
      "UPSTREAM.patch",
      "UPSTREAM.state.patch",
      "UPSTREAM.view.patch",
      "assets/app.js",
      "assets/styles.css",
      "index.html",
      "manifest.json",
    ])
    expect(files.some((file) => file.relativePath.endsWith(".glb"))).toBe(false)
    expect(await vendorSha256("app.js")).toBe(
      "a98fa137c6917ec77a1f957826cefcb70fccb749d8a46868cd4c2457d701eec4",
    )
    expect(await sha256("assets/app.js")).toBe(
      "262c9dbfa7fd4685181a79a8eb288ea76860e029e13f117e6a98a4353f21b540",
    )
    expect(await sha256("assets/styles.css")).toBe(
      "6cce301d037ab3483cda7a5d1587fcd6258e59e7baee4ed6d8b17fc080ac8620",
    )
    expect(await sha256("index.html")).toBe(
      "cca741699d677bb752288d02a61e11228cdcd810787bfb06f6d96e2deab9e646",
    )
    expect(await sha256("UPSTREAM.patch")).toBe(
      "9b25fa03c69f346d46a33d82e295a04c22bf8f80146aeda21e08430a103bf287",
    )
    expect(await sha256("UPSTREAM.state.patch")).toBe(
      "04732e1e1d711ffddd0ccafc044c8fa4114a3e4808c9cb75cdab3eb621619124",
    )
    expect(await sha256("UPSTREAM.view.patch")).toBe(
      "326188b1fd0d45f7cd9b59645a7bdbc5c0f60c0efd0d0b33623b762c055aa49e",
    )
    expect(await sha256("UPSTREAM.frame.patch")).toBe(
      "bda62e3d18a7d0718a9dd37dc30c8736990cae8ce6b2b621c7d552392d05735e",
    )
    expect(await read("LICENSE")).toContain("MIT License")
    expect(await read("UPSTREAM.md")).toContain(upstreamCommit)
    expect(await read("UPSTREAM.md")).toContain("microvoid/convax-plugins")
  })

  test("uses only the existing sandboxed Plugin host protocol", async () => {
    const [entry, application, styles] = await Promise.all([
      read("index.html"),
      read("assets/app.js"),
      read("assets/styles.css"),
    ])

    expect(entry).toContain('src="./assets/app.js"')
    expect(entry).toContain('href="./assets/styles.css"')
    expect(entry).not.toContain("<style")
    expect(entry).not.toMatch(/(?:src|href)=["'](?:https?:|\/\/|\/)/u)
    expect(styles).not.toContain("url(")
    expect(application).toContain("convax.plugin-host/1")
    expect(application).toContain("host.context.get")
    expect(application).toContain("canvas.node.updateState")
    expect(application).toContain("canvas.image.create")
    expect(application).toContain("directorProject")
    expect(application).toContain("presentation")
    expect(application).toContain("directorView")
    expect(application).toContain("storyai-3d-director-desk")
    expect(application).toContain("Convax Plugin host request timed out")
    expect(application).toContain("pagehide")
    expect(application).toContain("visibilitychange")
    expect(application).toContain("不兼容的状态版本")
    expect(application).toContain("本地导入的媒体和机位截图仅在当前会话可用")
    expect(styles).toContain(".convax-state-notice")
    expect(application).toContain("pluginId")
    expect(application).toContain("window.parent")
    expect(application).not.toContain("localStorage")
    expect(application).not.toContain("sessionStorage")
    expect(application).not.toContain("indexedDB")
    expect(application).not.toContain("/__hub-sdk__.js")
    expect(application).not.toContain("window.hub")
    expect(application).not.toContain("ue-mannequin-retopology")
    expect(application).not.toContain("cdn.hailuo")
    expect(application).not.toContain("sketchfab")
    expect(application).not.toContain("window.parent.postMessage")
    expect(application).not.toContain("导入本地模型")
    expect(application).not.toContain("下载图片")
  })

  test("keeps the audited host-state and viewport-capture patches", async () => {
    const patches = await Promise.all([
      read("UPSTREAM.patch"),
      read("UPSTREAM.state.patch"),
      read("UPSTREAM.view.patch"),
      read("UPSTREAM.frame.patch"),
    ]).then((parts) => parts.join("\n"))

    expect(patches).toContain("event.source !== window.parent")
    expect(patches).toContain("blockedStateSerialized")
    expect(patches).toContain("LEGACY_HOST_STATE_SCHEMA_VERSION")
    expect(patches).toContain("presentation")
    expect(patches).toContain("onTransformEnd")
    expect(patches).toContain("posts the final director view immediately")
    expect(patches).toContain("initDirectorDeskHostBridge();")
    expect(patches).toContain("原数据已保留且不会被覆盖")
    expect(patches).toContain("canvas.image.create")
    expect(patches).toContain('PLAY_COMMAND = "scene.play"')
  })
})
