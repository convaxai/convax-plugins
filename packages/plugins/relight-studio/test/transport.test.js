import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  normalizeImageInputs,
  parseOpenedImageStream,
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

    expect(manifest.version).toBe("0.1.4")
    expect(metadata).not.toHaveProperty("publication")
    expect(publication.requests.flatMap((request) => request.affected)
      .find((item) => item.id === "relight-studio")).toMatchObject({
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
    expect(application).toContain('hostRequest("canvas.inputs.open", { inputKey: image.id })')
    expect(application).toContain('hostRequest("canvas.inputs.close"')
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
    expect(parseOpenedImageStream({
      probe: { mimeType: "image/png" },
      sessionId: "session-2",
      url: "convax-connected-media://session-2/token",
    })).toEqual({
      mimeType: "image/png",
      sessionId: "session-2",
      url: "convax-connected-media://session-2/token",
    })
    expect(() => parseOpenedImageStream({
      dataUrl: "data:image/png;base64,AA==",
      mimeType: "image/png",
    })).toThrow()
  })
})
