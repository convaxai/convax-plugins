import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  normalizeImageInputs,
  parseOpenedImageStream,
} from "../package/assets/image-inputs.js"

const packageRoot = path.join(import.meta.dir, "..", "package")
const repositoryRoot = path.resolve(import.meta.dir, "../../../..")

describe("multi-angle v8 transport", () => {
  test("uses only host/8 and declared Catalog API ids", async () => {
    const [application, sdkClient, manifest, metadata, workspace, publication] = await Promise.all([
      readFile(path.join(packageRoot, "assets", "app.js"), "utf8"),
      readFile(path.join(packageRoot, "assets", "plugin-host-client.js"), "utf8"),
      readFile(path.join(packageRoot, "manifest.json"), "utf8").then(JSON.parse),
      readFile(path.join(packageRoot, "..", "convax-package.json"), "utf8").then(JSON.parse),
      readFile(path.join(packageRoot, "..", "package.json"), "utf8").then(JSON.parse),
      readFile(path.join(repositoryRoot, "registry/host-capability-policy.json"), "utf8").then(JSON.parse),
    ])

    expect([manifest.version, metadata.version, workspace.version]).toEqual([
      "0.1.3",
      "0.1.3",
      "0.1.3",
    ])
    expect(metadata).not.toHaveProperty("publication")
    expect(publication.requests.flatMap((request) => request.affected)
      .find((item) => item.id === "multi-angle")).toMatchObject({
      blocker: { code: "host-capability-review-required" },
    })
    expect(manifest.capabilities).toContain("canvas.connectedMedia.stream")
    expect(manifest.hostApi.required).toEqual(expect.arrayContaining([
      "canvas.inputs.close",
      "canvas.inputs.list",
      "canvas.inputs.open",
      "canvas.node.state.replace",
      "generation.execute",
      "generation.tools.list",
      "host.context.get",
    ]))
    expect(manifest.contributes.canvas.commands).toEqual([
      {
        id: "multi-angle.generate",
        title: {
          default: "Generate multi-angle grid",
          "zh-CN": "生成多角度宫格图",
        },
        icon: "sparkles",
        target: {
          type: "renderer-message",
          message: "renderer.multi-angle.generate",
        },
      },
      {
        id: "multi-angle.refresh",
        title: {
          default: "Refresh image and models",
          "zh-CN": "刷新参考图与模型",
        },
        icon: "refresh",
        target: {
          type: "renderer-message",
          message: "renderer.multi-angle.refresh",
        },
      },
    ])
    expect(manifest.contributes.canvas.toolbar).toEqual([
      { id: "generate", command: "multi-angle.generate", order: 10 },
      { id: "refresh", command: "multi-angle.refresh", order: 20 },
    ])
    expect(manifest.contributes.canvas.toolbar.every((item) => !("title" in item))).toBe(true)
    expect(application).toContain(
      'import { acceptPluginHostConnection } from "./plugin-host-client.js"',
    )
    expect(sdkClient).toContain("@convax/plugin-sdk/client:createPluginHostClient")
    expect(sdkClient).toContain("convax.plugin-host/8")
    expect(application).toContain("hostClient.callHostApi(method, params")
    expect(application).toContain("hostClient.onCommand(handleHostCommand)")
    expect(application).not.toContain('type: "request"')
    expect(application).not.toContain("postMessage")
    expect(application).not.toContain("new Map")
    expect(application).not.toContain("convax.plugin-capability/3")
    expect(application).toContain('GENERATE_MESSAGE = "renderer.multi-angle.generate"')
    expect(application).toContain('REFRESH_MESSAGE = "renderer.multi-angle.refresh"')
    expect(application).toContain('hostRequest("canvas.inputs.list")')
    expect(application).toContain('hostRequest("canvas.inputs.open", { inputKey: source.id })')
    expect(application).toContain('hostRequest("canvas.inputs.close"')
    expect(application).toContain('hostRequest("canvas.node.state.replace"')
    expect(application).toContain('hostRequest("generation.execute"')
    expect(application).toContain("normalizeImageInputs")
    expect(application).not.toContain('"multi-angle.generate"')
    expect(application).not.toContain('"multi-angle.refresh"')
    expect(application).not.toMatch(
      /convax\.plugin-host\/3|canvas\.connectedImages\.|canvas\.connectedImage\.read|canvas\.node\.updateState|generation\.canvas\.execute/,
    )
  })

  test("accepts only v8 opaque image keys and stream results", () => {
    expect(normalizeImageInputs({
      inputs: [
        { id: "legacy-id", kind: "image", mimeType: "image/png" },
        { inputKey: "pending", kind: "image", mimeType: "image/png", status: "pending" },
        { inputKey: "video", kind: "video", mimeType: "video/mp4" },
        { inputKey: "ready", kind: "image", label: "Reference", mimeType: "IMAGE/PNG" },
      ],
    })).toEqual([
      expect.objectContaining({ id: "pending", readable: false }),
      expect.objectContaining({ id: "ready", mimeType: "image/png", name: "Reference", readable: true }),
    ])
    expect(parseOpenedImageStream({
      probe: { mimeType: "image/webp" },
      sessionId: "session-1",
      url: "convax-connected-media://session-1/token",
    })).toEqual({
      mimeType: "image/webp",
      sessionId: "session-1",
      url: "convax-connected-media://session-1/token",
    })
    expect(() => parseOpenedImageStream({
      dataUrl: "data:image/png;base64,AA==",
      mimeType: "image/png",
    })).toThrow()
  })
})
