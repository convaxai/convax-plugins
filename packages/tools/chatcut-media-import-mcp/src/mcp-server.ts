import {
  asRecord,
  type JsonRpcRequest,
  type MediaImportCall,
  MediaImportInputError,
  type MediaImportResult,
  parseMediaImportCall,
  type ToolResult,
} from "./contracts.ts"
import { importDiagnosticCode, publicImportError } from "./importer.ts"

const protocolVersion = "2025-03-26"
const maximumRequestBytes = 1024 * 1024

interface ImportExecutor {
  import(call: MediaImportCall, signal: AbortSignal): Promise<MediaImportResult>
}

const hostEnvelopeProperties = {
  endpoint: {
    description: "Exact short-lived upload endpoint returned by ChatCut import_media.",
    maxLength: 2_048,
    minLength: 1,
    type: "string",
  },
  operation_id: { maxLength: 256, minLength: 1, type: "string" },
  output: { const: "text", type: "string" },
  output_directory: { maxLength: 4_096, minLength: 1, type: "string" },
  prompt: { maxLength: 20_000, minLength: 1, type: "string" },
  references: {
    items: {
      additionalProperties: false,
      properties: {
        kind: { const: "file", type: "string" },
        mime_type: { maxLength: 256, minLength: 3, type: "string" },
        name: { maxLength: 512, minLength: 1, type: "string" },
        node_id: { maxLength: 256, minLength: 1, type: "string" },
        path: { maxLength: 4_096, minLength: 1, type: "string" },
        role: {
          enum: ["reference_image", "reference_video", "audio"],
          type: "string",
        },
      },
      required: ["kind", "mime_type", "name", "node_id", "path", "role"],
      type: "object",
    },
    maxItems: 4,
    minItems: 1,
    type: "array",
  },
  schema: { const: "convax.generation-call/1", type: "string" },
  session_token: {
    description: "Short-lived token returned by ChatCut import_media; never persisted.",
    maxLength: 4_096,
    minLength: 16,
    type: "string",
  },
} as const

export const tools = [{
  description:
    "Import up to four directly connected, host-staged image, video, or audio files through a short-lived ChatCut upload session.",
  inputSchema: {
    additionalProperties: false,
    properties: hostEnvelopeProperties,
    required: [
      "endpoint",
      "operation_id",
      "output",
      "output_directory",
      "prompt",
      "references",
      "schema",
      "session_token",
    ],
    type: "object",
  },
  name: "media.import",
}] as const

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.jsonrpc === "2.0" && typeof record.method === "string"
}

function abortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
}

export class McpServer {
  readonly #engine: ImportExecutor
  readonly #handlers = new Set<Promise<void>>()
  readonly #inflight = new Map<number | string, AbortController>()
  readonly #log: (message: string) => void
  readonly #write: (value: string) => void
  #closed = false
  #reader: ReadableStreamDefaultReader<Uint8Array> | undefined

  constructor(
    engine: ImportExecutor,
    options: {
      log?: (message: string) => void
      write?: (value: string) => void
    } = {},
  ) {
    this.#engine = engine
    this.#log = options.log ?? ((message) => console.error(message))
    this.#write = options.write ?? ((value) => {
      void Bun.stdout.write(value)
    })
  }

  async run(input: ReadableStream<Uint8Array> = Bun.stdin.stream()) {
    if (this.#reader) throw new Error("MCP server is already running")
    const reader = input.getReader()
    this.#reader = reader
    const decoder = new TextDecoder()
    let buffer = ""
    try {
      while (!this.#closed) {
        const { done, value } = await reader.read()
        if (done || this.#closed) break
        buffer += decoder.decode(value, { stream: true })
        if (Buffer.byteLength(buffer, "utf8") > maximumRequestBytes) {
          throw new Error("MCP request exceeded the message size limit")
        }
        while (true) {
          const newline = buffer.indexOf("\n")
          if (newline < 0) break
          const line = buffer.slice(0, newline).trim()
          buffer = buffer.slice(newline + 1)
          if (!line) continue
          let request: unknown
          try {
            request = JSON.parse(line) as unknown
          } catch {
            this.#sendError(null, -32700, "Parse error")
            continue
          }
          this.#dispatch(request)
        }
      }
    } finally {
      this.close()
      if (this.#reader === reader) this.#reader = undefined
      reader.releaseLock()
    }
  }

  close() {
    if (this.#closed) return
    this.#closed = true
    for (const controller of this.#inflight.values()) {
      controller.abort("MCP server is closing")
    }
    void this.#reader?.cancel().catch(() => undefined)
  }

  async shutdown(gracePeriodMs: number) {
    if (!Number.isFinite(gracePeriodMs) || gracePeriodMs <= 0) {
      throw new Error("MCP shutdown grace period must be positive")
    }
    this.close()
    const handlers = [...this.#handlers]
    if (handlers.length === 0) return true
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        Promise.allSettled(handlers).then(() => true),
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), gracePeriodMs)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  #dispatch(value: unknown) {
    const handler = this.#handle(value)
    this.#handlers.add(handler)
    void handler.finally(() => this.#handlers.delete(handler))
  }

  async #handle(value: unknown) {
    if (this.#closed) return
    if (!isJsonRpcRequest(value)) {
      this.#sendError(null, -32600, "Invalid Request")
      return
    }
    if (value.method === "notifications/initialized") return
    if (value.method === "notifications/cancelled") {
      const params =
        value.params && typeof value.params === "object" && !Array.isArray(value.params)
          ? value.params as Record<string, unknown>
          : {}
      const requestId = params.requestId
      if (typeof requestId === "number" || typeof requestId === "string") {
        this.#inflight.get(requestId)?.abort("Request was cancelled")
      }
      return
    }
    if (value.id === undefined || value.id === null) return
    const id = value.id
    if (value.method === "initialize") {
      try {
        const params = asRecord(value.params, "initialize params")
        if (params.protocolVersion !== protocolVersion) {
          this.#sendError(id, -32602, "Unsupported MCP protocol version")
          return
        }
      } catch {
        this.#sendError(id, -32602, "Invalid initialize params")
        return
      }
      this.#sendResult(id, {
        capabilities: { tools: {} },
        protocolVersion,
        serverInfo: {
          name: "convax-chatcut-media-import-mcp",
          version: "0.1.1",
        },
      })
      return
    }
    if (value.method === "tools/list") {
      this.#sendResult(id, { tools })
      return
    }
    if (value.method === "tools/call") {
      await this.#callTool({ ...value, id })
      return
    }
    this.#sendError(id, -32601, "Method not found")
  }

  async #callTool(request: JsonRpcRequest & { id: number | string }) {
    const controller = new AbortController()
    this.#inflight.set(request.id, controller)
    try {
      const params = asRecord(request.params, "tools/call params")
      if (params.name !== "media.import") {
        this.#sendError(request.id, -32602, "Unknown tool")
        return
      }
      const call = parseMediaImportCall(params.arguments)
      const imported = await this.#engine.import(call, controller.signal)
      const text = JSON.stringify(imported)
      const result: ToolResult = {
        content: [{ text, type: "text" }],
        structuredContent: imported,
      }
      this.#sendResult(request.id, result)
    } catch (error) {
      const cancelled = controller.signal.aborted || abortError(error)
      const diagnostic = cancelled ? "cancelled" : importDiagnosticCode(error)
      this.#log(`[chatcut-media-import] failed (${diagnostic})`)
      const text =
        cancelled
          ? "ChatCut media import was cancelled."
          : error instanceof MediaImportInputError
            ? error.publicMessage
            : publicImportError(error)
      this.#sendResult(request.id, {
        content: [{ text, type: "text" }],
        isError: true,
      } satisfies ToolResult)
    } finally {
      this.#inflight.delete(request.id)
    }
  }

  #sendResult(id: number | string, result: unknown) {
    this.#send({ id, jsonrpc: "2.0", result })
  }

  #sendError(id: number | string | null, code: number, message: string) {
    this.#send({ error: { code, message }, id, jsonrpc: "2.0" })
  }

  #send(value: unknown) {
    if (this.#closed) return
    this.#write(`${JSON.stringify(value)}\n`)
  }
}
