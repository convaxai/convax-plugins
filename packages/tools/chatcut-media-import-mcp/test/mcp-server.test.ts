import { describe, expect, test } from "bun:test"
import type { MediaImportCall, MediaImportResult } from "../src/contracts.ts"
import { McpServer } from "../src/mcp-server.ts"

const encoder = new TextEncoder()

function callArguments() {
  return {
    endpoint: "https://api.chatcut.io/api/media-import/session",
    operation_id: "operation-one",
    output: "text",
    output_directory: "/private/tmp/output",
    prompt: "Import connected media",
    references: [{
      kind: "file",
      mime_type: "image/png",
      name: "source.png",
      node_id: "node-one",
      path: "/private/tmp/staged/source.png",
      role: "reference_image",
    }],
    schema: "convax.generation-call/1",
    session_token: "short-lived-session-token",
  }
}

function requestStream(requests: unknown[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const request of requests) {
        controller.enqueue(encoder.encode(`${JSON.stringify(request)}\n`))
      }
    },
  })
}

async function waitFor<T>(read: () => T | undefined) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = read()
    if (value !== undefined) return value
    await Bun.sleep(1)
  }
  throw new Error("timed out waiting for MCP output")
}

describe("ChatCut media import MCP", () => {
  test("lists the scalar session fields and returns bounded JSON text", async () => {
    const output: string[] = []
    const imported: MediaImportResult = {
      assetIds: ["asset-one"],
      assets: [{ assetId: "asset-one", assetType: "image", nodeId: "node-one" }],
      schema: "convax.chatcut-media-import-result/1",
    }
    const server = new McpServer({
      async import(call: MediaImportCall) {
        expect(call.session_token).toBe("short-lived-session-token")
        return imported
      },
    }, { log: () => undefined, write: (value) => output.push(value) })
    const running = server.run(requestStream([
      {
        id: 0,
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: "2025-03-26" },
      },
      {
        id: 1,
        jsonrpc: "2.0",
        method: "tools/list",
      },
      {
        id: 2,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: callArguments(), name: "media.import" },
      },
    ]))
    const line = await waitFor(() => output.find((value) => value.includes('"id":2')))
    const response = JSON.parse(line) as {
      result: {
        content: Array<{ text: string }>
        structuredContent: MediaImportResult
      }
    }
    expect(JSON.parse(response.result.content[0]!.text)).toEqual(imported)
    expect(response.result.structuredContent).toEqual(imported)
    const list = JSON.parse(output.find((value) => value.includes('"id":1'))!) as {
      result: { tools: Array<{ inputSchema: { properties: Record<string, unknown> } }> }
    }
    expect(Object.keys(list.result.tools[0]!.inputSchema.properties)).toContain("session_token")
    expect(Object.keys(list.result.tools[0]!.inputSchema.properties)).toContain("endpoint")
    const initialized = JSON.parse(output.find((value) => value.includes('"id":0'))!) as {
      result: {
        capabilities: { tools: Record<string, never> }
        protocolVersion: string
        serverInfo: { name: string; version: string }
      }
    }
    expect(initialized.result).toEqual({
      capabilities: { tools: {} },
      protocolVersion: "2025-03-26",
      serverInfo: {
        name: "convax-chatcut-media-import-mcp",
        version: "0.1.1",
      },
    })
    expect(line).not.toContain("short-lived-session-token")
    server.close()
    await running
  })

  test("cancellation reaches active import work", async () => {
    const output: string[] = []
    let started!: () => void
    const start = new Promise<void>((resolve) => {
      started = resolve
    })
    const server = new McpServer({
      async import(_call: MediaImportCall, signal: AbortSignal): Promise<MediaImportResult> {
        started()
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true },
          )
        })
        throw new Error("unreachable")
      },
    }, { log: () => undefined, write: (value) => output.push(value) })
    let streamController!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
        controller.enqueue(encoder.encode(`${JSON.stringify({
          id: "request-one",
          jsonrpc: "2.0",
          method: "tools/call",
          params: { arguments: callArguments(), name: "media.import" },
        })}\n`))
      },
    })
    const running = server.run(stream)
    await start
    streamController.enqueue(encoder.encode(`${JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: "request-one" },
    })}\n`))
    const line = await waitFor(() => output[0])
    expect(line).toContain("ChatCut media import was cancelled.")
    server.close()
    await running
  })

  test("diagnostics never echo thrown secrets or paths", async () => {
    const output: string[] = []
    const logs: string[] = []
    const server = new McpServer({
      async import(): Promise<MediaImportResult> {
        throw new Error("secret-token https://endpoint.invalid /private/native/path")
      },
    }, { log: (value) => logs.push(value), write: (value) => output.push(value) })
    const running = server.run(requestStream([{
      id: 1,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: callArguments(), name: "media.import" },
    }]))
    await waitFor(() => output[0])
    const serialized = `${output.join("")}\n${logs.join("")}`
    expect(serialized).not.toContain("secret-token")
    expect(serialized).not.toContain("endpoint.invalid")
    expect(serialized).not.toContain("/private/native/path")
    server.close()
    await running
  })
})
