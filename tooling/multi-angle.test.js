import { describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import path from "node:path"

import {
  createDefaultState,
  createGenerationRequest,
  createMultiAngleGridPrompt,
  executeGridGeneration,
  hydratePluginState,
  normalizeGenerationResult,
  normalizeGenerationTools,
} from "../packages/plugins/multi-angle/package/assets/multi-angle-model.js"
import { discoverPackages, root } from "./lib.mjs"

const sourceRoot = path.join(root, "packages", "plugins", "multi-angle")
const packageRoot = path.join(sourceRoot, "package")

async function read(relativePath) {
  return fs.readFile(path.join(packageRoot, ...relativePath.split("/")), "utf8")
}

async function relativeFiles(directory, prefix = "") {
  const files = []
  for (const entry of await fs.readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...await relativeFiles(directory, relativePath))
    else files.push(relativePath)
  }
  return files.sort()
}

describe("multi-angle Plugin package", () => {
  test("is a provider-neutral v8 Web Plugin blocked on an approved image-input contract", async () => {
    const [plugin] = await discoverPackages({ kind: "plugin", id: "multi-angle" })
    const metadata = plugin.metadata
    const manifest = JSON.parse(await read("manifest.json"))
    expect(metadata).toMatchObject({
      schema: "convax.package/2",
      kind: "plugin",
      id: "multi-angle",
      version: "0.2.2",
      publication: {
        status: "blocked",
        blockers: expect.arrayContaining([
          {
            code: "host-capability-review-required",
            note: expect.stringContaining(
              "docs/host-capability-requests/web-plugin-image-input-read.md",
            ),
          },
          {
            code: "host-capability-review-required",
            note: expect.stringContaining(
              "docs/host-capability-requests/web-plugin-generation-input-binding.md",
            ),
          },
        ]),
      },
    })
    expect(manifest).toMatchObject({
      capabilities: [
        "canvas.connectedInputs.read",
        "canvas.connectedImages.read",
        "canvas.node.write",
        "generation.execute",
      ],
      contributes: { canvas: { renderer: { create: true, height: 720, width: 1080 } } },
      entry: "index.html",
      hostApi: {
        major: 3,
        required: [
          "canvas.inputs.image.close",
          "canvas.inputs.image.open",
          "canvas.inputs.list",
          "canvas.node.state.replace",
          "generation.execute",
          "generation.tools.list",
          "host.context.get",
        ],
        optional: [],
      },
      id: "multi-angle",
      schema: "convax.plugin/8",
      version: "0.2.2",
    })
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
    expect(metadata).not.toHaveProperty("compatibility")
    expect(manifest).not.toHaveProperty("runtime")
    expect(manifest.contributes).not.toHaveProperty("generation")
    expect(manifest).not.toHaveProperty("skill")
    expect(metadata).not.toHaveProperty("companions")
    expect(await relativeFiles(packageRoot)).toEqual([
      "LICENSE",
      "assets/app.js",
      "assets/image-inputs.js",
      "assets/multi-angle-model.js",
      "assets/plugin-host-client.js",
      "assets/styles.css",
      "index.html",
      "manifest.json",
    ])

    const entry = await read("index.html")
    const app = await read("assets/app.js")
    const sdkClient = await read("assets/plugin-host-client.js")
    const model = await read("assets/multi-angle-model.js")
    const styles = await read("assets/styles.css")
    const runtime = `${app}\n${model}`
    expect(entry.match(/<script\b/gu)).toHaveLength(1)
    expect(entry).toContain('src="./assets/app.js"')
    expect(entry).toContain('href="./assets/styles.css"')
    expect(entry).not.toMatch(/(?:src|href)=["'](?:https?:|\/\/|\/)/u)
    expect(styles).not.toContain("@import")
    expect(styles).not.toContain("url(")
    expect(app).toContain(
      'import { acceptPluginHostConnection } from "./plugin-host-client.js"',
    )
    expect(sdkClient).toContain("@convax/plugin-sdk/client:createPluginHostClient")
    expect(sdkClient).toContain("convax.plugin-host/8")
    expect(app).toContain('hostRequest("generation.tools.list", { output: "image" })')
    expect(app.match(/hostRequest\("generation\.execute", request, null\)/gu)).toHaveLength(1)
    expect(app).toContain("stateWritesSuspended = true")
    expect(app.indexOf("stateWritesSuspended = true")).toBeLessThan(app.indexOf('hostRequest("generation.execute"'))
    expect(runtime).not.toContain("agent.prompt")
    expect(runtime).not.toContain("CONVAX_MULTI_ANGLE_RESULT")
    expect(runtime).not.toContain("canvas_add_resources")
    expect(runtime).not.toContain("baselineNodeIds")
    expect(runtime).not.toContain("executeAngleSequence")
    expect(runtime).not.toContain("activePresetId")
    expect(runtime).not.toContain("partial")
    expect(runtime).not.toContain("顺序发起")
    expect(runtime).not.toContain("localStorage")
    expect(runtime).not.toContain("sessionStorage")
    expect(runtime).not.toContain("indexedDB")
    expect(runtime).not.toContain("XMLHttpRequest")
    expect(runtime).not.toContain("WebSocket")
    expect(runtime).not.toMatch(/\bfetch\s*\(/u)
    expect(runtime).not.toMatch(/https?:\/\//u)
  })

  test("discovers only reference-image AI models and never guesses from provider titles", () => {
    const tools = normalizeGenerationTools({
      tools: [
        {
          acceptedInputs: ["reference_image"],
          description: "AI image model",
          id: "provider/image.model",
          kind: "model",
          output: "image",
          title: "Provider · Image Model",
        },
        {
          acceptedInputs: ["reference_image"],
          description: "FFmpeg operation",
          id: "ffmpeg-tools/run.image",
          kind: "operation",
          output: "image",
          title: "Run image operation",
        },
        {
          acceptedInputs: ["text"],
          description: "Text-to-image only",
          id: "provider/text-image",
          kind: "model",
          output: "image",
          title: "Provider · Text Image",
        },
        {
          acceptedInputs: ["reference_image"],
          description: "Missing model metadata",
          id: "provider/unknown",
          output: "image",
          title: "Looks like a model but is not classified",
        },
      ],
    })
    expect(tools.map((tool) => tool.id)).toEqual(["provider/image.model"])
    expect(tools[0]).toMatchObject({ kind: "model", output: "image", title: "Provider · Image Model" })
  })

  test("builds one multi-angle grid prompt and one exact direct-incoming generation request", () => {
    const presetIds = ["front", "left", "top", "cinematic"]
    const prompt = createMultiAngleGridPrompt({
      notes: "keep the red coat and soft side light",
      presetIds,
      subjectType: "character",
    })
    expect(prompt).toContain("标准白底角色设定图")
    expect(prompt).toContain("最终只输出一张图片")
    expect(prompt).toContain("2 行 × 2 列的4宫格")
    expect(prompt).toContain("eye-level front view")
    expect(prompt).toContain("true left profile view")
    expect(prompt).toContain("high top-down view")
    expect(prompt).toContain("cinematic three-quarter view")
    expect(prompt).toContain("每个格子只展示同一主体的一个视角")
    expect(prompt).toContain("所有格子中的主体必须完全一致")
    expect(prompt).toContain("不要把视角拆成多张图片")
    expect(prompt).not.toContain("Do not create a contact sheet, grid, collage")
    expect(prompt).toContain("keep the red coat and soft side light")
    expect(createGenerationRequest({
      prompt,
      sourceInputKey: "source-1",
      toolId: "provider/image.model",
    })).toEqual({
      output: "image",
      prompt,
      references: [{ inputKey: "source-1", role: "reference_image" }],
      resultMode: "create-pending-node",
      toolId: "provider/image.model",
    })
    expect(() => createMultiAngleGridPrompt({
      notes: "",
      presetIds: ["front"],
      subjectType: "character",
    })).toThrow("镜头方案无效")
  })

  test("executes the whole grid through exactly one generation call", async () => {
    let successCalls = 0
    const complete = await executeGridGeneration({
      execute: async () => {
        successCalls += 1
        return { createdNodeIds: ["node-grid"] }
      },
    })
    expect(successCalls).toBe(1)
    expect(complete).toEqual({
      failure: null,
      result: { createdNodeIds: ["node-grid"] },
    })

    let failureCalls = 0
    const failed = await executeGridGeneration({
      execute: async () => {
        failureCalls += 1
        throw new Error("Canvas generation could not be completed")
      },
    })
    expect(failureCalls).toBe(1)
    expect(failed).toEqual({
      failure: { message: "Canvas generation could not be completed" },
      result: null,
    })
  })

  test("preserves the authoritative grid node ids and migrates only portable legacy planning state", () => {
    const result = normalizeGenerationResult({
      createdNodeIds: ["node-front-a", "node-front-b"],
      operationReceipt: null,
      projection: null,
      toolId: "provider/image.model",
      warnings: ["one warning"],
    }, ["front", "left", "top"], "2026-07-21T00:00:01.000Z")
    expect(result.createdNodeIds).toEqual(["node-front-a", "node-front-b"])
    expect(result.presetIds).toEqual(["front", "left", "top"])
    expect(result).not.toHaveProperty("revision")
    expect(() => normalizeGenerationResult({
      createdNodeIds: ["node-front-a"],
      toolId: "provider/image.model",
      warnings: [],
    }, ["front", "left"], "2026-07-21T00:00:01.000Z")).toThrow("生成结果无效")

    const legacy = hydratePluginState({
      lastRun: { status: "waiting" },
      notes: "keep materials",
      results: [{ nodeId: "old-agent-result", presetId: "front" }],
      schemaVersion: 2,
      selectedPresetIds: ["front", "top", "front"],
      sourceNodeId: "source-1",
      subjectType: "product",
      toolId: "provider/image.model",
    })
    expect(legacy.source).toBe("legacy")
    expect(legacy.state).toMatchObject({
      lastRun: null,
      notes: "keep materials",
      result: null,
      schemaVersion: 5,
      selectedPresetIds: ["front", "top"],
      sourceInputKey: null,
      subjectType: "product",
      toolId: "provider/image.model",
    })

    const api2 = hydratePluginState({
      ...createDefaultState(),
      result: {
        completedAt: "2026-07-21T00:00:01.000Z",
        createdNodeIds: ["node-front-a", "node-front-b"],
        presetIds: ["front", "left", "top"],
        revision: 8,
        toolId: "provider/image.model",
        warnings: ["one warning"],
      },
      schemaVersion: 4,
      sourceInputKey: "source-1",
      toolId: "provider/image.model",
    })
    expect(api2.source).toBe("legacy")
    expect(api2.state).toMatchObject({
      result: {
        createdNodeIds: ["node-front-a", "node-front-b"],
        presetIds: ["front", "left", "top"],
      },
      schemaVersion: 5,
      sourceInputKey: "source-1",
      toolId: "provider/image.model",
    })
    expect(api2.state.result).not.toHaveProperty("revision")

    const interrupted = hydratePluginState({
      ...createDefaultState(),
      lastRun: {
        completedAt: "",
        failure: null,
        presetIds: ["front", "top"],
        sourceInputKey: "source-1",
        startedAt: "2026-07-21T00:00:00.000Z",
        status: "running",
        toolId: "provider/image.model",
      },
      result,
      sourceInputKey: "source-1",
      toolId: "provider/image.model",
    })
    expect(interrupted.source).toBe("current")
    expect(interrupted.state.result.createdNodeIds).toEqual(["node-front-a", "node-front-b"])
    expect(interrupted.state.lastRun).toMatchObject({
      failure: { message: expect.any(String) },
      status: "interrupted",
    })

    const unsupported = hydratePluginState({ schemaVersion: 99, providerSecret: "must remain untouched" })
    expect(unsupported.source).toBe("unsupported")
    expect(unsupported.state).toEqual(createDefaultState())
  })
})
