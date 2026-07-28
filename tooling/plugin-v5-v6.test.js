import { describe, expect, test } from "bun:test"

import { parsePluginManifest, parseRegistry, parseSourceMetadata } from "./lib.mjs"

function v5Manifest(overrides = {}) {
  return {
    schema: "convax.plugin/5",
    id: "canvas-automation",
    name: "Canvas Automation",
    description: "Automates Project Canvases through host capabilities.",
    version: "1.0.0",
    capabilities: ["projects.read", "canvas.document.read"],
    contributes: {
      skills: [{ name: "canvas-automation", path: "skills/canvas-automation" }],
    },
    ...overrides,
  }
}

function v6Manifest(mcp = { type: "remote", url: "https://editor.example.com/mcp" }, overrides = {}) {
  return {
    schema: "convax.plugin/6",
    id: "remote-editor",
    name: "Remote Editor",
    description: "Exposes a standards-based remote MCP server.",
    version: "1.0.0",
    capabilities: [],
    contributes: { agent: { mcp } },
    ...overrides,
  }
}

function pluginMetadata(schema) {
  return {
    schema: "convax.package/1",
    kind: "plugin",
    id: "example-tools",
    name: "Example Tools",
    description: "Example capability Plugin.",
    version: "1.0.0",
    license: "MIT",
    compatibility: { pluginSchema: schema, pluginHost: "convax.plugin-capability/1" },
    yanked: false,
  }
}

describe("convax.plugin/5 capability host contract", () => {
  test("accepts Project and Canvas grants as headless capabilities with owned Skills", () => {
    const parsed = parsePluginManifest(v5Manifest())

    expect(parsed.schema).toBe("convax.plugin/5")
    expect(parsed.capabilities).toEqual(["projects.read", "canvas.document.read"])
    expect(parsed.contributes.skills).toEqual([
      { name: "canvas-automation", path: "skills/canvas-automation" },
    ])
    expect(parsed).not.toHaveProperty("entry")
    expect(parsed).not.toHaveProperty("runtime")
  })

  test("accepts v5 LLM display metadata only with an external runtime", () => {
    const parsed = parsePluginManifest(v5Manifest({
      capabilities: [],
      contributes: {
        llm: {
          models: [{ id: "main-model", name: "Main Model" }],
          provider: { id: "example-provider", name: "Example Provider" },
        },
      },
      runtime: { type: "mcp-stdio", command: "example-provider-mcp" },
    }))

    expect(parsed.contributes.llm).toEqual({
      models: [{ id: "main-model", name: "Main Model" }],
      provider: { id: "example-provider", name: "Example Provider" },
    })

    const withoutRuntime = v5Manifest({
      capabilities: [],
      contributes: parsed.contributes,
    })
    expect(() => parsePluginManifest(withoutRuntime)).toThrow("runtime and executable contribution")
  })

  test("pairs v5 with capability protocol v1 and rejects numbered or legacy hosts", () => {
    expect(parseSourceMetadata(pluginMetadata("convax.plugin/5")).compatibility).toEqual({
      pluginSchema: "convax.plugin/5",
      pluginHost: "convax.plugin-capability/1",
    })
    for (const pluginHost of ["convax.plugin-host/4", "convax.plugin-host/5"]) {
      expect(() => parseSourceMetadata({
        ...pluginMetadata("convax.plugin/5"),
        compatibility: { pluginSchema: "convax.plugin/5", pluginHost },
      })).toThrow("convax.plugin-capability/1")
    }
  })

  test("does not backport remote MCP declarations into v5", () => {
    expect(() => parsePluginManifest(v5Manifest({
      contributes: {
        agent: {
          mcp: { type: "remote", url: "https://editor.example.com/mcp" },
        },
      },
    }))).toThrow("unsupported field mcp")
    expect(() => parsePluginManifest(v5Manifest({
      capabilities: ["canvas.connectedInputs.read"],
    }))).toThrow("invalid or duplicate capability")
  })

  test("does not backport v6 image return-selection actions", () => {
    const imageAction = v5Manifest({
      capabilities: [],
      contributes: {
        canvas: {
          renderer: { create: true },
          selectionActions: [{
            description: { default: "Import one image." },
            editor: "confirmation",
            id: "import-image",
            steps: [{ tool: "image.import" }],
            target: "image",
            title: { default: "Import image" },
          }],
        },
        generation: {
          models: [],
          tools: [{
            acceptedInputs: ["reference_image"],
            description: "Import one selected image.",
            id: "image.import",
            output: "image",
            title: "Import image",
          }],
        },
      },
      entry: "index.html",
      runtime: { command: "image-import-mcp", type: "mcp-stdio" },
    })

    expect(() => parsePluginManifest(imageAction)).toThrow("target must be video")
  })
})

describe("convax.plugin/6 remote Agent MCP contract", () => {
  test("treats agent.mcp as a real headless capability and defaults OAuth to auto", () => {
    const parsed = parsePluginManifest(v6Manifest())

    expect(parsed).toMatchObject({
      schema: "convax.plugin/6",
      contributes: {
        agent: {
          mcp: {
            oauth: "auto",
            type: "remote",
            url: "https://editor.example.com/mcp",
          },
        },
      },
    })
    expect(parsed).not.toHaveProperty("entry")
    expect(parsed).not.toHaveProperty("runtime")
  })

  test("inherits owned Skills and capability-host compatibility", () => {
    const parsed = parsePluginManifest(v6Manifest(undefined, {
      contributes: {
        agent: { mcp: { oauth: "none", type: "remote", url: "https://editor.example.com/mcp" } },
        skills: [{ name: "remote-editor", path: "skills/remote-editor" }],
      },
    }))
    expect(parsed.contributes.skills).toEqual([{ name: "remote-editor", path: "skills/remote-editor" }])
    expect(parsed.contributes.agent.mcp.oauth).toBe("none")
    expect(parseSourceMetadata(pluginMetadata("convax.plugin/6")).compatibility.pluginHost)
      .toBe("convax.plugin-capability/1")
  })

  test("accepts at most 16 literal non-credential headers", () => {
    const headers = Object.fromEntries(
      Array.from({ length: 16 }, (_, index) => [`X-Convax-${index}`, `literal-${index}`]),
    )
    expect(parsePluginManifest(v6Manifest({
      headers,
      oauth: "none",
      type: "remote",
      url: "https://editor.example.com/mcp?tenant=public",
    })).contributes.agent.mcp).toEqual({
      headers,
      oauth: "none",
      type: "remote",
      url: "https://editor.example.com/mcp?tenant=public",
    })

    const tooMany = { ...headers, "X-Convax-16": "literal-16" }
    expect(() => parsePluginManifest(v6Manifest({
      headers: tooMany,
      type: "remote",
      url: "https://editor.example.com/mcp",
    }))).toThrow("at most 16")

    for (const name of ["Authorization", "cookie", "PROXY-AUTHORIZATION"]) {
      expect(() => parsePluginManifest(v6Manifest({
        headers: { [name]: "secret" },
        type: "remote",
        url: "https://editor.example.com/mcp",
      }))).toThrow("not allowed")
    }
    for (const value of ["{env:TOKEN}", "{file:/tmp/token}", "${TOKEN}"]) {
      expect(() => parsePluginManifest(v6Manifest({
        headers: { "X-Token": value },
        type: "remote",
        url: "https://editor.example.com/mcp",
      }))).toThrow("literal value")
    }
  })

  test("rejects non-HTTPS, credentialed, fragmented, and malformed remote endpoints", () => {
    for (const url of [
      "http://editor.example.com/mcp",
      "/mcp",
      "https://user:secret@editor.example.com/mcp",
      "https://editor.example.com/mcp#tools",
    ]) {
      expect(() => parsePluginManifest(v6Manifest({ type: "remote", url })))
        .toThrow("absolute HTTPS URL")
    }
    expect(() => parsePluginManifest(v6Manifest({
      oauth: "manual",
      type: "remote",
      url: "https://editor.example.com/mcp",
    }))).toThrow("oauth must be auto or none")
    expect(() => parsePluginManifest(v6Manifest({
      type: "stdio",
      url: "https://editor.example.com/mcp",
    }))).toThrow("type must be remote")
  })

  test("requires tools or mcp, while keeping local Agent tools tied to generation", () => {
    expect(() => parsePluginManifest(v6Manifest(undefined, { contributes: { agent: {} } })))
      .toThrow("tools or mcp")
    expect(() => parsePluginManifest(v6Manifest(undefined, {
      contributes: { agent: { tools: [{ id: "trim_video", tool: "video.trim" }] } },
    }))).toThrow("agent tools require a generation contribution")
  })

  test("combines remote MCP with a return-delivery media sink and connected-input metadata", () => {
    const parsed = parsePluginManifest(v6Manifest(undefined, {
      capabilities: ["agent.prompt", "canvas.connectedInputs.read"],
      contributes: {
        agent: {
          mcp: { type: "remote", url: "https://editor.example.com/mcp" },
          tools: [{ id: "import_connected_media", tool: "media.import" }],
        },
        canvas: { renderer: { create: true } },
        generation: {
          models: [],
          tools: [{
            acceptedInputs: ["reference_image", "reference_video", "audio"],
            delivery: "return",
            description: "Upload host-staged media and return remote asset ids.",
            id: "media.import",
            inputBinding: "direct-incoming",
            output: "text",
            title: "Import connected media",
          }],
        },
      },
      entry: "index.html",
      runtime: { command: "remote-media-import-mcp", type: "mcp-stdio" },
    }))

    expect(parsed.capabilities).toEqual(["agent.prompt", "canvas.connectedInputs.read"])
    expect(parsed.contributes.generation.tools[0]).toMatchObject({
      delivery: "return",
      id: "media.import",
      inputBinding: "direct-incoming",
      output: "text",
    })
    expect(parsed.contributes.agent.tools).toEqual([
      { id: "import_connected_media", tool: "media.import" },
    ])

    expect(() => parsePluginManifest(v6Manifest(undefined, {
      contributes: {
        agent: {
          mcp: { type: "remote", url: "https://editor.example.com/mcp" },
          tools: [{ id: "import_connected_media", tool: "media.import" }],
        },
        generation: {
          models: [{ name: "Invalid", tool: "media.import" }],
          tools: parsed.contributes.generation.tools,
        },
      },
      runtime: { command: "remote-media-import-mcp", type: "mcp-stdio" },
    }))).toThrow("cannot reference return-delivery")

    expect(() => parsePluginManifest(v6Manifest(undefined, {
      contributes: {
        agent: {
          mcp: { type: "remote", url: "https://editor.example.com/mcp" },
          tools: [{ id: "import_connected_media", tool: "media.import" }],
        },
        generation: {
          models: [],
          tools: [{ ...parsed.contributes.generation.tools[0], output: "video" }],
        },
      },
      runtime: { command: "remote-media-import-mcp", type: "mcp-stdio" },
    }))).toThrow("requires text output")

    expect(() => parsePluginManifest(v6Manifest(undefined, {
      contributes: {
        agent: {
          tools: [{ id: "import_connected_media", tool: "media.import" }],
        },
        generation: {
          models: [],
          tools: [{
            ...parsed.contributes.generation.tools[0],
            acceptedInputs: [],
          }],
        },
      },
      runtime: { command: "remote-media-import-mcp", type: "mcp-stdio" },
    }))).toThrow("direct-incoming input binding requires accepted inputs")

    expect(() => parsePluginManifest(v6Manifest(undefined, {
      contributes: {
        generation: {
          models: [{ name: "Invalid", tool: "media.import" }],
          tools: [{
            ...parsed.contributes.generation.tools[0],
            delivery: "canvas",
          }],
        },
      },
      runtime: { command: "remote-media-import-mcp", type: "mcp-stdio" },
    }))).toThrow("cannot reference direct-incoming operation")
  })

  test("admits bounded image and video selection sinks without exposing them to Agent tools", () => {
    const manifest = v6Manifest(undefined, {
      capabilities: ["generation.execute"],
      contributes: {
        canvas: {
          renderer: { create: true },
          selectionActions: [
            {
              description: { default: "Import the selected image." },
              editor: "confirmation",
              id: "import-image",
              steps: [{ tool: "media.import-selected" }],
              target: "image",
              title: { default: "Import image" },
            },
            {
              description: { default: "Import the selected video." },
              editor: "confirmation",
              id: "import-video",
              steps: [{ tool: "media.import-selected" }],
              target: "video",
              title: { default: "Import video" },
            },
          ],
        },
        generation: {
          models: [],
          tools: [{
            acceptedInputs: ["reference_image", "reference_video"],
            delivery: "return",
            description: "Import one host-staged selection.",
            id: "media.import-selected",
            output: "text",
            title: "Import selection",
          }],
        },
      },
      entry: "index.html",
      runtime: { command: "selection-import-mcp", type: "mcp-stdio" },
    })

    const parsed = parsePluginManifest(manifest)
    expect(parsed.contributes.canvas.selectionActions.map(({ target }) => target)).toEqual([
      "image",
      "video",
    ])
    expect(parsed.contributes.agent).toBeUndefined()

    const inputBound = structuredClone(manifest)
    inputBound.contributes.generation.tools[0].inputBinding = "direct-incoming"
    expect(() => parsePluginManifest(inputBound)).toThrow("cannot reference an input-bound operation")

    const nonConfirmation = structuredClone(manifest)
    nonConfirmation.contributes.canvas.selectionActions[0].editor = "crop-region"
    expect(() => parsePluginManifest(nonConfirmation)).toThrow("requires a confirmation editor")

    const canvasDelivery = structuredClone(manifest)
    canvasDelivery.contributes.generation.tools[0].delivery = "canvas"
    expect(() => parsePluginManifest(canvasDelivery)).toThrow(
      "image selection action requires a return-delivery operation",
    )
  })

  test("keeps Plugin-owned Skill registry links valid for v6", () => {
    const plugin = v6Manifest(undefined, {
      contributes: {
        agent: { mcp: { type: "remote", url: "https://editor.example.com/mcp" } },
        skills: [{ name: "remote-editor", path: "skills/remote-editor" }],
      },
    })
    const artifact = (kind, id) => ({
      url:
        `https://github.com/microvoid/convax-plugins/releases/download/${kind}-${id}-v1.0.0/` +
        `convax-${kind}-${id}-1.0.0.zip`,
      size: 10,
      sha256: kind === "plugin" ? "a".repeat(64) : "b".repeat(64),
    })
    const parsed = parseRegistry({
      schema: "convax.registry/1",
      sequence: 1,
      revision: "c".repeat(40),
      packages: [
        {
          kind: "plugin",
          id: plugin.id,
          name: plugin.name,
          description: plugin.description,
          version: plugin.version,
          compatibility: {
            pluginSchema: "convax.plugin/6",
            pluginHost: "convax.plugin-capability/1",
          },
          artifact: artifact("plugin", plugin.id),
          yanked: false,
          manifest: plugin,
        },
        {
          kind: "skill",
          id: "remote-editor",
          name: "Remote Editor",
          description: "Guides the remote editing workflow.",
          version: "1.0.0",
          compatibility: { skillSchema: "opencode.skill/1" },
          artifact: artifact("skill", "remote-editor"),
          ownerPluginId: "remote-editor",
          yanked: false,
        },
      ],
    })

    expect(parsed.packages[1].ownerPluginId).toBe("remote-editor")
  })
})
