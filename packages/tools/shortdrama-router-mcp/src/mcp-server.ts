import { generationTools, loadModelCatalog } from "./catalog.ts"
import {
  abortError,
  asRecord,
  isAbortError,
  mcpProtocolVersion,
  type GenerationKind,
  type JsonRpcRequest,
  type McpTool,
  type ProviderId,
  type RouterPort,
  type ToolResult,
} from "./contracts.ts"
import {
  GenerationEngine,
  GenerationObservationError,
  GenerationSubmissionError,
  LocalMediaReferenceError,
  OperationConflictError,
  TerminalGenerationError,
} from "./generation.ts"
import { ProviderService, serviceTools } from "./service.ts"

const maximumRequestBytes = 4 * 1024 * 1024
const generationToolPattern = /^(audio|image|video)\.generate$/u

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  return input.jsonrpc === "2.0" && typeof input.method === "string"
}

function publicGenerationError(error: unknown, provider: ProviderId) {
  if (error instanceof LocalMediaReferenceError) {
    return "This service cannot accept Convax local media references. Remove the local media input and try again; no generation was submitted."
  }
  if (error instanceof GenerationObservationError) {
    return "The service accepted generation, but repeated status checks failed. It was not resubmitted; check the provider before trying another paid generation."
  }
  if (error instanceof GenerationSubmissionError) {
    return "The service did not confirm that generation was accepted. Refresh the Service and model catalog, then try again."
  }
  if (error instanceof TerminalGenerationError) {
    if (error.status === "submission_unknown") {
      return "The provider could not confirm whether generation was accepted. This operation will not be submitted again; inspect the provider account before starting another paid generation."
    }
    return error.status === "cancelled"
      ? "The service reported that generation was cancelled."
      : "The service reported that generation failed."
  }
  if (error instanceof OperationConflictError) {
    return "This generation operation cannot be safely submitted again. Start a new Canvas generation operation."
  }
  return `${provider === "xiaoyunque" ? "XiaoYunque" : provider === "jimeng" ? "Jimeng" : "LibTV"} generation failed.`
}

export interface McpServerOptions {
  diagnostic?: (message: string) => void
  dispose?: () => void
  modelCatalogTimeoutMs?: number
  send?: (value: unknown) => void
}

export class McpServer {
  #closed = false
  readonly #diagnostic: (message: string) => void
  readonly #dispose: (() => void) | undefined
  #disposed = false
  readonly #handlers = new Set<Promise<void>>()
  readonly #inflight = new Map<number | string, AbortController>()
  readonly #retired = new Map<number | string, AbortController>()
  #lifecycle: "awaiting-initialize" | "awaiting-initialized" | "operational" =
    "awaiting-initialize"
  readonly #modelCatalogTimeoutMs: number
  #reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  readonly #sendValue: (value: unknown) => void
  readonly #serviceToolNames: ReadonlySet<string>
  readonly #serviceTools: readonly McpTool[]

  constructor(
    readonly provider: ProviderId,
    private readonly router: RouterPort,
    private readonly generation: GenerationEngine,
    private readonly service: ProviderService,
    options: McpServerOptions = {},
  ) {
    this.#diagnostic = options.diagnostic ?? console.error
    this.#dispose = options.dispose
    this.#modelCatalogTimeoutMs = options.modelCatalogTimeoutMs ?? 30_000
    if (
      !Number.isFinite(this.#modelCatalogTimeoutMs)
      || this.#modelCatalogTimeoutMs <= 0
    ) {
      throw new Error("Model catalog timeout is invalid")
    }
    this.#sendValue = options.send ?? ((value) => {
      Bun.stdout.write(`${JSON.stringify(value)}\n`)
    })
    this.#serviceTools = serviceTools(provider)
    this.#serviceToolNames = new Set(this.#serviceTools.map(({ name }) => name))
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
          let parsed: unknown
          try {
            parsed = JSON.parse(line) as unknown
          } catch {
            this.#sendError(null, -32_700, "Parse error")
            continue
          }
          this.dispatch(parsed)
        }
      }
    } finally {
      this.close()
      if (this.#reader === reader) this.#reader = undefined
      reader.releaseLock()
    }
  }

  dispatch(value: unknown) {
    const operation = this.handleMessage(value)
    this.#handlers.add(operation)
    void operation.finally(() => this.#handlers.delete(operation))
  }

  async handleMessage(value: unknown) {
    if (this.#closed) return
    if (!isJsonRpcRequest(value)) {
      this.#sendError(null, -32_600, "Invalid Request")
      return
    }
    const notification = value.id === undefined
    if (notification) {
      if (
        value.method === "notifications/initialized"
        && this.#lifecycle === "awaiting-initialized"
      ) {
        this.#lifecycle = "operational"
      }
      if (
        value.method === "notifications/cancelled"
        && this.#lifecycle === "operational"
      ) {
        const params = value.params && typeof value.params === "object"
          && !Array.isArray(value.params)
          ? value.params as Record<string, unknown>
          : {}
        const requestId = params.requestId
        if (
          typeof requestId === "string"
          || (typeof requestId === "number" && Number.isFinite(requestId))
        ) {
          this.#inflight.get(requestId)?.abort("MCP request was cancelled")
        }
      }
      // JSON-RPC notifications never receive a response, including malformed,
      // duplicated, or out-of-order lifecycle notifications.
      return
    }
    if (
      typeof value.id !== "string"
      && (typeof value.id !== "number" || !Number.isFinite(value.id))
    ) {
      this.#sendError(null, -32_600, "Invalid Request")
      return
    }
    if (
      value.method === "notifications/initialized"
      || value.method === "notifications/cancelled"
    ) {
      this.#sendError(value.id, -32_600, "Invalid Request")
      return
    }
    if (value.method === "initialize") {
      if (this.#lifecycle !== "awaiting-initialize") {
        this.#sendError(value.id, -32_600, "Initialize request is out of order")
        return
      }
      try {
        const params = asRecord(value.params, "initialize params")
        const capabilities = asRecord(
          params.capabilities,
          "initialize capabilities",
        )
        const clientInfo = asRecord(params.clientInfo, "initialize clientInfo")
        if (
          params.protocolVersion !== mcpProtocolVersion
          || typeof clientInfo.name !== "string"
          || clientInfo.name.length === 0
          || typeof clientInfo.version !== "string"
          || clientInfo.version.length === 0
        ) {
          throw new Error("Initialize params are invalid")
        }
        void capabilities
      } catch {
        this.#sendError(value.id, -32_602, "Initialize params are invalid")
        return
      }
      this.#lifecycle = "awaiting-initialized"
      this.#sendResult(value.id, {
        capabilities: { tools: {} },
        protocolVersion: mcpProtocolVersion,
        serverInfo: {
          name: "convax-shortdrama-router-mcp",
          version: "0.1.0",
        },
      })
      return
    }
    if (this.#lifecycle !== "operational") {
      this.#sendError(value.id, -32_002, "Server is not initialized")
      return
    }
    if (value.method === "tools/list") {
      await this.#listTools({ ...value, id: value.id })
      return
    }
    if (value.method === "tools/call") {
      await this.#callTool({ ...value, id: value.id })
      return
    }
    this.#sendError(value.id, -32_601, "Method not found")
  }

  async #listTools(request: JsonRpcRequest & { id: number | string }) {
    const controller = this.#beginInflight(request.id)
    if (!controller) return
    try {
      let dynamic: McpTool[] = []
      try {
        await this.service.prepareModels(controller.signal)
        const catalog = await loadModelCatalog(
          this.router,
          this.provider,
          controller.signal,
          this.#modelCatalogTimeoutMs,
        )
        dynamic = generationTools(catalog)
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) throw abortError()
        this.#diagnostic(
          `[shortdrama-router:${this.provider}] model catalog rejected`,
        )
      }
      this.#completeResult(request.id, controller, {
        tools: [...dynamic, ...this.#serviceTools],
      })
    } catch {
      this.#completeError(
        request.id,
        controller,
        -32_800,
        "Model catalog request was cancelled",
      )
    } finally {
      this.#releaseRequest(request.id, controller)
    }
  }

  async #callTool(request: JsonRpcRequest & { id: number | string }) {
    const controller = this.#beginInflight(request.id)
    if (!controller) return
    let toolName: string | undefined
    let serviceCall = false
    try {
      const params = asRecord(request.params, "tools/call params")
      if (typeof params.name !== "string") {
        this.#completeError(
          request.id,
          controller,
          -32_602,
          "Tool name is invalid",
        )
        return
      }
      toolName = params.name
      serviceCall = this.#serviceToolNames.has(toolName)
      const generationMatch = generationToolPattern.exec(toolName)
      if (!serviceCall && !generationMatch) {
        this.#completeError(request.id, controller, -32_602, "Unknown tool")
        return
      }
      const argumentsValue = params.arguments ?? {}
      let structuredContent: Record<string, unknown>
      if (serviceCall) {
        if (
          toolName !== "service.authorization.complete"
          && toolName !== "service.authorization.cancel"
          && toolName !== "service.sign_out"
        ) {
          const input = asRecord(argumentsValue, "service arguments")
          if (Object.keys(input).length !== 0) {
            this.#completeError(
              request.id,
              controller,
              -32_602,
              "This service action does not accept arguments",
            )
            return
          }
        }
        structuredContent = toolName === "service.status"
          ? await this.service.status(controller.signal)
          : toolName === "service.authorize"
            ? await this.service.authorize(controller.signal)
            : toolName === "service.reauthorize"
              ? await this.service.reauthorize(controller.signal)
              : toolName === "service.authorization.cancel"
                ? await this.service.cancelAuthorization(
                    argumentsValue,
                    controller.signal,
                  )
                : toolName === "service.authorization.complete"
                  ? await this.service.completeAuthorization(
                      argumentsValue,
                      controller.signal,
                    )
                  : await this.service.signOut(
                      argumentsValue,
                      controller.signal,
                    )
      } else {
        const kind = generationMatch![1] as GenerationKind
        structuredContent = {
          artifacts: await this.generation.generate(
            kind,
            argumentsValue,
            controller.signal,
          ),
        }
      }
      this.#completeResult(request.id, controller, {
        content: [
          {
            text: serviceCall
              ? "Service operation completed."
              : "Generation completed and artifacts were stored locally.",
            type: "text",
          },
        ],
        structuredContent,
      } satisfies ToolResult)
    } catch (error) {
      const cancelled = controller.signal.aborted || isAbortError(error)
      this.#diagnostic(
        `[shortdrama-router:${this.provider}] ${
          serviceCall ? "service action" : "generation"
        } ${cancelled ? "cancelled" : "failed"}`,
      )
      this.#completeResult(request.id, controller, {
        content: [
          {
            text: cancelled
              ? "The request was cancelled."
              : serviceCall
                ? "Service action failed."
                : publicGenerationError(error, this.provider),
            type: "text",
          },
        ],
        isError: true,
      } satisfies ToolResult)
    } finally {
      this.#releaseRequest(request.id, controller)
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
    if (this.#handlers.size === 0) {
      this.#disposeOnce()
      return true
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const drained = await Promise.race([
        Promise.allSettled([...this.#handlers]).then(() => true),
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), gracePeriodMs)
        }),
      ])
      if (drained) this.#disposeOnce()
      return drained
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  #disposeOnce() {
    if (this.#disposed) return
    this.#disposed = true
    this.#dispose?.()
  }

  #sendResult(id: number | string, result: unknown) {
    this.#send({ id, jsonrpc: "2.0", result })
  }

  #sendError(id: number | string | null, code: number, message: string) {
    this.#send({ error: { code, message }, id, jsonrpc: "2.0" })
  }

  #send(value: unknown) {
    if (!this.#closed) this.#sendValue(value)
  }

  #completeResult(
    id: number | string,
    controller: AbortController,
    result: unknown,
  ) {
    if (this.#inflight.get(id) !== controller) return false
    this.#inflight.delete(id)
    this.#sendResult(id, result)
    return true
  }

  #completeError(
    id: number | string,
    controller: AbortController,
    code: number,
    message: string,
  ) {
    if (this.#inflight.get(id) !== controller) return false
    this.#inflight.delete(id)
    this.#sendError(id, code, message)
    return true
  }

  #beginInflight(id: number | string) {
    if (this.#retired.has(id)) {
      // A duplicate response already retired this id. Keep one terminal
      // response for the whole conflict window while the original handler
      // drains; another duplicate must not create a second terminal response.
      return undefined
    }
    const previous = this.#inflight.get(id)
    if (previous) {
      this.#inflight.delete(id)
      this.#retired.set(id, previous)
      previous.abort("MCP request id was reused")
      this.#sendError(id, -32_600, "Request id is already active")
      return undefined
    }
    const controller = new AbortController()
    this.#inflight.set(id, controller)
    return controller
  }

  #releaseRequest(id: number | string, controller: AbortController) {
    if (this.#inflight.get(id) === controller) this.#inflight.delete(id)
    if (this.#retired.get(id) === controller) this.#retired.delete(id)
  }
}
