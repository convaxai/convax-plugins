import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  selectReadableConnectedImage,
  withPanoramaImageSession,
} from "../package/assets/panorama-image.js"

const pluginRoot = path.resolve(import.meta.dir, "..")
const repositoryRoot = path.resolve(import.meta.dir, "../../../..")

describe("panorama-viewer v8 Web Host API", () => {
  test("uses only declared Catalog ids and opaque input keys", async () => {
    const [application, sdkClient, imageDecoder, manifest, metadata, workspace, publication] = await Promise.all([
      readFile(path.join(pluginRoot, "package/assets/app.js"), "utf8"),
      readFile(path.join(pluginRoot, "package/assets/plugin-host-client.js"), "utf8"),
      readFile(path.join(pluginRoot, "package/assets/panorama-image.js"), "utf8"),
      readFile(path.join(pluginRoot, "package/manifest.json"), "utf8").then(JSON.parse),
      readFile(path.join(pluginRoot, "convax-package.json"), "utf8").then(JSON.parse),
      readFile(path.join(pluginRoot, "package.json"), "utf8").then(JSON.parse),
      readFile(path.join(repositoryRoot, "registry/host-capability-policy.json"), "utf8").then(JSON.parse),
    ])

    expect([manifest.version, metadata.version, workspace.version]).toEqual([
      "0.3.2",
      "0.3.2",
      "0.3.2",
    ])
    expect(metadata).not.toHaveProperty("publication")
    expect(publication.requests.flatMap((request) => request.affected)
      .find((item) => item.id === "panorama-viewer")).toMatchObject({
      blocker: {
        code: "host-capability-review-required",
        note: expect.stringContaining("docs/host-capability-requests/web-plugin-image-input-read.md"),
      },
    })
    expect(manifest.capabilities).toEqual([
      "canvas.connectedInputs.read",
      "canvas.connectedImages.read",
      "canvas.image.write",
      "canvas.node.write",
      "ui.fullscreen",
    ])
    expect(manifest.hostApi).toEqual({
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
    })
    expect(manifest.contributes.canvas.commands).toEqual([
      {
        id: "panorama.capture-viewport",
        title: {
          default: "Capture viewport",
          "zh-CN": "截取画面",
        },
        target: {
          type: "renderer-message",
          message: "renderer.panorama.capture-viewport",
        },
      },
      {
        id: "panorama.reset",
        title: {
          default: "Reset view",
          "zh-CN": "重置视角",
        },
        target: {
          type: "renderer-message",
          message: "renderer.panorama.reset",
        },
      },
      {
        id: "panorama.toggle-auto-rotate",
        title: {
          default: "Toggle auto-rotate",
          "zh-CN": "自动旋转",
        },
        target: {
          type: "renderer-message",
          message: "renderer.panorama.toggle-auto-rotate",
        },
      },
      {
        id: "panorama.refresh-connections",
        title: {
          default: "Refresh images",
          "zh-CN": "刷新图片",
        },
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
    expect(manifest.contributes.canvas.toolbar.every((item) => !("title" in item))).toBe(true)
    expect(application).toContain(
      'import { acceptPluginHostConnection } from "./plugin-host-client.js"',
    )
    expect(sdkClient).toContain("@convax/plugin-sdk/client:createPluginHostClient")
    expect(sdkClient).toContain("convax.plugin-host/8")
    for (const token of [
      "canvas.inputs.changed",
      "canvas.inputs.list",
      "canvas.inputs.image.open",
      "canvas.inputs.image.close",
      "canvas.node.state.replace",
      "canvas.resource.image.create",
    ]) {
      expect(application).toContain(token)
    }
    expect(application).toContain("hostClient.callHostApi(method, params")
    expect(application).toContain("hostClient.onCommand(handleHostCommand)")
    expect(application).not.toContain('type: "request"')
    expect(application).not.toMatch(/\.postMessage\s*\(/u)
    expect(application).not.toContain("new Map")
    for (const message of [
      "renderer.panorama.capture-viewport",
      "renderer.panorama.reset",
      "renderer.panorama.toggle-auto-rotate",
      "renderer.panorama.refresh-connections",
    ]) {
      expect(application).toContain(message)
    }
    expect(application).toContain("result.inputs")
    expect(application).toContain("{ inputKey }")
    expect(application).toContain("sourceLoadController?.abort")
    expect(application).toContain("withPanoramaImageSession")
    expect(application).not.toContain("selectedSourceInputKey:")
    expect(imageDecoder).toContain('url.startsWith("convax-connected-media://")')
    for (const legacyCommand of [
      '"panorama.capture-viewport"',
      '"panorama.reset"',
      '"panorama.toggle-auto-rotate"',
      '"panorama.refresh-connections"',
    ]) {
      expect(application).not.toContain(legacyCommand)
    }
    for (const legacyToken of [
      "convax.plugin-capability/3",
      "canvas.connectedImages.changed",
      "canvas.connectedImages.list",
      "canvas.connectedImage.read",
      "canvas.node.updateState",
      "canvas.image.create",
    ]) {
      expect(application).not.toContain(legacyToken)
    }
    expect(application).not.toMatch(/convax\.plugin-host\/[1-7]\b/u)
    expect(application).not.toContain("result.images")
    expect(application).not.toContain("{ nodeId:")
  })

  test("closes an acquired image session exactly once after success, failure, or cancellation", async () => {
    const opened = {
      probe: { kind: "image" },
      sessionId: "panorama-session",
      url: "convax-connected-media://panorama-session/token",
    }
    for (const outcome of ["success", "failure", "cancel"]) {
      const controller = new AbortController()
      const closes = []
      const result = withPanoramaImageSession({
        close: async (sessionId) => { closes.push(sessionId) },
        inputKey: "opaque-panorama-input",
        open: async () => opened,
        signal: controller.signal,
        use: async () => {
          if (outcome === "failure") throw new Error("decode failed")
          if (outcome === "cancel") {
            controller.abort(new Error("stale panorama"))
            throw controller.signal.reason
          }
          return "ready"
        },
      })
      if (outcome === "success") await expect(result).resolves.toBe("ready")
      else await expect(result).rejects.toThrow(outcome === "failure" ? "decode failed" : "stale panorama")
      expect(closes).toEqual(["panorama-session"])
    }
  })

  test("switches between two inputs by exact opaque inputKey", () => {
    const inputs = [
      { id: "legacy-a", inputKey: "opaque-a", readable: true },
      { id: "legacy-b", inputKey: "opaque-b", readable: true },
    ]
    expect(selectReadableConnectedImage(inputs, "opaque-a")).toBe(inputs[0])
    expect(selectReadableConnectedImage(inputs, "opaque-b")).toBe(inputs[1])
    expect(selectReadableConnectedImage(inputs, "legacy-a")).toBeNull()
    expect(selectReadableConnectedImage(inputs, "missing")).toBeNull()
  })

  test("does not claim an exact close when the SDK rejects an open result before returning it", async () => {
    const closes = []
    await expect(withPanoramaImageSession({
      close: async (sessionId) => { closes.push(sessionId) },
      inputKey: "opaque-panorama-input",
      open: async () => {
        throw new Error("Plugin Host returned an invalid result")
      },
      use: async () => {
        throw new Error("must not decode")
      },
    })).rejects.toThrow("Plugin Host returned an invalid result")
    expect(closes).toEqual([])
  })
})
