import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
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

const sourceRoot = path.join(root, "packages", "plugins", "storyai-3d-director-desk")
const packageRoot = path.join(sourceRoot, "package")
const skillRoot = path.join(root, "packages", "skills", "storyai-3d-director-desk")
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
  test("publishes the pinned static v8 Plugin and owns its independently authored Skill", async () => {
    const packages = await discoverPackages({
      kind: "plugin",
      id: "storyai-3d-director-desk",
    })
    const metadata = packages.find((pkg) => pkg.kind === "plugin").metadata
    const manifest = parsePluginManifest(
      await readJson(path.join(packageRoot, "manifest.json")),
      "plugin/storyai-3d-director-desk manifest",
    )
    const skillMetadata = packages.find((pkg) => pkg.kind === "skill").metadata

    expect(metadata).toEqual(expect.objectContaining({
      schema: "convax.package/2",
      kind: "plugin",
      id: "storyai-3d-director-desk",
      name: "3D Director Desk",
      description: manifest.description,
      version: "0.1.3",
      publication: {
        status: "ready",
        blockers: [],
      },
      yanked: false,
    }))
    expect(metadata).not.toHaveProperty("compatibility")
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
      schema: "convax.plugin/8",
      id: metadata.id,
      name: metadata.name,
      description: metadata.description,
      version: metadata.version,
      entry: "index.html",
      capabilities: ["canvas.node.write", "canvas.image.write"],
      hostApi: {
        major: 1,
        required: [
          "canvas.node.state.replace",
          "canvas.resource.image.create",
          "host.context.get",
        ],
        optional: [],
      },
    }))
    expect(manifest.contributes).toEqual({
      canvas: {
        renderer: { create: true, width: 1100, height: 700 },
        commands: [{
          id: "scene.play",
          title: {
            default: "Link current frame",
            "zh-CN": "关联当前帧",
          },
          icon: "play",
          target: {
            type: "renderer-message",
            message: "renderer.scene.play",
          },
        }],
        toolbar: [{
          id: "scene-play-toolbar",
          command: "scene.play",
          order: 10,
        }],
      },
      skills: [{
        name: "storyai-3d-director-desk",
        path: "skills/storyai-3d-director-desk",
      }],
    })
    expect(manifest).not.toHaveProperty("skill")
    expect(skillMetadata).toMatchObject({
      schema: "convax.package/2",
      kind: "skill",
      id: "storyai-3d-director-desk",
      ownerPluginId: metadata.id,
      publication: { status: "ready", blockers: [] },
    })
    expect(
      await fs.readFile(path.join(skillRoot, "package", "SKILL.md"), "utf8"),
    ).toContain("references/convax-capabilities.md")
  })

  test("pins the licensed upstream build and excludes the non-open model", async () => {
    const files = await collectFiles(packageRoot, 0)
    assertPluginStatic(files, "plugin/storyai-3d-director-desk")
    expect(files.map((file) => file.relativePath)).toEqual([
      "LICENSE",
      "UPSTREAM.md",
      "UPSTREAM.patch",
      "assets/app.js",
      "assets/plugin-host-client.js",
      "assets/styles.css",
      "index.html",
      "manifest.json",
    ])
    expect(files.some((file) => file.relativePath.endsWith(".glb"))).toBe(false)
    expect(await vendorSha256("app.js")).toBe(
      "ca87a7d8f2666eaf728dd5ea9ae7078821996d032140c4437ce5047e7bba65a1",
    )
    expect(await sha256("assets/app.js")).toBe(
      "6e25840733a4f39fca753039f2e80ea59185e696b515fdaaf10d371f0ee97671",
    )
    expect(await sha256("assets/plugin-host-client.js")).toBe(
      "92a67e87e2b5ea331429afd17ca7c2459ecbd8dc58ec1198c7aeb6f30b3e4477",
    )
    expect(await sha256("assets/styles.css")).toBe(
      "6cce301d037ab3483cda7a5d1587fcd6258e59e7baee4ed6d8b17fc080ac8620",
    )
    expect(await sha256("index.html")).toBe(
      "cca741699d677bb752288d02a61e11228cdcd810787bfb06f6d96e2deab9e646",
    )
    expect(await sha256("UPSTREAM.patch")).toBe(
      "e3d10db792f0dd5d020bad84a60cb5f393451a0cbdd8d598c84ee17be3cd07bd",
    )
    expect(await read("LICENSE")).toContain("MIT License")
    expect(await read("UPSTREAM.md")).toContain(upstreamCommit)
    expect(await read("UPSTREAM.md")).toContain("microvoid/convax-plugins")
  })

  test("uses only the v8 sandboxed Plugin Host protocol", async () => {
    const [entry, application, sdkClient, styles] = await Promise.all([
      read("index.html"),
      read("assets/app.js"),
      read("assets/plugin-host-client.js"),
      read("assets/styles.css"),
    ])

    expect(entry).toContain('src="./assets/app.js"')
    expect(entry).toContain('href="./assets/styles.css"')
    expect(entry).not.toContain("<style")
    expect(entry).not.toMatch(/(?:src|href)=["'](?:https?:|\/\/|\/)/u)
    expect(styles).not.toContain("url(")
    expect(application).toContain('from"./plugin-host-client.js"')
    expect(application).toContain("callHostApi")
    expect(application).toContain("onCommand")
    expect(sdkClient).toContain("@convax/plugin-sdk/client:createPluginHostClient")
    expect(sdkClient).toContain("convax.plugin-host/8")
    expect(application).toContain("host.context.get")
    expect(application).toContain("canvas.node.state.replace")
    expect(application).toContain("canvas.resource.image.create")
    expect(application).toContain("directorProject")
    expect(application).toContain("presentation")
    expect(application).toContain("directorView")
    expect(sdkClient).toContain("storyai-3d-director-desk")
    expect(application).toContain("Convax Plugin host request timed out")
    expect(application).toContain("pagehide")
    expect(application).toContain("visibilitychange")
    expect(application).toContain("不兼容的状态版本")
    expect(application).toContain("本地导入的媒体和机位截图仅在当前会话可用")
    expect(styles).toContain(".convax-state-notice")
    expect(sdkClient).toContain("pluginId")
    expect(sdkClient).toContain("window.parent")
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
    const patches = await read("UPSTREAM.patch")
    const additions = patches
      .split("\n")
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .join("\n")

    expect(patches).toContain("blockedStateSerialized")
    expect(patches).toContain("LEGACY_HOST_STATE_SCHEMA_VERSION")
    expect(patches).toContain("presentation")
    expect(patches).toContain("onTransformEnd")
    expect(patches).toContain("queues the final director view immediately")
    expect(patches).toContain("initDirectorDeskHostBridge();")
    expect(patches).toContain("原数据已保留且不会被覆盖")
    expect(patches).toContain("canvas.resource.image.create")
    expect(patches).toContain('PLAY_COMMAND = "renderer.scene.play"')
    expect(patches).toContain("hostClient.callHostApi")
    expect(patches).toContain("hostClient.onCommand")
    expect(additions).not.toContain("convax.plugin-host/8")
    expect(additions).not.toContain('type: "request"')
    expect(additions).not.toContain(".postMessage(")
    expect(additions).not.toContain("new Map<string, PendingRequest>")
  })
})
