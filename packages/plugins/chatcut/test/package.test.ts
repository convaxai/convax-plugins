import fs from "node:fs/promises"
import path from "node:path"

import { describe, expect, test } from "bun:test"

const packageRoot = path.resolve(import.meta.dir, "..", "package")

async function read(relativePath: string) {
  return fs.readFile(path.join(packageRoot, ...relativePath.split("/")), "utf8")
}

async function relativeFiles(root: string, prefix = ""): Promise<string[]> {
  const files: string[] = []
  for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...(await relativeFiles(root, relativePath)))
    else files.push(relativePath)
  }
  return files.sort()
}

describe("ChatCut Plugin package", () => {
  test("ships one self-contained offline Canvas workspace", async () => {
    expect(await relativeFiles(packageRoot)).toEqual([
      "LICENSE",
      "README.md",
      "UPSTREAM.md",
      "assets/app.js",
      "assets/plugin-host-client.js",
      "assets/styles.css",
      "index.html",
      "manifest.json",
    ])

    const entry = await read("index.html")
    const application = await read("assets/app.js")
    const sdkClient = await read("assets/plugin-host-client.js")
    const styles = await read("assets/styles.css")

    expect(entry).toContain('src="assets/app.js"')
    expect(entry).toContain('href="assets/styles.css"')
    expect(entry).toContain('id="connectedInputList"')
    expect(entry).toContain('id="importButton"')
    expect(entry.match(/<script\b/gu)).toHaveLength(1)
    expect(entry).not.toContain("<style")
    expect(entry).not.toMatch(/(?:src|href)=["'](?:https?:|\/\/|\/)/u)
    expect(styles).not.toContain("@import")
    expect(styles).not.toContain("url(")

    expect(entry).toContain('type="module"')
    expect(application).toContain(
      'import { acceptPluginHostConnection } from "./plugin-host-client.js"',
    )
    expect(sdkClient).toContain(
      "@convax/plugin-sdk/client:createPluginHostClient",
    )
    expect(sdkClient).toContain("convax.plugin-host/8")
    expect(sdkClient).toContain("chatcut")
    expect(application).toContain('SKILL_NAME = "chatcut"')
    expect([
      ...new Set([...application.matchAll(/request\("([^"]+)"/gu)].map((match) => match[1])),
    ]).toEqual(["host.context.get", "canvas.inputs.list", "agent.prompt"])
    expect(application).toContain('"canvas.inputs.changed"')
    expect(application).toMatch(
      /function receiveCommand\(message\)[\s\S]+?message\.command === INPUTS_CHANGED_COMMAND[\s\S]+?void loadConnectedInputs\(\)/u,
    )
    expect(application).toContain("hostClient.onCommand(receiveCommand)")
    expect(application).toContain("hostClient.callHostApi(method, params)")
    expect(application.match(/request\("agent\.prompt"/gu)).toHaveLength(1)
    expect(application).toContain("value.inputKey")
    for (const legacyWireValue of [
      "convax.plugin-capability/1",
      "convax.plugin-capability/3",
      "canvas.connectedInputs.changed",
      "canvas.connectedInputs.list",
      "generation.canvas.execute",
    ]) {
      expect(application).not.toContain(legacyWireValue)
    }
    expect(application).toContain("convax_plugin_chatcut_import_connected_media")
    expect(application).toContain("Do not call import_media action=create_session a second time")
    expect(application).toContain("ownerNodeId")
    expect(application).toContain('references as [{"inputKey":"…","role":')
    expect(application).not.toContain('references as [{"nodeId"')
    expect(application).toContain("every reference is still directly connected")
    expect(application).toContain("action=create_session")
    expect(application).toContain("edit_item")
    expect(application).toContain("read_project")
    expect(application).toContain("batches of at most four")
    expect(application).toContain("The host attached the Plugin-owned Skill named")
    expect(application).toContain("Use only the ChatCut MCP tools actually advertised")
    expect(sdkClient).toContain("window.parent")
    expect(sdkClient).toContain("ports.length")
    expect(application).not.toContain("window.parent.postMessage")
    expect(application).not.toContain('type: "request"')
    expect(application).not.toContain("new Map")
    expect(application).not.toContain("localStorage")
    expect(application).not.toContain("sessionStorage")
    expect(application).not.toContain("indexedDB")
    expect(application).not.toContain("XMLHttpRequest")
    expect(application).not.toContain("WebSocket")
    expect(application).not.toContain("EventSource")
    expect(application).not.toContain("navigator.sendBeacon")
    expect(application).not.toContain("window.open")
    expect(application).not.toMatch(/\bfetch\s*\(/u)
    expect(application).not.toMatch(/https?:\/\//u)

  })

  test("declares connected-input UI, a return-only local import operation, and remote ChatCut MCP", async () => {
    const manifest = JSON.parse(await read("manifest.json"))
    expect(manifest).toMatchObject({
      capabilities: ["agent.prompt", "canvas.connectedInputs.read"],
      contributes: {
        agent: {
          mcp: {
            oauth: "auto",
            type: "remote",
            url: "https://api.chatcut.io/api/external-mcp/mcp",
          },
          tools: [{ id: "import_connected_media", tool: "media.import" }],
        },
        generation: {
          models: [],
          tools: [
            {
              acceptedInputs: ["reference_image", "reference_video", "audio"],
              delivery: "return",
              id: "media.import",
              inputBinding: "direct-incoming",
              output: "text",
            },
          ],
        },
        canvas: {
          renderer: {
            create: true,
            height: 560,
            width: 760,
          },
        },
        skills: [{ name: "chatcut", path: "skills/chatcut" }],
      },
      entry: "index.html",
      hostApi: {
        major: 3,
        optional: [],
        required: ["agent.prompt", "canvas.inputs.list", "host.context.get"],
      },
      id: "chatcut",
      schema: "convax.plugin/8",
      version: "0.4.3",
      runtime: {
        command: "convax-chatcut-media-import-mcp",
        type: "mcp-stdio",
      },
    })
    expect(manifest.capabilities).toEqual(["agent.prompt", "canvas.connectedInputs.read"])
    expect(manifest).not.toHaveProperty("network")
  })

  test("documents explicit edge-triggered import and its credential boundary", async () => {
    const readme = await read("README.md")
    const provenance = await read("UPSTREAM.md")

    expect(readme).toContain("add **ChatCut** to the active Canvas")
    expect(readme).toMatch(/narrow `agent\.prompt`\s+host capability/u)
    expect(readme).toContain("It never uploads automatically")
    expect(readme).toContain("batches of at most four")
    expect(readme).toMatch(/iframe does not connect to\s+ChatCut/u)
    expect(readme).toContain("never displayed by the")
    expect(provenance).toContain("independently authored for Convax")
    expect(provenance).toContain("convax.plugin/8")
    expect(provenance).toContain("convax.plugin-host/8")
    expect(provenance).toContain("asset-import/scripts/upload-media.mjs")
    expect(provenance).toContain("does not")
    expect(provenance).toContain("receive media bytes")
  })
})
