import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, mock, test } from "bun:test"

import { McpServer, tools } from "../src/mcp-server.ts"
import { JianyingService } from "../src/service.ts"
import { JianyingTransport } from "../src/transport.ts"

const argumentsEnvelope = {
  operation_id: "host-operation-123",
  output: "text",
  output_directory: "/tmp/output",
  prompt: "Import toolbar selection",
  references: [{
    kind: "file",
    mime_type: "video/mp4",
    name: "clip.mp4",
    node_id: "node-1",
    path: "/tmp/staged/clip.mp4",
    role: "reference_video",
  }],
  schema: "convax.generation-call/1",
}

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

async function callTool(server: McpServer, name: string, args: unknown) {
  await (server as unknown as {
    handle(value: unknown): Promise<void>
  }).handle({
    id: 1,
    jsonrpc: "2.0",
    method: "tools/call",
    params: { arguments: args, name },
  })
}

describe("JianYing MCP server", () => {
  test("advertises and routes the toolbar-only import through the safe export service", async () => {
    expect(tools.map(({ name }) => name)).toEqual([
      "draft.status",
      "media.export",
      "media.import-selected",
    ])
    for (const tool of tools) {
      expect(tool.inputSchema.properties.operation_id).toEqual({
        maxLength: 256,
        minLength: 1,
        type: "string",
      })
      expect(tool.inputSchema.required).toContain("operation_id")
    }
    let exportedCall: unknown
    const exportMedia = mock(async (call: unknown) => {
      exportedCall = call
      return {
        createdDraft: false,
        draftName: "Demo",
        importedMediaCount: 1,
        schema: "convax.jianying-export-result/1" as const,
        transferStatus: "verified" as const,
      }
    })
    const responses: string[] = []
    const server = new McpServer(
      { export: exportMedia, status: mock(async () => ({})) } as never,
      (value) => responses.push(value),
    )

    await callTool(server, "media.import-selected", argumentsEnvelope)

    expect(exportMedia).toHaveBeenCalledTimes(1)
    expect(exportedCall).toMatchObject({
      references: [{ role: "reference_video" }],
      target: "auto",
    })
    const response = JSON.parse(responses[0]!)
    expect(response.result.structuredContent).toMatchObject({
      draftName: "Demo",
      importedMediaCount: 1,
      transferStatus: "verified",
    })
  })

  test("completes one readable staged-media export through MCP, service, and loopback transport", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "jianying-mcp-export-"))
    roots.push(root)
    const stagedPath = path.join(root, "frame.png")
    const expectedBytes = new TextEncoder().encode("readable-jianying-media")
    await fs.writeFile(stagedPath, expectedBytes)

    const active = {
      draft: { name: "Issue 35 verification", path: "/drafts/issue-35", pid: 42 },
      processIds: [42],
      status: "active" as const,
    }
    let receivedBytes: Uint8Array | undefined
    const transport = new JianyingTransport({
      async open(url) {
        const parsed = new URL(url)
        const featureEntry = JSON.parse(parsed.searchParams.get("featureEntry") ?? "{}")
        const materialUrl = featureEntry.feature_context.material_infos[0].material_uri
        const response = await fetch(materialUrl)
        expect(response.status).toBe(200)
        receivedBytes = new Uint8Array(await response.arrayBuffer())
      },
      timeoutMs: 2_000,
    })
    const service = new JianyingService({ inspect: mock(async () => active) }, transport)
    const responses: string[] = []
    const server = new McpServer(service, (value) => responses.push(value), () => undefined)

    await callTool(server, "media.import-selected", {
      ...argumentsEnvelope,
      references: [{
        ...argumentsEnvelope.references[0],
        mime_type: "image/png",
        name: "frame.png",
        path: stagedPath,
        role: "reference_image",
      }],
    })

    expect(receivedBytes).toEqual(expectedBytes)
    const response = JSON.parse(responses[0]!)
    expect(response.result.isError).toBeUndefined()
    expect(response.result).toMatchObject({
      structuredContent: {
        draftName: "Issue 35 verification",
        importedMediaCount: 1,
        transferStatus: "verified",
      },
    })
  })

  test("returns an actionable error when host-staged media has expired", async () => {
    const active = {
      draft: { name: "Demo", path: "/drafts/demo", pid: 42 },
      processIds: [42],
      status: "active" as const,
    }
    const service = new JianyingService(
      { inspect: mock(async () => active) },
      new JianyingTransport({ open: mock(async () => undefined) }),
    )
    const responses: string[] = []
    const server = new McpServer(service, (value) => responses.push(value), () => undefined)

    await callTool(server, "media.import-selected", {
      ...argumentsEnvelope,
      references: [{ ...argumentsEnvelope.references[0], path: "/missing/staged-clip.mp4" }],
    })

    const response = JSON.parse(responses[0]!)
    expect(response.result.isError).toBeTrue()
    expect(response.result.content[0].text).toContain("no longer available")
    expect(response.result.content[0].text).toContain("Reconnect the Canvas media")
  })
})
