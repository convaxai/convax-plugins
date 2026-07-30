import { describe, expect, test } from "bun:test"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

const packageRoot = path.join(import.meta.dir, "..", "package")

describe("video-timeline package", () => {
  test("declares the v8 self-materialization action and minimum implemented capabilities", async () => {
    const manifest = JSON.parse(await readFile(path.join(packageRoot, "manifest.json"), "utf8"))
    expect(manifest).toMatchObject({
      schema: "convax.plugin/8",
      id: "video-timeline",
      version: "0.1.5",
      contributes: {
        canvas: {
          renderer: { create: true, height: 520, width: 640 },
          selectionActions: [{ action: { type: "materialize-own-plugin-node", connect: "selection-to-created" }, target: "video" }],
        },
      },
    })
    expect(manifest.capabilities).toEqual([
      "canvas.connectedInputs.read",
      "canvas.connectedMedia.stream",
      "canvas.node.read",
      "canvas.node.write",
      "ui.fullscreen",
    ])
    expect(manifest.runtime).toBeUndefined()
    expect(manifest.hooks).toBeUndefined()
    expect(manifest.hostApi).toEqual({
      major: 1,
      required: [
        "canvas.inputs.close",
        "canvas.inputs.list",
        "canvas.inputs.open",
        "canvas.node.get",
        "canvas.node.state.replace",
        "host.context.get",
      ],
      optional: [],
    })
  })

  test("ships a compact Composition card backed by a dedicated fullscreen Timeline tool", async () => {
    const html = await readFile(path.join(packageRoot, "index.html"), "utf8")
    const app = await readFile(path.join(packageRoot, "assets/app.js"), "utf8")
    const styles = await readFile(path.join(packageRoot, "assets/styles.css"), "utf8")
    expect(html).toContain('aria-label="Composition monitor"')
    expect(html).toContain('id="edit-timeline"')
    expect(html).toContain('id="composition-summary"')
    expect(html).toContain('class="card-actions"')
    expect(html).toContain('id="mini-timeline"')
    expect(html).toContain('id="mini-tracks"')
    expect(html).toContain('aria-label="Timeline ruler"')
    expect(html).toContain('id="split-clip"')
    expect(html).toContain('id="zoom-fit"')
    expect(html).toContain('id="zoom-value"')
    const host = await readFile(path.join(packageRoot, "assets/host.js"), "utf8")
    const sdkClient = await readFile(
      path.join(packageRoot, "assets/plugin-host-client.js"),
      "utf8",
    )
    expect(host).toContain(
      'import { acceptPluginHostConnection } from "./plugin-host-client.js"',
    )
    expect(sdkClient).toContain("@convax/plugin-sdk/client:createPluginHostClient")
    expect(sdkClient).toContain("convax.plugin-host/8")
    expect(host).toContain("this.#client.callHostApi(method, params")
    expect(host).toContain("client.onCommand((command) =>")
    expect(host).not.toContain('type: "request"')
    expect(host).not.toContain("postMessage")
    expect(host).not.toContain("new Map")
    expect(app).toContain('host.request("canvas.inputs.open", { inputKey })')
    expect(app).toContain('host.request("canvas.inputs.list"')
    expect(app).toContain('host.request("canvas.inputs.close"')
    expect(app).toContain('host.request("canvas.node.state.replace"')
    expect(`${app}\n${host}`).not.toMatch(/convax\.plugin-capability\/[1-3]|convax\.plugin-host\/[1-7]\b|canvas\.connectedInputs\.|canvas\.connectedMedia\.|canvas\.node\.updateState/)
    expect(app).toContain("setPointerCapture")
    expect(app).toContain('addEventListener("wheel"')
    expect(app).toContain('addEventListener("fullscreenchange"')
    expect(app).toContain("firstPlayableTimelineStart")
    expect(app).toContain("requestPreviewRefresh")
    expect(app).toContain("applyDetectedSourceDuration")
    expect(app).toContain("requestDurationResolution")
    expect(app).toContain("mediaMetadataDuration")
    expect(app).toContain("anchoredScrollLeft")
    expect(app).toContain("visibilitychange")
    expect(styles).toContain("overscroll-behavior: contain")
    expect(styles).toContain('cursor: grabbing')
    expect(styles).toContain("html:not(.is-editor-mode)")
    expect(styles).toContain("html.is-editor-mode")
    expect(styles).toContain(".mini-timeline")
    expect(styles).toContain('content: "TIMELINE · 00:00.00"')
  })

  test("contains no dependency tree, companion, native executable, remote script or lockfile", async () => {
    const entries = await readdir(packageRoot, { recursive: true })
    expect(entries.some((entry) => entry.includes("node_modules"))).toBeFalse()
    expect(entries.some((entry) => /(?:^|\/)(?:bun\.lock|package-lock\.json|yarn\.lock)$/.test(entry))).toBeFalse()
    expect(entries.some((entry) => /\.(?:node|wasm|dylib|so|exe)$/.test(entry))).toBeFalse()
    const html = await readFile(path.join(packageRoot, "index.html"), "utf8")
    expect(html).not.toMatch(/https?:\/\//)
  })
})
