import {
  InputError,
  parseGenerationCall,
  record,
} from "./contracts.ts"
import { JianyingService } from "./service.ts"

const protocolVersion = "2025-03-26"
const maximumRequestBytes = 1024 * 1024

const referenceSchema = {
  additionalProperties: false,
  properties: {
    kind: { const: "file", type: "string" },
    mime_type: { maxLength: 256, minLength: 3, type: "string" },
    name: { maxLength: 512, minLength: 1, type: "string" },
    node_id: { maxLength: 256, minLength: 1, type: "string" },
    path: { maxLength: 4_096, minLength: 1, type: "string" },
    role: { enum: ["reference_image", "reference_video"], type: "string" },
  },
  required: ["kind", "mime_type", "name", "node_id", "path", "role"],
  type: "object",
} as const

function envelope(referenceLimits: { maximum: number; minimum: number }, explicitTarget: boolean) {
  return {
    additionalProperties: false,
    properties: {
      ...(explicitTarget
        ? {
            draft_token: { maxLength: 256, minLength: 1, type: "string" },
            target: { enum: ["auto", "current", "new"], type: "string" },
          }
        : {}),
      output: { const: "text", type: "string" },
      output_directory: { maxLength: 4_096, minLength: 1, type: "string" },
      prompt: { maxLength: 20_000, minLength: 1, type: "string" },
      references: {
        items: referenceSchema,
        maxItems: referenceLimits.maximum,
        minItems: referenceLimits.minimum,
        type: "array",
      },
      schema: { const: "convax.generation-call/1", type: "string" },
    },
    required: ["output", "output_directory", "prompt", "references", "schema"],
    type: "object",
  }
}

export const tools = [
  {
    description: "Inspect the stable current JianYing draft and return a short-lived observation token.",
    inputSchema: envelope({ maximum: 0, minimum: 0 }, false),
    name: "draft.status",
  },
  {
    description: "Import directly connected, host-staged images and videos into a stable JianYing draft.",
    inputSchema: envelope({ maximum: 32, minimum: 1 }, true),
    name: "media.export",
  },
] as const

interface Request {
  id?: number | string | null
  jsonrpc: "2.0"
  method: string
  params?: unknown
}

function request(value: unknown): value is Request {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && (value as Record<string, unknown>).jsonrpc === "2.0"
    && typeof (value as Record<string, unknown>).method === "string")
}

export class McpServer {
  readonly #handlers = new Set<Promise<void>>()
  readonly #inflight = new Map<number | string, AbortController>()
  #closed = false
  #reader: ReadableStreamDefaultReader<Uint8Array> | undefined

  constructor(
    private readonly service = new JianyingService(),
    private readonly write: (value: string) => void = (value) => { void Bun.stdout.write(value) },
    private readonly log: (message: string) => void = (message) => console.error(message),
  ) {}

  async run(input: ReadableStream<Uint8Array> = Bun.stdin.stream()) {
    if (this.#reader) throw new Error("MCP server is already running")
    const reader = input.getReader()
    this.#reader = reader
    const decoder = new TextDecoder()
    let buffer = ""
    try {
      while (!this.#closed) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        if (Buffer.byteLength(buffer) > maximumRequestBytes) throw new Error("MCP request exceeded the size limit")
        let newline = buffer.indexOf("\n")
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim()
          buffer = buffer.slice(newline + 1)
          if (line) {
            try {
              this.dispatch(JSON.parse(line))
            } catch {
              this.error(null, -32700, "Parse error")
            }
          }
          newline = buffer.indexOf("\n")
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
    for (const controller of this.#inflight.values()) controller.abort("MCP server is closing")
    void this.#reader?.cancel().catch(() => undefined)
  }

  async shutdown(milliseconds: number) {
    this.close()
    if (this.#handlers.size === 0) return true
    return Promise.race([
      Promise.allSettled([...this.#handlers]).then(() => true),
      Bun.sleep(milliseconds).then(() => false),
    ])
  }

  private dispatch(value: unknown) {
    const operation = this.handle(value)
    this.#handlers.add(operation)
    void operation.finally(() => this.#handlers.delete(operation))
  }

  private async handle(value: unknown) {
    if (!request(value)) return this.error(null, -32600, "Invalid Request")
    if (value.method === "notifications/initialized") return
    if (value.method === "notifications/cancelled") {
      const params = value.params && typeof value.params === "object" ? value.params as Record<string, unknown> : {}
      if (typeof params.requestId === "string" || typeof params.requestId === "number") {
        this.#inflight.get(params.requestId)?.abort("Request was cancelled")
      }
      return
    }
    if (value.id === undefined || value.id === null) return
    if (value.method === "initialize") {
      let params: Record<string, unknown>
      try {
        params = record(value.params, "initialize params")
      } catch {
        return this.error(value.id, -32602, "Invalid initialize params")
      }
      if (params.protocolVersion !== protocolVersion) return this.error(value.id, -32602, "Unsupported MCP protocol")
      return this.result(value.id, {
        capabilities: { tools: {} },
        protocolVersion,
        serverInfo: { name: "convax-jianying-editor-mcp", version: "1.0.0" },
      })
    }
    if (value.method === "tools/list") return this.result(value.id, { tools })
    if (value.method !== "tools/call") return this.error(value.id, -32601, "Method not found")
    const controller = new AbortController()
    this.#inflight.set(value.id, controller)
    try {
      const params = record(value.params, "tools/call params")
      if (params.name !== "draft.status" && params.name !== "media.export") {
        return this.error(value.id, -32602, "Unknown tool")
      }
      const call = parseGenerationCall(params.arguments, params.name)
      const output = params.name === "draft.status"
        ? await this.service.status(controller.signal)
        : await this.service.export(call, controller.signal)
      const text = JSON.stringify(output)
      this.result(value.id, { content: [{ text, type: "text" }], structuredContent: output })
    } catch (error) {
      const cancelled = controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")
      this.log(`[jianying-editor] ${cancelled ? "cancelled" : error instanceof InputError ? "invalid-input" : "failed"}`)
      this.result(value.id, {
        content: [{
          text: cancelled
            ? "JianYing operation was cancelled."
            : error instanceof InputError
              ? error.publicMessage
              : error instanceof Error ? error.message : "JianYing operation failed.",
          type: "text",
        }],
        isError: true,
      })
    } finally {
      this.#inflight.delete(value.id)
    }
  }

  private result(id: number | string, result: unknown) {
    this.send({ id, jsonrpc: "2.0", result })
  }

  private error(id: number | string | null, code: number, message: string) {
    this.send({ error: { code, message }, id, jsonrpc: "2.0" })
  }

  private send(value: unknown) {
    if (!this.#closed) this.write(`${JSON.stringify(value)}\n`)
  }
}
