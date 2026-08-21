import { describe, expect, test } from "bun:test"
import { chmod, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { ImageJob } from "shortdrama-router"

import { mcpProtocolVersion } from "../src/contracts.ts"
import { GenerationEngine } from "../src/generation.ts"
import { GenerationOperationJournal } from "../src/generation-journal.ts"
import { ShortDramaGenerationLro } from "../src/generation-lro.ts"
import { McpServer } from "../src/mcp-server.ts"
import { ProviderService } from "../src/service.ts"
import { fakeRouter, providerModel, validAuthorization } from "./fakes.ts"

function request(id: number, method: string, params?: unknown) {
  return {
    id,
    jsonrpc: "2.0" as const,
    method,
    ...(params === undefined ? {} : { params }),
  }
}

function initializeParams(protocolVersion: string = mcpProtocolVersion) {
  return {
    capabilities: {},
    clientInfo: { name: "convax-test-client", version: "1.0.0" },
    protocolVersion,
  }
}

async function makeOperational(
  server: McpServer,
  sent: Array<unknown>,
) {
  await server.handleMessage(request(10_000, "initialize", initializeParams()))
  await server.handleMessage({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  })
  sent.length = 0
}

function generationArguments() {
  return {
    model: "jimeng/image-model",
    operation_id: "operation-1",
    output: "image",
    output_directory: "/tmp",
    prompt: "A cinematic scene",
    references: [],
    schema: "convax.generation-call/1",
  }
}

describe("newline MCP server", () => {
  test("advertises and serves the generation recovery protocol", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "shortdrama-mcp-lro-"))
    await chmod(directory, 0o700)
    try {
      const sent: Array<Record<string, any>> = []
      const router = fakeRouter()
      const engine = new GenerationEngine("jimeng", router)
      const recovery = new ShortDramaGenerationLro(
        "jimeng",
        engine,
        router,
        new GenerationOperationJournal("jimeng", directory),
      )
      const server = new McpServer(
        "jimeng",
        router,
        engine,
        new ProviderService("jimeng", router),
        { recovery, send: (value) => sent.push(value as Record<string, any>) },
      )

      await server.handleMessage(request(1, "initialize", initializeParams()))
      expect(sent[0]).toMatchObject({
        result: {
          capabilities: {
            experimental: {
              "convax/generation-lro": {
                mode: "long-running-operation",
                schema: "convax.generation-lro/1",
              },
            },
          },
          serverInfo: { version: "0.2.0" },
        },
      })
      await server.handleMessage({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      })
      sent.length = 0
      await server.handleMessage(request(
        2,
        "convax/generation/operations/get",
        {
          operationId: "operation-missing",
          requestDigest: "a".repeat(64),
          schema: "convax.generation-lro-request/1",
        },
      ))
      expect(sent[0]).toMatchObject({
        result: {
          schema: "convax.generation-lro-snapshot/1",
          status: "absent",
        },
      })
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  test("strictly negotiates the initialize lifecycle before serving tools", async () => {
    const sent: Array<Record<string, any>> = []
    const router = fakeRouter()
    const server = new McpServer(
      "jimeng",
      router,
      new GenerationEngine("jimeng", router),
      new ProviderService("jimeng", router),
      { send: (value) => sent.push(value as Record<string, any>) },
    )

    await server.handleMessage({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    })
    expect(sent).toHaveLength(0)

    await server.handleMessage(request(1, "tools/list"))
    expect(sent.at(-1)).toMatchObject({
      error: { code: -32_002 },
      id: 1,
    })

    await server.handleMessage(request(2, "initialize", {
      capabilities: {},
      protocolVersion: mcpProtocolVersion,
    }))
    expect(sent.at(-1)).toMatchObject({
      error: { code: -32_602 },
      id: 2,
    })

    await server.handleMessage(request(3, "initialize", initializeParams(
      "2024-11-05",
    )))
    expect(sent.at(-1)).toMatchObject({
      error: { code: -32_602 },
      id: 3,
    })

    await server.handleMessage(request(4, "initialize", initializeParams()))
    expect(sent.at(-1)).toMatchObject({
      id: 4,
      result: { protocolVersion: "2025-03-26" },
    })

    await server.handleMessage(request(5, "tools/list"))
    expect(sent.at(-1)).toMatchObject({
      error: { code: -32_002 },
      id: 5,
    })

    const beforeInitialized = sent.length
    await server.handleMessage({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    })
    await server.handleMessage({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    })
    await server.handleMessage({
      jsonrpc: "2.0",
      method: "notifications/unknown",
    })
    expect(sent).toHaveLength(beforeInitialized)

    await server.handleMessage(request(6, "initialize", initializeParams()))
    expect(sent.at(-1)).toMatchObject({
      error: { code: -32_600 },
      id: 6,
    })

    await server.handleMessage(request(7, "tools/list"))
    expect(sent.at(-1)).toMatchObject({ id: 7, result: { tools: expect.any(Array) } })

    await server.handleMessage({ id: null, jsonrpc: "2.0", method: "tools/list" })
    expect(sent.at(-1)).toEqual({
      error: { code: -32_600, message: "Invalid Request" },
      id: null,
      jsonrpc: "2.0",
    })
  })

  test("requires capabilities and complete clientInfo objects", async () => {
    const malformed = [
      { clientInfo: { name: "client", version: "1" }, protocolVersion: mcpProtocolVersion },
      { capabilities: [], clientInfo: { name: "client", version: "1" }, protocolVersion: mcpProtocolVersion },
      { capabilities: {}, clientInfo: { name: "client" }, protocolVersion: mcpProtocolVersion },
      { capabilities: {}, clientInfo: { name: "", version: "1" }, protocolVersion: mcpProtocolVersion },
    ]

    for (const [index, params] of malformed.entries()) {
      const sent: Array<Record<string, any>> = []
      const router = fakeRouter()
      const server = new McpServer(
        "jimeng",
        router,
        new GenerationEngine("jimeng", router),
        new ProviderService("jimeng", router),
        { send: (value) => sent.push(value as Record<string, any>) },
      )
      await server.handleMessage(request(index + 1, "initialize", params))
      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({ error: { code: -32_602 } })
    }
  })

  test("keeps Service auth tools when model discovery times out", async () => {
    const sent: Array<Record<string, any>> = []
    const diagnostics: string[] = []
    const router = fakeRouter({
      async listProviderModels() {
        return new Promise(() => {})
      },
    })
    const server = new McpServer(
      "jimeng",
      router,
      new GenerationEngine("jimeng", router),
      new ProviderService("jimeng", router),
      {
        diagnostic: (message) => diagnostics.push(message),
        modelCatalogTimeoutMs: 5,
        send: (value) => sent.push(value as Record<string, any>),
      },
    )

    await makeOperational(server, sent)
    await server.handleMessage(request(1, "tools/list"))

    const names = sent[0]!.result.tools.map(({ name }: { name: string }) => name)
    expect(names).toEqual([
      "service.status",
      "service.authorize",
      "service.reauthorize",
      "service.authorization.cancel",
      "service.authorization.complete",
      "service.sign_out",
    ])
    expect(names.some((name: string) => name.startsWith("llm.gateway"))).toBe(false)
    expect(JSON.stringify([sent, diagnostics])).not.toContain("secret CLI output")
  })

  test("keeps LibTV generation hidden while project configuration is unavailable", async () => {
    const sent: Array<Record<string, any>> = []
    let discoveryCalls = 0
    const router = fakeRouter({
      async listProviderModels() {
        discoveryCalls += 1
        throw new Error("LibTV discovery must not run")
      },
      async getProviderConfiguration() {
        return { configured: false, state: "configuration_required" }
      },
      async listProviderResources() {
        return []
      },
    })
    const server = new McpServer(
      "libtv",
      router,
      new GenerationEngine("libtv", router),
      new ProviderService("libtv", router),
      { send: (value) => sent.push(value as Record<string, any>) },
    )

    await makeOperational(server, sent)
    await server.handleMessage(request(1, "tools/list"))

    expect(discoveryCalls).toBe(0)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.result.tools.map(({ name }: { name: string }) => name))
      .toEqual([
        "service.status",
        "service.authorize",
        "service.reauthorize",
        "service.authorization.cancel",
        "service.authorization.complete",
        "service.sign_out",
      ])
  })

  test("advertises available LibTV models after project configuration", async () => {
    const sent: Array<Record<string, any>> = []
    const router = fakeRouter({
      async getProviderConfiguration() {
        return {
          configured: true,
          resource: { id: "project-1", name: "Film", type: "project" },
          state: "configuration_valid",
        }
      },
      async listProviderModels() {
        return [{
          ...providerModel("libtv", "image", "libtv/image-model"),
          availability: { state: "available" },
        }]
      },
    })
    const server = new McpServer(
      "libtv",
      router,
      new GenerationEngine("libtv", router),
      new ProviderService("libtv", router),
      { send: (value) => sent.push(value as Record<string, any>) },
    )

    await makeOperational(server, sent)
    await server.handleMessage(request(1, "tools/list"))

    expect(sent[0]!.result.tools.map(({ name }: { name: string }) => name))
      .toEqual([
        "image.generate",
        "service.status",
        "service.authorize",
        "service.reauthorize",
        "service.authorization.cancel",
        "service.authorization.complete",
        "service.sign_out",
      ])
  })

  test("keeps a duplicate id retired until its original handler drains", async () => {
    const sent: Array<Record<string, any>> = []
    let submissions = 0
    let markStarted!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const router = fakeRouter({
      async createImage(_input, signal) {
        submissions += 1
        markStarted()
        return new Promise<ImageJob>((_, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("retired", "AbortError")),
            { once: true },
          )
        })
      },
      async listProviderModels() {
        return [providerModel("jimeng", "image", "jimeng/image-model")]
      },
    })
    const server = new McpServer(
      "jimeng",
      router,
      new GenerationEngine("jimeng", router),
      new ProviderService("jimeng", router),
      { send: (value) => sent.push(value as Record<string, any>) },
    )

    await makeOperational(server, sent)
    const original = server.handleMessage(request(7, "tools/call", {
      arguments: generationArguments(),
      name: "image.generate",
    }))
    await started
    const duplicate = server.handleMessage(request(7, "tools/call", {
      arguments: generationArguments(),
      name: "image.generate",
    }))
    const third = server.handleMessage(request(7, "tools/call", {
      arguments: generationArguments(),
      name: "image.generate",
    }))
    await Promise.all([duplicate, third, original])

    expect(submissions).toBe(1)
    expect(sent).toEqual([
      {
        error: { code: -32_600, message: "Request id is already active" },
        id: 7,
        jsonrpc: "2.0",
      },
    ])
  })

  test("cancels an inflight generation and redacts the upstream failure", async () => {
    const sent: Array<Record<string, any>> = []
    const diagnostics: string[] = []
    let markStarted!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const router = fakeRouter({
      async createImage(_input, signal) {
        markStarted()
        return new Promise<ImageJob>((_, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new Error(
              "Cookie=private; /Users/person/source.png token=secret",
            )),
            { once: true },
          )
        })
      },
      async getProviderAuthorization() {
        return validAuthorization
      },
      async listProviderModels() {
        return [providerModel("jimeng", "image", "jimeng/image-model")]
      },
    })
    const server = new McpServer(
      "jimeng",
      router,
      new GenerationEngine("jimeng", router),
      new ProviderService("jimeng", router),
      {
        diagnostic: (message) => diagnostics.push(message),
        send: (value) => sent.push(value as Record<string, any>),
      },
    )

    await makeOperational(server, sent)
    const pending = server.handleMessage(request(7, "tools/call", {
      arguments: generationArguments(),
      name: "image.generate",
    }))
    await started
    await server.handleMessage({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 7 },
    })
    await pending

    expect(sent.at(-1)).toMatchObject({
      id: 7,
      result: {
        content: [{ text: "The request was cancelled." }],
        isError: true,
      },
    })
    const publicOutput = JSON.stringify([sent, diagnostics])
    expect(publicOutput).not.toContain("Cookie=private")
    expect(publicOutput).not.toContain("/Users/person")
    expect(publicOutput).not.toContain("token=secret")
  })

  test("returns a generic generation error without leaking provider details", async () => {
    const sent: Array<Record<string, any>> = []
    const diagnostics: string[] = []
    const router = fakeRouter({
      async createImage() {
        throw new Error("Authorization: Bearer private-response-body")
      },
      async listProviderModels() {
        return [providerModel("jimeng", "image", "jimeng/image-model")]
      },
    })
    const server = new McpServer(
      "jimeng",
      router,
      new GenerationEngine("jimeng", router),
      new ProviderService("jimeng", router),
      {
        diagnostic: (message) => diagnostics.push(message),
        send: (value) => sent.push(value as Record<string, any>),
      },
    )

    await makeOperational(server, sent)
    await server.handleMessage(request(9, "tools/call", {
      arguments: generationArguments(),
      name: "image.generate",
    }))

    expect(sent[0]!.result.isError).toBe(true)
    expect(sent[0]!.result.content[0].text).toContain(
      "did not confirm that generation was accepted",
    )
    expect(JSON.stringify([sent, diagnostics])).not.toContain(
      "private-response-body",
    )
  })
})
