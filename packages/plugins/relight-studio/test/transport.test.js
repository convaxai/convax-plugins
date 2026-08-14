import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  normalizeImageInputs,
  parseOpenedImageSession,
  withOpenedImageSession,
} from "../package/assets/image-inputs.js"

const packageRoot = path.join(import.meta.dir, "..", "package")
const repositoryRoot = path.resolve(import.meta.dir, "../../../..")

describe("relight-studio v8 transport", () => {
  test("uses input streams and Catalog API ids without legacy RPC", async () => {
    const [application, sdkClient, manifest, metadata, publication] = await Promise.all([
      readFile(path.join(packageRoot, "assets", "app.js"), "utf8"),
      readFile(path.join(packageRoot, "assets", "plugin-host-client.js"), "utf8"),
      readFile(path.join(packageRoot, "manifest.json"), "utf8").then(JSON.parse),
      readFile(path.join(packageRoot, "..", "convax-package.json"), "utf8").then(JSON.parse),
      readFile(path.join(repositoryRoot, "registry/host-capability-policy.json"), "utf8").then(JSON.parse),
    ])

    expect(manifest.version).toBe("0.2.3")
    expect(metadata).not.toHaveProperty("publication")
    expect(publication.requirements
      .filter((requirement) => requirement.affected.some((item) => item.id === "relight-studio"))
      .map((requirement) => requirement.id)).toEqual([
      "web-plugin-generation-input-binding",
      "web-plugin-image-input-read",
    ])
    expect(publication.blockers.flatMap((blocker) => blocker.affected)
      .find((item) => item.id === "relight-studio")).toBeUndefined()
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
    expect(application).toContain('hostRequest("canvas.inputs.list")')
    expect(application).toContain('"canvas.inputs.image.open"')
    expect(application).toContain('"canvas.inputs.image.close"')
    expect(application).toContain("sourceLoadController?.abort")
    expect(application).toContain('hostRequest("canvas.node.state.replace"')
    expect(application).toContain('"generation.execute"')
    expect(application).toContain("normalizeImageInputs")
    expect(application).not.toMatch(
      /convax\.plugin-host\/3|canvas\.connectedImages\.|canvas\.connectedImage\.read|canvas\.node\.updateState|generation\.canvas\.execute/,
    )
  })

  test("accepts only v8 opaque image keys and stream results", () => {
    expect(normalizeImageInputs({
      inputs: [
        { id: "legacy-id", kind: "image", mimeType: "image/png" },
        { inputKey: "failed", kind: "image", mimeType: "image/png", status: "error" },
        { inputKey: "audio", kind: "audio", mimeType: "audio/mpeg" },
        { inputKey: "ready", kind: "image", name: "Portrait", mimeType: "IMAGE/JPEG" },
      ],
    })).toEqual([
      expect.objectContaining({ id: "failed", readable: false }),
      expect.objectContaining({ id: "ready", mimeType: "image/jpeg", name: "Portrait", readable: true }),
    ])
    expect(parseOpenedImageSession({
      probe: { kind: "image", mimeType: "image/png" },
      sessionId: "session-2",
      url: "convax-connected-media://session-2/token",
    })).toEqual({
      probe: { kind: "image", mimeType: "image/png" },
      sessionId: "session-2",
      url: "convax-connected-media://session-2/token",
    })
    expect(() => parseOpenedImageSession({
      dataUrl: "data:image/png;base64,AA==",
      mimeType: "image/png",
    })).toThrow()
  })

  test("closes every acquired image session exactly once on success, failure, and cancellation", async () => {
    const opened = {
      probe: { kind: "image", mimeType: "image/png" },
      sessionId: "relight-session",
      url: "convax-connected-media://relight-session/token",
    }
    for (const outcome of ["success", "failure", "cancel"]) {
      const controller = new AbortController()
      const closes = []
      const result = withOpenedImageSession({
        close: async (sessionId) => { closes.push(sessionId) },
        inputKey: "opaque-relight-input",
        open: async () => opened,
        signal: controller.signal,
        use: async () => {
          if (outcome === "failure") throw new Error("decode failed")
          if (outcome === "cancel") {
            controller.abort(new Error("stale relight"))
            throw controller.signal.reason
          }
          return "ready"
        },
      })
      if (outcome === "success") await expect(result).resolves.toBe("ready")
      else await expect(result).rejects.toThrow(outcome === "failure" ? "decode failed" : "stale relight")
      expect(closes).toEqual(["relight-session"])
    }
  })

  test("does not claim an exact close when the SDK rejects an open result before returning it", async () => {
    const closes = []
    await expect(withOpenedImageSession({
      close: async (sessionId) => { closes.push(sessionId) },
      inputKey: "opaque-relight-input",
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
