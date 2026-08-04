import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

const pluginRoot = path.resolve(import.meta.dir, "..")
const skillRoot = path.resolve(pluginRoot, "..", "..", "skills", "storyai-3d-director-desk")

async function read(relativePath) {
  return readFile(path.join(pluginRoot, relativePath), "utf8")
}

describe("storyai-3d-director-desk v8 Web Host API", () => {
  test("publishes and preserves patches for only host/8 Catalog ids", async () => {
    const [
      application,
      build,
      manifest,
      metadata,
      patches,
      sdkClient,
      skillMetadata,
      skillWorkspace,
      vendor,
      workspace,
    ] = await Promise.all([
      read("package/assets/app.js"),
      read("scripts/build.ts"),
      read("package/manifest.json").then(JSON.parse),
      read("convax-package.json").then(JSON.parse),
      read("package/UPSTREAM.patch"),
      read("package/assets/plugin-host-client.js"),
      readFile(path.join(skillRoot, "convax-package.json"), "utf8").then(
        JSON.parse,
      ),
      readFile(path.join(skillRoot, "package.json"), "utf8").then(JSON.parse),
      read("vendor/app.js"),
      read("package.json").then(JSON.parse),
    ])

    expect([manifest.version, metadata.version, workspace.version]).toEqual([
      "0.3.1",
      "0.3.1",
      "0.3.1",
    ])
    expect([skillMetadata.version, skillWorkspace.version]).toEqual(["0.2.0", "0.2.0"])
    expect(manifest.hostApi).toEqual({
      major: 3,
      required: [
        "canvas.node.state.replace",
        "canvas.resource.image.create",
        "host.context.get",
      ],
      optional: [],
    })
    expect(sdkClient).toContain("@convax/plugin-sdk/client:createPluginHostClient")
    expect(sdkClient).toContain("convax.plugin-host/8")
    for (const token of [
      "canvas.node.state.replace",
      "canvas.resource.image.create",
      "host.context.get",
    ]) {
      expect(application).toContain(token)
      expect(patches).toContain(token)
      expect(vendor).toContain(token)
    }
    expect(application).toContain('from"./plugin-host-client.js"')
    expect(vendor).toContain('from"./plugin-host-client.js"')
    expect(application).toContain("callHostApi")
    expect(application).toContain("onCommand")
    expect(patches).toContain('from "./plugin-host-client.js"')
    expect(patches).toContain("hostClient.callHostApi")
    expect(patches).toContain("hostClient.onCommand")
    const addedPatchLines = patches
      .split("\n")
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .join("\n")
    expect(addedPatchLines).not.toContain("convax.plugin-host/8")
    expect(addedPatchLines).not.toContain('type: "request"')
    expect(addedPatchLines).not.toContain(".postMessage(")
    expect(addedPatchLines).not.toContain("new Map<string, PendingRequest>")
    for (const legacyToken of [
      "convax.plugin-capability/3",
      "canvas.node.updateState",
      "canvas.image.create",
    ]) {
      expect(application).not.toContain(legacyToken)
      expect(patches).not.toContain(legacyToken)
      expect(vendor).not.toContain(legacyToken)
      expect(build).not.toContain(`replaceAll("${legacyToken}`)
    }
    expect(application).not.toMatch(/convax\.plugin-host\/[1-8]\b/u)
    expect(patches).not.toMatch(/convax\.plugin-host\/[1-7]\b/u)
    expect(vendor).not.toMatch(/convax\.plugin-host\/[1-8]\b/u)
    expect(build).not.toContain(`replaceAll('"scene.play"'`)
    expect(manifest.contributes.canvas.commands).toEqual([
      {
        icon: "play",
        id: "scene.play",
        target: {
          message: "renderer.scene.play",
          type: "renderer-message",
        },
        title: {
          default: "Link current frame",
          "zh-CN": "关联当前帧",
        },
      },
    ])
    expect(manifest.contributes.canvas.toolbar).toEqual([
      {
        command: "scene.play",
        id: "scene-play-toolbar",
        order: 10,
      },
    ])
    expect(manifest.contributes.canvas.toolbar[0]).not.toHaveProperty("title")
    expect(manifest.contributes.canvas.toolbar[0]).not.toHaveProperty("icon")
    expect(manifest.contributes.canvas.toolbar[0]).not.toHaveProperty("target")
    expect(application).toContain('"renderer.scene.play"')
    expect(patches).toContain('"renderer.scene.play"')
    expect(application).not.toContain('"scene.play"')
    expect(patches).not.toContain('"scene.play"')
  })
})
