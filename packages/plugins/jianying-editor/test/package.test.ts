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
      id: "jianying-editor",
      schema: "convax.plugin/6",
      version: "2.1.1",
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
      { name: "jianying-editor", path: "skills/jianying-editor" },
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

    expect(metadata.version).toBe("2.1.1")
    expect(workspace.version).toBe("2.1.1")
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
    const readme = await read("README.md")

    expect(html).toContain('src="assets/app.js"')
    expect(html).not.toMatch(/(?:src|href)=["'](?:https?:|\/\/|\/)/u)
    expect(application).toContain('PROTOCOL = "convax.plugin-capability/1"')
    expect(application).toContain('PLUGIN_ID = "jianying-editor"')
    expect(application).toContain('request("canvas.connectedInputs.list")')
    expect(application).toContain('request("generation.canvas.execute"')
    expect(application).toContain('resultMode: "return"')
    expect(application).not.toMatch(/\bfetch\s*\(/u)
    expect(application).not.toContain("XMLHttpRequest")
    expect(application).not.toContain("localStorage")
    expect(() => new Function(application)).not.toThrow()
    expect(readme).toContain("不会随")
    expect(readme).toContain("主动安装")
    expect(readme).toContain("不包含 Canvas、Project、IPC")
  })
})
