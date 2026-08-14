import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  MAX_PREVIEW_EDGE,
  MAX_PREVIEW_PIXELS,
  computePreviewBackingSize,
  normalizeImageInputs,
  parseOpenedImageSession,
  withOpenedImageSession,
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
      "0.2.3",
      "0.2.3",
      "0.2.3",
    ])
    expect(metadata).not.toHaveProperty("publication")
    expect(publication.requirements
      .filter((requirement) => requirement.affected.some((item) => item.id === "multi-angle"))
      .map((requirement) => requirement.id)).toEqual([
      "web-plugin-generation-input-binding",
      "web-plugin-image-input-read",
    ])
    expect(publication.blockers.flatMap((blocker) => blocker.affected)
      .find((item) => item.id === "multi-angle")).toBeUndefined()
    expect(manifest.capabilities).toContain("canvas.connectedImages.read")
    expect(manifest.capabilities).not.toContain("canvas.connectedMedia.stream")
    expect(manifest.hostApi.major).toBe(3)
    expect(manifest.hostApi.required).toEqual(expect.arrayContaining([
      "canvas.inputs.image.close",
      "canvas.inputs.image.open",
      "canvas.inputs.list",
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
    expect(application).toContain('"canvas.inputs.image.open"')
    expect(application).toContain('"canvas.inputs.image.close"')
    expect(application).toContain('hostRequest("canvas.node.state.replace"')
    expect(application).toContain('hostRequest("generation.execute"')
    expect(application).toContain("normalizeImageInputs")
    expect(application).toContain("decodeImageSessionPreview")
    expect(application).toContain("sourceLoadController?.abort")
    expect(application).not.toContain("sourcePreviewUrl")
    expect(application).not.toContain("sourceSessionId")
    expect(application).not.toContain("createImageBitmap")
    expect(application).not.toContain("ImageBitmap")
    expect(application).not.toMatch(/\bfetch\s*\(/u)
    expect(application).not.toContain("URL.createObjectURL")
    expect(application).not.toContain("data:image")
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
    expect(parseOpenedImageSession({
      probe: {
        contentRevision: "a".repeat(64),
        height: 1024,
        kind: "image",
        mimeType: "image/webp",
        size: 4096,
        width: 2048,
      },
      sessionId: "session-1",
      url: "convax-connected-media://session-1/token",
    })).toEqual({
      probe: {
        contentRevision: "a".repeat(64),
        height: 1024,
        kind: "image",
        mimeType: "image/webp",
        size: 4096,
        width: 2048,
      },
      sessionId: "session-1",
      url: "convax-connected-media://session-1/token",
    })
    expect(() => parseOpenedImageSession({
      dataUrl: "data:image/png;base64,AA==",
      mimeType: "image/png",
    })).toThrow()
  })

  test("bounds a no-upscale DPR-capped Canvas2D preview", () => {
    const preview = computePreviewBackingSize({
      pixelRatio: 8,
      sourceHeight: 4000,
      sourceWidth: 6000,
      viewportHeight: 720,
      viewportWidth: 1080,
    })
    expect(preview.pixelRatio).toBe(2)
    expect(preview.width).toBeLessThanOrEqual(6000)
    expect(preview.height).toBeLessThanOrEqual(4000)
    expect(preview.width).toBeLessThanOrEqual(MAX_PREVIEW_EDGE)
    expect(preview.height).toBeLessThanOrEqual(MAX_PREVIEW_EDGE)
    expect(preview.width * preview.height).toBeLessThanOrEqual(MAX_PREVIEW_PIXELS)
    expect(computePreviewBackingSize({
      pixelRatio: 2,
      sourceHeight: 64,
      sourceWidth: 64,
      viewportHeight: 1000,
      viewportWidth: 1000,
    })).toMatchObject({ height: 64, width: 64 })
  })

  test("closes each acquired bearer session exactly once on success, failure, and cancellation", async () => {
    const opened = {
      probe: {
        contentRevision: "b".repeat(64),
        height: 512,
        kind: "image",
        mimeType: "image/png",
        size: 2048,
        width: 1024,
      },
      sessionId: "session-exact",
      url: "convax-connected-media://session-exact/token",
    }

    for (const outcome of ["success", "failure", "cancel"]) {
      const controller = new AbortController()
      const closed = []
      const result = withOpenedImageSession({
        close: async (sessionId) => { closed.push(sessionId) },
        inputKey: "opaque-input",
        open: async () => opened,
        signal: controller.signal,
        use: async () => {
          if (outcome === "failure") throw new Error("decode failed")
          if (outcome === "cancel") {
            controller.abort(new Error("stale input"))
            throw controller.signal.reason
          }
          return "preview-ready"
        },
      })
      if (outcome === "success") await expect(result).resolves.toBe("preview-ready")
      else await expect(result).rejects.toThrow(outcome === "failure" ? "decode failed" : "stale input")
      expect(closed).toEqual(["session-exact"])
    }
  })

  test("does not claim an exact close when the SDK rejects an open result before returning it", async () => {
    const closed = []
    await expect(withOpenedImageSession({
      close: async (sessionId) => { closed.push(sessionId) },
      inputKey: "opaque-input",
      open: async () => {
        throw new Error("Plugin Host returned an invalid result")
      },
      use: async () => {
        throw new Error("must not decode")
      },
    })).rejects.toThrow("Plugin Host returned an invalid result")
    expect(closed).toEqual([])
  })
})
