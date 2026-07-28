import { describe, expect, mock, test } from "bun:test"

import { McpServer, tools } from "../src/mcp-server.ts"

const argumentsEnvelope = {
  operation_id: `convax-${"a".repeat(64)}`,
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

describe("JianYing MCP server", () => {
  test("advertises and routes the toolbar-only import through the safe export service", async () => {
    expect(tools.map(({ name }) => name)).toEqual([
      "draft.status",
      "media.export",
      "media.import-selected",
    ])
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

    await (server as unknown as {
      handle(value: unknown): Promise<void>
    }).handle({
      id: 1,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: argumentsEnvelope,
        name: "media.import-selected",
      },
    })

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
})
