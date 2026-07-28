import { expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  imageGenerationTool,
  NexusMcpServer,
  publicImageGenerationErrorMessage,
  tools,
} from "../src/mcp-server.ts";
import { NexusImageHttpError } from "../src/nexus-client.ts";
import type { NexusSessionStore } from "../src/session-store.ts";

test("Nexus companion exposes image generation plus the fixed Service and LLM tools", () => {
  expect(tools.map(({ name }) => name)).toEqual([
    "image.generate",
    "service.status",
    "service.authorize",
    "service.reauthorize",
    "service.authorization.complete",
    "service.authorization.cancel",
    "service.sign_out",
    "service.checkout",
    "llm.models.list",
    "llm.gateway.start",
  ]);
});

test("Nexus image generation projects current image models as a bounded select", () => {
  const tool = imageGenerationTool([
    { id: "microsoft/mai-image-2.5-pro", name: "MAI Image 2.5 Pro" },
    { id: "openai/gpt-image-1", name: "GPT Image 1" },
  ]);
  expect(tool.inputSchema.properties.model).toEqual({
    oneOf: [
      {
        const: "microsoft/mai-image-2.5-pro",
        title: "MAI Image 2.5 Pro",
      },
      { const: "openai/gpt-image-1", title: "GPT Image 1" },
    ],
    title: "Model",
    type: "string",
    "x-convax-role": "generation-model-id",
  });
});

test("Nexus free-text image model fallback is not a trusted model catalog", () => {
  const model = imageGenerationTool().inputSchema.properties.model;
  expect(model).not.toHaveProperty("x-convax-role");
  expect(model).not.toHaveProperty("oneOf");
});

test("Nexus image diagnostics expose only typed bounded HTTP fields", () => {
  expect(
    publicImageGenerationErrorMessage(
      new NexusImageHttpError(
        409,
        "gateway-request-123",
        "metering_unsupported",
      ),
    ),
  ).toBe(
    "Nexus rejected image generation (HTTP 409, code metering_unsupported, request id gateway-request-123). This image route is not enabled for Nexus metering; contact Nexus support before trying again.",
  );
  const generic = publicImageGenerationErrorMessage(
    new Error("raw secret-token secret-prompt /private/output/path"),
  );
  expect(generic).toBe(
    "Nexus image generation failed. Check Nexus before retrying because the upstream task result may be unknown.",
  );
  expect(generic).not.toContain("secret-token");
  expect(generic).not.toContain("secret-prompt");
  expect(generic).not.toContain("/private/output/path");
});

test("MCP excludes automatic routers only from live image model choices", async () => {
  const responses: unknown[] = [];
  const sessions = {
    async read() {
      return {
        nexusOrigin: "http://localhost:3000",
        refreshToken: "refresh-token-with-sufficient-length",
        schema: "convax.nexus-refresh-grant/1",
        workspaceSlug: "convax",
      };
    },
    async write() {},
  } as unknown as NexusSessionStore;
  const server = new NexusMcpServer({
    client: {
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.pathname.endsWith("/auth/token")) {
          return Response.json({
            access_token: "access-token-with-sufficient-length",
            data_token: "data-token-with-sufficient-length",
            data_token_expires_at: "2026-07-27T08:10:00.000Z",
            expires_in: 900,
            refresh_token: "rotated-refresh-token-with-sufficient-length",
            token_type: "Bearer",
          });
        }
        if (url.pathname === "/user/v1/provider-connections") {
          return Response.json([
            {
              gatewayBaseUrl:
                "http://localhost:4000/providers/26010000-0000-4000-8000-000000000010",
              id: "26010000-0000-4000-8000-000000000010",
              name: "OpenRouter",
              protocolProfile: "openai-compatible",
              status: "ACTIVE",
              workspaceId: "26010000-0000-4000-8000-000000000003",
            },
          ]);
        }
        if (url.pathname.endsWith("/models")) {
          return Response.json({
            data: [
              {
                architecture: { output_modalities: ["image", "text"] },
                id: "openrouter/auto",
                name: "Auto Router",
              },
              {
                architecture: { output_modalities: ["image", "text"] },
                id: "openrouter/auto-beta",
                name: "Auto Router Beta",
              },
              {
                architecture: { output_modalities: ["image", "text"] },
                id: "openai/gpt-image-1",
                name: "GPT Image 1",
              },
            ],
          });
        }
        throw new Error(`Unexpected request: ${url.pathname}`);
      },
      now: () => new Date("2026-07-27T08:00:00.000Z"),
    },
    send: (value) => responses.push(value),
    sessions,
  });
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const input = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  const running = server.run(input);
  controller.enqueue(
    new TextEncoder().encode(
      `${JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" })}\n`,
    ),
  );
  for (let attempt = 0; attempt < 100 && responses.length === 0; attempt += 1) {
    await Bun.sleep(10);
  }

  expect(responses).toHaveLength(1);
  const response = responses[0] as {
    result: {
      tools: Array<{
        inputSchema: {
          properties: { model?: unknown };
        };
        name: string;
      }>;
    };
  };
  expect(
    response.result.tools.find(({ name }) => name === "image.generate")
      ?.inputSchema.properties.model,
  ).toEqual({
    oneOf: [{ const: "openai/gpt-image-1", title: "GPT Image 1" }],
    title: "Model",
    type: "string",
    "x-convax-role": "generation-model-id",
  });

  controller.enqueue(
    new TextEncoder().encode(
      `${JSON.stringify({
        id: 2,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {}, name: "llm.models.list" },
      })}\n`,
    ),
  );
  for (let attempt = 0; attempt < 100 && responses.length < 2; attempt += 1) {
    await Bun.sleep(10);
  }
  expect(responses).toHaveLength(2);
  expect(responses[1]).toMatchObject({
    id: 2,
    result: {
      structuredContent: {
        models: [
          { id: "openrouter/auto", name: "Auto Router" },
          { id: "openrouter/auto-beta", name: "Auto Router Beta" },
          { id: "openai/gpt-image-1", name: "GPT Image 1" },
        ],
        schema: "convax.llm-model-catalog/1",
      },
    },
  });

  await server.shutdown(1_000);
  await running;
});

test("image.generate returns bounded correlated HTTP diagnostics", async () => {
  const outputDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "convax-nexus-mcp-server-"),
  );
  const responses: unknown[] = [];
  const sessions = {
    async read() {
      return {
        nexusOrigin: "http://localhost:3000",
        refreshToken: "refresh-token-with-sufficient-length",
        schema: "convax.nexus-refresh-grant/1",
        workspaceSlug: "convax",
      };
    },
    async write() {},
  } as unknown as NexusSessionStore;
  const server = new NexusMcpServer({
    client: {
      fetch: async (input) => {
        const request = input instanceof Request ? input : new Request(input);
        const url = new URL(request.url);
        if (url.pathname.endsWith("/auth/token")) {
          return Response.json({
            access_token: "access-token-with-sufficient-length",
            data_token: "data-token-with-sufficient-length",
            data_token_expires_at: "2026-07-27T08:10:00.000Z",
            expires_in: 900,
            refresh_token: "rotated-refresh-token-with-sufficient-length",
            token_type: "Bearer",
          });
        }
        if (url.pathname === "/user/v1/provider-connections") {
          return Response.json([
            {
              gatewayBaseUrl:
                "http://localhost:4000/providers/26010000-0000-4000-8000-000000000010",
              id: "26010000-0000-4000-8000-000000000010",
              name: "OpenRouter",
              protocolProfile: "openai-compatible",
              status: "ACTIVE",
              workspaceId: "26010000-0000-4000-8000-000000000003",
            },
          ]);
        }
        if (url.pathname.endsWith("/models")) {
          return Response.json({
            data: [
              {
                architecture: { output_modalities: ["image", "text"] },
                id: "openai/gpt-image-1",
                name: "GPT Image 1",
              },
            ],
          });
        }
        if (url.pathname.endsWith("/chat/completions")) {
          return Response.json(
            {
              error: {
                code: "metering_unsupported",
                message:
                  "raw secret-token secret-prompt /private/output/path",
              },
            },
            {
              headers: { "x-nexus-request-id": "sk-or-v1-secret-token" },
              status: 409,
            },
          );
        }
        throw new Error(`Unexpected request: ${url.pathname}`);
      },
      now: () => new Date("2026-07-27T08:00:00.000Z"),
    },
    send: (value) => responses.push(value),
    sessions,
  });
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const input = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  const running = server.run(input);
  controller.enqueue(
    new TextEncoder().encode(
      `${JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            model: "openai/gpt-image-1",
            operation_id: "operation-123",
            output: "image",
            output_directory: outputDirectory,
            prompt: "secret-prompt",
            references: [],
            schema: "convax.generation-call/1",
          },
          name: "image.generate",
        },
      })}\n`,
    ),
  );
  for (let attempt = 0; attempt < 100 && responses.length === 0; attempt += 1) {
    await Bun.sleep(10);
  }

  expect(responses).toHaveLength(1);
  const serialized = JSON.stringify(responses[0]);
  expect(responses[0]).toMatchObject({
    result: {
      content: [
        {
          text: "Nexus rejected image generation (HTTP 409, code metering_unsupported, request id operation-123). This image route is not enabled for Nexus metering; contact Nexus support before trying again.",
          type: "text",
        },
      ],
      isError: true,
    },
  });
  expect(serialized).not.toContain("secret-token");
  expect(serialized).not.toContain("secret-prompt");
  expect(serialized).not.toContain("sk-or-v1-secret-token");
  expect(serialized).not.toContain("/private/output/path");

  await server.shutdown(1_000);
  await running;
  await fs.rm(outputDirectory, { force: true, recursive: true });
});
