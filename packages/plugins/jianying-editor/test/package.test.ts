import fs from "node:fs/promises"
import path from "node:path"

import { describe, expect, test } from "bun:test"

const packageRoot = path.resolve(import.meta.dir, "..", "package")

async function read(relativePath: string) {
  return fs.readFile(path.join(packageRoot, ...relativePath.split("/")), "utf8")
}

describe("JianYing Plugin package", () => {
  test("declares an explicit-install, return-only, direct-input integration", async () => {
    const manifest = JSON.parse(await read("manifest.json"))
    expect(manifest).toMatchObject({
      capabilities: ["canvas.connectedInputs.read", "generation.execute"],
      id: "jianying-editor",
      schema: "convax.plugin/6",
      version: "2.0.0",
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
    ])
    expect(manifest.contributes.skills).toEqual([
      { name: "jianying-editor", path: "skills/jianying-editor" },
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
