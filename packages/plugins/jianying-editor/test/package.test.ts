import fs from "node:fs/promises"
import path from "node:path"

import { describe, expect, test } from "bun:test"

const packageRoot = path.resolve(import.meta.dir, "..", "package")

async function read(relativePath: string) {
  return fs.readFile(path.join(packageRoot, ...relativePath.split("/")), "utf8")
}

describe("JianYing Plugin package", () => {
  test("declares direct-input Agent tools and ordinary image/video import actions separately", async () => {
    const manifest = JSON.parse(await read("manifest.json"))
    expect(manifest).toMatchObject({
      capabilities: ["canvas.connectedInputs.read", "generation.execute"],
      hostApi: {
        major: 2,
        optional: [],
        required: ["canvas.inputs.list", "generation.execute", "host.context.get"],
      },
      id: "jianying-editor",
      schema: "convax.plugin/8",
      version: "3.0.0",
      runtime: {
        command: "convax-jianying-editor-mcp",
        type: "mcp-stdio",
      },
    })
    expect(manifest.contributes.generation.tools).toEqual([
      expect.objectContaining({ acceptedInputs: [], delivery: "return", id: "draft.status" }),
      expect.objectContaining({
        acceptedInputs: ["reference_image", "reference_video"],
        delivery: "return",
        id: "media.export",
        inputBinding: "direct-incoming",
      }),
      expect.objectContaining({
        acceptedInputs: ["reference_image", "reference_video"],
        delivery: "return",
        id: "media.import-selected",
        output: "text",
      }),
    ])
    expect(manifest.contributes.generation.tools[2]).not.toHaveProperty("inputBinding")
    expect(manifest.contributes.agent.tools).toEqual([
      { id: "get_draft_status", tool: "draft.status" },
      { id: "export_connected_media", tool: "media.export" },
    ])
    expect(manifest.contributes.canvas.selectionActions).toEqual([
      {
        description: {
          default: "Import the selected image into the stable current JianYing draft, or create a new draft safely.",
          "zh-CN": "将所选图片导入稳定的剪映当前草稿，或安全创建新草稿。",
        },
        editor: "confirmation",
        id: "import-image-to-jianying",
        steps: [{ tool: "media.import-selected" }],
        target: "image",
        title: { default: "Import to JianYing", "zh-CN": "导入剪映" },
      },
      {
        description: {
          default: "Import the selected video into the stable current JianYing draft, or create a new draft safely.",
          "zh-CN": "将所选视频导入稳定的剪映当前草稿，或安全创建新草稿。",
        },
        editor: "confirmation",
        id: "import-video-to-jianying",
        steps: [{ tool: "media.import-selected" }],
        target: "video",
        title: { default: "Import to JianYing", "zh-CN": "导入剪映" },
      },
    ])
    expect(manifest.contributes.skills).toEqual([
      {
        name: "jianying-editor",
        path: "skills/jianying-editor",
        uses: {
          pluginTools: ["export_connected_media", "get_draft_status"],
        },
      },
    ])
  })

  test("binds the changed manifest and companion bytes to new immutable versions", async () => {
    const metadata = JSON.parse(await fs.readFile(
      path.resolve(import.meta.dir, "..", "convax-package.json"),
      "utf8",
    ))
    const workspace = JSON.parse(await fs.readFile(
      path.resolve(import.meta.dir, "..", "package.json"),
      "utf8",
    ))

    expect(metadata.version).toBe("3.0.0")
    expect(workspace.version).toBe("3.0.0")
    expect(workspace["convax.hostCapabilityRequests"]).toEqual([
      "web-plugin-generation-input-binding",
    ])
    expect(metadata.companions).toEqual([
      expect.objectContaining({
        command: "convax-jianying-editor-mcp",
        version: "1.1.1",
      }),
    ])
  })

  test("keeps the iframe offline and delegates native work through host capabilities", async () => {
    const html = await read("index.html")
    const application = await read("assets/app.js")
    const sdkClient = await read("assets/plugin-host-client.js")
    const readme = await read("README.md")

    expect(html).toContain('src="assets/app.js"')
    expect(html).toContain('type="module"')
    expect(html).not.toMatch(/(?:src|href)=["'](?:https?:|\/\/|\/)/u)
    expect(application).toContain(
      'import { acceptPluginHostConnection } from "./plugin-host-client.js"',
    )
    expect(sdkClient).toContain("@convax/plugin-sdk/client:createPluginHostClient")
    expect(sdkClient).toContain("convax.plugin-host/8")
    expect(sdkClient).toContain("jianying-editor")
    expect([
      ...new Set([...application.matchAll(/request\("([^"]+)"/gu)].map((match) => match[1])),
    ]).toEqual(["canvas.inputs.list", "generation.execute", "host.context.get"])
    expect(application).toContain('"canvas.inputs.changed"')
    expect(application).toMatch(
      /function receiveCommand\(message\)[\s\S]+?message\.command === INPUTS_CHANGED_COMMAND[\s\S]+?void loadInputs\(\)/u,
    )
    expect(application).toContain("hostClient.onCommand(receiveCommand)")
    expect(application).toContain("hostClient.callHostApi(method, params)")
    expect(application).toContain("value.inputKey")
    expect(application).toContain("inputKey: input.inputKey")
    expect(application).not.toContain("nodeId: input.inputKey")
    expect(application).not.toContain('type: "request"')
    expect(application).not.toContain("postMessage")
    expect(application).not.toContain("new Map")
    for (const legacyWireValue of [
      "convax.plugin-capability/1",
      "convax.plugin-capability/3",
      "canvas.connectedInputs.changed",
      "canvas.connectedInputs.list",
      "generation.canvas.execute",
    ]) {
      expect(application).not.toContain(legacyWireValue)
    }
    expect(application).toContain('resultMode: "return"')
    expect(application).not.toMatch(/\bfetch\s*\(/u)
    expect(application).not.toContain("XMLHttpRequest")
    expect(application).not.toContain("localStorage")
    expect(readme).toContain("不会随")
    expect(readme).toContain("主动安装")
    expect(readme).toContain("不包含 Canvas、Project、IPC")
  })
})
