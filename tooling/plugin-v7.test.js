import { describe, expect, test } from "bun:test"

import { parsePluginManifest, parseSourceMetadata } from "./lib.mjs"

function timelineManifest() {
  return {
    schema: "convax.plugin/7",
    id: "timeline-test",
    name: "Timeline Test",
    description: "Exercises the v7 connected-media and own-node materialization boundary.",
    version: "0.1.0",
    entry: "index.html",
    capabilities: ["canvas.connectedInputs.read", "canvas.connectedMedia.stream"],
    contributes: {
      canvas: {
        renderer: { create: true },
        selectionActions: [
          {
            id: "create-timeline",
            title: { default: "Create Timeline" },
            description: { default: "Create an editable Timeline and keep the source." },
            target: "video",
            action: { type: "materialize-own-plugin-node", connect: "selection-to-created" },
          },
        ],
      },
    },
  }
}

describe("convax.plugin/7 capability host contract", () => {
  test("admits fixed own-node materialization and direct connected-media streaming", () => {
    const parsed = parsePluginManifest(timelineManifest())
    expect(parsed.schema).toBe("convax.plugin/7")
    expect(parsed.contributes.canvas.selectionActions[0].action).toEqual({
      connect: "selection-to-created",
      type: "materialize-own-plugin-node",
    })
    expect(parsed.capabilities).toContain("canvas.connectedMedia.stream")
    expect(
      parseSourceMetadata({
        schema: "convax.package/1",
        kind: "plugin",
        id: "timeline-test",
        name: "Timeline Test",
        description: "Exercises the v7 contract.",
        version: "0.1.0",
        license: "MIT",
        compatibility: { pluginSchema: "convax.plugin/7", pluginHost: "convax.plugin-capability/2" },
        yanked: false,
      }).compatibility,
    ).toEqual({ pluginSchema: "convax.plugin/7", pluginHost: "convax.plugin-capability/2" })
  })

  test("binds one immediate adjacent image action to a declared reference-image operation", () => {
    const cutout = {
      contributes: {
        canvas: {
          selectionActions: [{
            description: { default: "Create a transparent PNG beside the selected image." },
            editor: "immediate",
            id: "remove-background",
            presentation: "cutout-scan",
            steps: [{ tool: "background.remove" }],
            target: "image",
            title: { default: "Remove background" },
          }],
        },
        generation: {
          models: [],
          tools: [{
            acceptedInputs: ["reference_image"],
            description: "Remove the image background.",
            id: "background.remove",
            output: "image",
            title: "Remove background",
          }],
        },
      },
      description: "Cutout",
      id: "cutout-studio",
      name: "Cutout Studio",
      runtime: { command: "convax-cutout-mcp", type: "mcp-stdio" },
      schema: "convax.plugin/7",
      version: "1.0.0",
    }
    expect(parsePluginManifest(cutout).contributes.canvas.selectionActions[0]).toMatchObject({
      editor: "immediate",
      presentation: "cutout-scan",
      steps: [{ tool: "background.remove" }],
      target: "image",
    })

    const wrongTarget = structuredClone(cutout)
    wrongTarget.contributes.canvas.selectionActions[0].target = "video"
    expect(() => parsePluginManifest(wrongTarget)).toThrow("immediate editor target must be image")

    const unknownTool = structuredClone(cutout)
    unknownTool.contributes.canvas.selectionActions[0].steps[0].tool = "background.unknown"
    expect(() => parsePluginManifest(unknownTool)).toThrow("references unknown generation tool")

    const unsupportedPresentation = structuredClone(cutout)
    unsupportedPresentation.contributes.canvas.selectionActions[0].presentation = "spinner"
    expect(() => parsePluginManifest(unsupportedPresentation)).toThrow("cutout-scan presentation")

    expect(() => parsePluginManifest({ ...cutout, schema: "convax.plugin/6" })).toThrow("presentation")
  })

  test("does not backport v7 grants or let a contribution name another Plugin", () => {
    expect(() => parsePluginManifest({ ...timelineManifest(), schema: "convax.plugin/6" })).toThrow("capability")
    const arbitraryTarget = timelineManifest()
    arbitraryTarget.contributes.canvas.selectionActions[0].action.pluginId = "another-plugin"
    expect(() => parsePluginManifest(arbitraryTarget)).toThrow("unsupported field pluginId")
    const headlessStream = timelineManifest()
    delete headlessStream.entry
    delete headlessStream.contributes.canvas.renderer
    expect(() => parsePluginManifest(headlessStream)).toThrow("renderer")
    expect(() =>
      parseSourceMetadata({
        schema: "convax.package/1",
        kind: "plugin",
        id: "timeline-test",
        name: "Timeline Test",
        description: "Exercises the v7 contract.",
        version: "0.1.0",
        license: "MIT",
        compatibility: { pluginSchema: "convax.plugin/7", pluginHost: "convax.plugin-capability/1" },
        yanked: false,
      }),
    ).toThrow("convax.plugin-capability/2")
  })

  test("retains the v6 bounded return-selection contract without widening v4 or v5", () => {
    const parsed = parsePluginManifest({
      capabilities: ["generation.execute"],
      contributes: {
        canvas: {
          renderer: { create: true },
          selectionActions: [{
            description: { default: "Import one selected image." },
            editor: "confirmation",
            id: "import-image",
            steps: [{ tool: "media.import-selected" }],
            target: "image",
            title: { default: "Import image" },
          }],
        },
        generation: {
          models: [],
          tools: [{
            acceptedInputs: ["reference_image"],
            delivery: "return",
            description: "Import one staged image.",
            id: "media.import-selected",
            output: "text",
            title: "Import image",
          }],
        },
      },
      description: "Exercises the inherited bounded return-selection contract.",
      entry: "index.html",
      id: "return-selection",
      name: "Return Selection",
      runtime: { command: "return-selection-mcp", type: "mcp-stdio" },
      schema: "convax.plugin/7",
      version: "1.0.0",
    })

    expect(parsed.contributes.canvas.selectionActions[0]).toMatchObject({
      editor: "confirmation",
      target: "image",
    })
  })
})
