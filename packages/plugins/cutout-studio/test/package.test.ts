import { describe, expect, test } from "bun:test"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const root = path.join(import.meta.dir, "..")

describe("Cutout Studio package", () => {
  test("declares one headless local operation and one immediate adjacent-image action", async () => {
    const manifest = JSON.parse(await readFile(path.join(root, "package", "manifest.json"), "utf8"))
    expect(manifest).toMatchObject({
      schema: "convax.plugin/7",
      id: "cutout-studio",
      version: "0.2.0",
      runtime: { type: "mcp-stdio", command: "convax-cutout-mcp" },
      contributes: {
        generation: {
          models: [],
          tools: [{
            id: "background.remove",
            output: "image",
            acceptedInputs: ["reference_image"],
          }],
        },
      },
    })
    expect(manifest).not.toHaveProperty("entry")
    expect(manifest).not.toHaveProperty("capabilities")
    expect(manifest.contributes.canvas).toEqual({
      selectionActions: [
        {
          id: "remove-background",
          title: {
            default: "Remove background",
            "zh-CN": "抠图",
          },
          description: {
            default: "Create a new transparent PNG beside the selected image.",
            "zh-CN": "保留原图，并在旁边创建新的透明 PNG 图片节点。",
          },
          target: "image",
          editor: "immediate",
          presentation: "cutout-scan",
          steps: [{ tool: "background.remove" }],
        },
      ],
    })
  })

  test("keeps executable and Web-surface bytes outside the inert Plugin ZIP", async () => {
    const packageFiles = (await readdir(path.join(root, "package"), {
      recursive: true,
      withFileTypes: true,
    }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort()
    expect(packageFiles).toEqual([
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
      "manifest.json",
    ])
    const manifest = await readFile(path.join(root, "package", "manifest.json"), "utf8")
    expect(manifest).not.toContain("https://")
    expect(manifest).not.toContain("convax.plugin-host")
  })
})
