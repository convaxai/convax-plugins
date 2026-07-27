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
})
