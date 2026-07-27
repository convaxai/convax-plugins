import { expect, test } from "bun:test";

import {
  imageGenerationTool,
  NexusMcpServer,
  tools,
} from "../src/mcp-server.ts";
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
  });
});

test("the first tools/list response includes live image model choices", async () => {
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
  });

  await server.shutdown(1_000);
  await running;
});
