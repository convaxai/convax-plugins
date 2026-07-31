import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

const pluginRoot = path.resolve(import.meta.dir, "..")
const skillRoot = path.resolve(pluginRoot, "..", "..", "skills", "hello-convax-guide")

describe("hello-convax v8 Web Host API", () => {
  test("publishes only the SDK-owned host/8 protocol and declared Catalog method", async () => {
    const [application, sdkClient, manifest, metadata, skillMetadata, skillWorkspace, workspace] = await Promise.all([
      readFile(path.join(pluginRoot, "package/assets/app.js"), "utf8"),
      readFile(path.join(pluginRoot, "package/assets/plugin-host-client.js"), "utf8"),
      readFile(path.join(pluginRoot, "package/manifest.json"), "utf8").then(JSON.parse),
      readFile(path.join(pluginRoot, "convax-package.json"), "utf8").then(JSON.parse),
      readFile(path.join(skillRoot, "convax-package.json"), "utf8").then(JSON.parse),
      readFile(path.join(skillRoot, "package.json"), "utf8").then(JSON.parse),
      readFile(path.join(pluginRoot, "package.json"), "utf8").then(JSON.parse),
    ])

    expect([manifest.version, metadata.version, workspace.version]).toEqual([
      "0.2.0",
      "0.2.0",
      "0.2.0",
    ])
    expect([skillMetadata.version, skillWorkspace.version]).toEqual(["0.3.0", "0.3.0"])
    expect(manifest.hostApi).toEqual({
      major: 2,
      required: ["host.context.get"],
      optional: [],
    })
    expect(application).toContain(
      'import { acceptPluginHostConnection } from "./plugin-host-client.js"',
    )
    expect(sdkClient).toContain("@convax/plugin-sdk/client:createPluginHostClient")
    expect(sdkClient).toContain("convax.plugin-host/8")
    expect(application).toContain('request("host.context.get")')
    expect(application).toContain('REFRESH_CONTEXT_MESSAGE = "renderer.context.refresh"')
    expect(application).toContain("hostClient.onCommand((command) =>")
    expect(application).toContain("command.command === REFRESH_CONTEXT_MESSAGE")
    expect(application).toContain("hostClient.callHostApi(method, params)")
    expect(application).not.toContain('type: "request"')
    expect(application).not.toContain("postMessage")
    expect(application).not.toContain("new Map")
    expect(application).not.toContain("convax.plugin-capability/3")
    expect(application).not.toMatch(/convax\.plugin-host\/[1-7]\b/u)
    expect(application).not.toContain('command.command === "refresh"')
    expect(manifest.contributes.canvas.commands).toEqual([
      {
        icon: "refresh",
        id: "context.refresh",
        target: {
          message: "renderer.context.refresh",
          type: "renderer-message",
        },
        title: {
          default: "Refresh context",
          "zh-CN": "刷新上下文",
        },
      },
    ])
    expect(manifest.contributes.canvas.toolbar).toEqual([
      {
        command: "context.refresh",
        id: "context-refresh-toolbar",
        order: 10,
      },
    ])
    expect(manifest.contributes.canvas.toolbar[0]).not.toHaveProperty("title")
    expect(manifest.contributes.canvas.toolbar[0]).not.toHaveProperty("icon")
    expect(manifest.contributes.canvas.toolbar[0]).not.toHaveProperty("target")
  })
})
