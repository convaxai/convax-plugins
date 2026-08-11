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

const fixedToolNames = [
  "service.status",
  "service.authorize",
  "service.reauthorize",
  "service.authorization.complete",
  "service.authorization.cancel",
  "service.sign_out",
  "service.checkout",
  "llm.gateway.start",
] as const;

async function listedToolNames(
  imageModelCatalogResponse: () => Response,
  videoModelCatalogResponse: () => Response = () =>
    Response.json({ data: [] }),
): Promise<readonly string[]> {
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
        if (url.pathname === "/api/v1/user/provider-connections") {
          return Response.json([
            {
              gatewayBaseUrl:
                "http://localhost:4000/providers/26010000-0000-4000-8000-000000000010",
              id: "26010000-0000-4000-8000-000000000010",
              name: "OpenRouter",
              protocolProfile: "openrouter",
              status: "ACTIVE",
              workspaceId: "26010000-0000-4000-8000-000000000003",
            },
          ]);
        }
        if (url.pathname.endsWith("/images/models")) {
          return imageModelCatalogResponse();
        }
        if (url.pathname.endsWith("/videos/models")) {
          return videoModelCatalogResponse();
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
  await server.shutdown(1_000);
  await running;

  expect(responses).toHaveLength(1);
  const response = responses[0] as {
    result: { tools: Array<{ name: string }> };
  };
  return response.result.tools.map(({ name }) => name);
}

test("Nexus companion keeps only fixed Service and LLM tools without a live image catalog", () => {
  expect(tools.map(({ name }) => name)).toEqual([...fixedToolNames]);
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

test("Nexus image generation rejects unbounded model catalogs", () => {
  expect(() => imageGenerationTool([])).toThrow(
    "Nexus image model catalog is outside the bounded choice limit",
  );
  expect(() =>
    imageGenerationTool(
      Array.from({ length: 65 }, (_, index) => ({
        id: `vendor/image-${index}`,
        name: `Image ${index}`,
      })),
    ),
  ).toThrow("Nexus image model catalog is outside the bounded choice limit");
});

test("tools/list hides image generation when the image catalog request fails", async () => {
  expect(
    await listedToolNames(() => new Response("Unavailable", { status: 503 })),
  ).toEqual(fixedToolNames);
});

test("tools/list hides image generation when the live catalog has no image models", async () => {
  expect(
    await listedToolNames(() =>
      Response.json({
        data: [
          {
            architecture: { output_modalities: ["text"] },
            id: "openai/text-model",
            name: "Text Model",
          },
        ],
      }),
    ),
  ).toEqual(fixedToolNames);
});

test("tools/list hides image generation when the live image catalog exceeds 64 choices", async () => {
  expect(
    await listedToolNames(() =>
      Response.json({
        data: Array.from({ length: 65 }, (_, index) => ({
          architecture: { output_modalities: ["image", "text"] },
          id: `vendor/image-${index}`,
          name: `Image ${index}`,
        })),
      }),
    ),
  ).toEqual(fixedToolNames);
});

test("Nexus image diagnostics expose only typed bounded HTTP fields", () => {
  expect(
    publicImageGenerationErrorMessage(
      new NexusImageHttpError(
        409,
        "operation-123",
        {
          code: "metering_unsupported",
          message: "Image generation is not enabled for this Provider.",
          requestId: "gateway-request-123",
        },
      ),
    ),
  ).toBe(
    "Convax image generation failed (HTTP 409, code metering_unsupported, request id gateway-request-123, operation id operation-123): Image generation is not enabled for this Provider.",
  );
  const generic = publicImageGenerationErrorMessage(
    new Error("raw secret-token secret-prompt /private/output/path"),
  );
  expect(generic).toBe(
    "Convax image generation failed.",
  );
  expect(generic).not.toContain("secret-token");
  expect(generic).not.toContain("secret-prompt");
  expect(generic).not.toContain("/private/output/path");
});

test("MCP excludes automatic routers and admits every concrete image-output model", async () => {
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
        if (url.pathname === "/api/v1/user/provider-connections") {
          return Response.json([
            {
              gatewayBaseUrl:
                "http://localhost:4000/providers/26010000-0000-4000-8000-000000000010",
              id: "26010000-0000-4000-8000-000000000010",
              name: "OpenRouter",
              protocolProfile: "openrouter",
              status: "ACTIVE",
              workspaceId: "26010000-0000-4000-8000-000000000003",
            },
          ]);
        }
        if (url.pathname.endsWith("/images/models")) {
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
              {
                architecture: { output_modalities: ["image"] },
                id: "black-forest-labs/flux.2-flex",
                name: "FLUX.2 Flex",
              },
            ],
          });
        }
        if (url.pathname.endsWith("/videos/models")) {
          return Response.json({
            data: [{ id: "google/veo-3.1", name: "Google: Veo 3.1" }],
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
    oneOf: [
      { const: "black-forest-labs/flux.2-flex", title: "FLUX.2 Flex" },
      { const: "openai/gpt-image-1", title: "GPT Image 1" },
    ],
    title: "Model",
    type: "string",
    "x-convax-role": "generation-model-id",
  });
  expect(
    response.result.tools.find(({ name }) => name === "video.generate")
      ?.inputSchema.properties.model,
  ).toEqual({
    oneOf: [{ const: "google/veo-3.1", title: "Google: Veo 3.1" }],
    title: "Model",
    type: "string",
    "x-convax-role": "generation-model-id",
  });

  await server.shutdown(1_000);
  await running;
});

test("image.generate never refreshes a missing route inside tools/call", async () => {
  const responses: unknown[] = [];
  let networkRequests = 0;
  const server = new NexusMcpServer({
    client: {
      fetch: async () => {
        networkRequests += 1;
        throw new Error("Unexpected network request");
      },
    },
    send: (value) => responses.push(value),
    sessions: {
      async read() {
        return null;
      },
      async write() {},
    } as unknown as NexusSessionStore,
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
            operation_id: "operation-without-route",
            output: "image",
            output_directory: os.tmpdir(),
            prompt: "Draw a circle.",
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

  expect(networkRequests).toBe(0);
  expect(responses).toHaveLength(1);
  expect(responses[0]).toMatchObject({
    result: { isError: true },
  });

  await server.shutdown(1_000);
  await running;
});

test("image.generate reuses the route loaded by tools/list", async () => {
  const outputDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "convax-nexus-mcp-route-"),
  );
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const requests = {
    completions: 0,
    models: 0,
    providers: 0,
    tokens: 0,
  };
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
          requests.tokens += 1;
          return Response.json({
            access_token: "access-token-with-sufficient-length",
            data_token: "data-token-with-sufficient-length",
            data_token_expires_at: "2026-07-27T08:10:00.000Z",
            expires_in: 900,
            refresh_token: "rotated-refresh-token-with-sufficient-length",
            token_type: "Bearer",
          });
        }
        if (url.pathname === "/api/v1/user/provider-connections") {
          requests.providers += 1;
          return Response.json([
            {
              gatewayBaseUrl:
                "http://localhost:4000/providers/26010000-0000-4000-8000-000000000010",
              id: "26010000-0000-4000-8000-000000000010",
              name: "OpenRouter",
              protocolProfile: "openrouter",
              status: "ACTIVE",
              workspaceId: "26010000-0000-4000-8000-000000000003",
            },
          ]);
        }
        if (url.pathname.endsWith("/images/models")) {
          requests.models += 1;
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
        if (url.pathname.endsWith("/videos/models")) {
          requests.models += 1;
          return Response.json({ data: [] });
        }
        if (url.pathname.endsWith("/images")) {
          requests.completions += 1;
          return Response.json({
            data: [
              {
                b64_json: png.toString("base64"),
                media_type: "image/png",
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

  try {
    controller.enqueue(
      new TextEncoder().encode(
        `${JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" })}\n`,
      ),
    );
    for (let attempt = 0; attempt < 100 && responses.length < 1; attempt += 1) {
      await Bun.sleep(10);
    }
    expect(responses).toHaveLength(1);
    const listed = responses[0] as {
      result: { tools: Array<{ name: string }> };
    };
    expect(
      listed.result.tools.some(({ name }) => name === "image.generate"),
    ).toBe(true);

    controller.enqueue(
      new TextEncoder().encode(
        `${JSON.stringify({
          id: 2,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: {
              model: "openai/gpt-image-1",
              operation_id: "operation-route-123",
              output: "image",
              output_directory: outputDirectory,
              prompt: "Draw a small blue circle.",
              references: [],
              schema: "convax.generation-call/1",
            },
            name: "image.generate",
          },
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
          artifacts: [
            {
              mimeType: "image/png",
              name: "nexus-operation-route-123-1.png",
              path: "nexus-operation-route-123-1.png",
            },
          ],
        },
      },
    });
    expect(
      await fs.readFile(
        path.join(outputDirectory, "nexus-operation-route-123-1.png"),
      ),
    ).toEqual(png);
    expect(requests).toEqual({
      completions: 1,
      models: 2,
      providers: 1,
      tokens: 1,
    });
  } finally {
    await server.shutdown(1_000);
    await running;
    await fs.rm(outputDirectory, { force: true, recursive: true });
  }
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
        if (url.pathname === "/api/v1/user/provider-connections") {
          return Response.json([
            {
              gatewayBaseUrl:
                "http://localhost:4000/providers/26010000-0000-4000-8000-000000000010",
              id: "26010000-0000-4000-8000-000000000010",
              name: "OpenRouter",
              protocolProfile: "openrouter",
              status: "ACTIVE",
              workspaceId: "26010000-0000-4000-8000-000000000003",
            },
          ]);
        }
        if (url.pathname.endsWith("/images/models")) {
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
        if (url.pathname.endsWith("/videos/models")) {
          return Response.json({ data: [] });
        }
        if (url.pathname.endsWith("/images")) {
          return Response.json(
            {
              error: {
                code: "metering_unsupported",
                message: "raw secret-token secret-prompt /private/output/path",
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
      `${JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" })}\n`,
    ),
  );
  for (let attempt = 0; attempt < 100 && responses.length < 1; attempt += 1) {
    await Bun.sleep(10);
  }
  controller.enqueue(
    new TextEncoder().encode(
      `${JSON.stringify({
        id: 2,
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
  for (let attempt = 0; attempt < 100 && responses.length < 2; attempt += 1) {
    await Bun.sleep(10);
  }

  expect(responses).toHaveLength(2);
  const serialized = JSON.stringify(responses[1]);
  expect(responses[1]).toMatchObject({
    result: {
      content: [
        {
          text: "Convax image generation failed (HTTP 409, code metering_unsupported, operation id operation-123).",
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

test("service.sign_out invalidates a prepared image route before revoke completes", async () => {
  const responses: unknown[] = [];
  let completions = 0;
  let revokeStarted = false;
  let resolveRevoke!: (response: Response) => void;
  const revokeResponse = new Promise<Response>((resolve) => {
    resolveRevoke = resolve;
  });
  const sessions = {
    async clear() {},
    async read() {
      return {
        nexusOrigin: "http://localhost:3000",
        refreshToken: "refresh-token-for-sign-out-race",
        schema: "convax.nexus-refresh-grant/1",
        workspaceSlug: "convax",
      };
    },
    async write() {},
  } as unknown as NexusSessionStore;
  const server = new NexusMcpServer({
    checkouts: {
      async clear() {},
    } as never,
    client: {
      fetch: async (input) => {
        const request = input instanceof Request ? input : new Request(input);
        const url = new URL(request.url);
        if (url.pathname.endsWith("/auth/token")) {
          return Response.json({
            access_token: "access-token-for-sign-out-race",
            data_token: "data-token-for-sign-out-race",
            data_token_expires_at: "2026-07-27T08:10:00.000Z",
            expires_in: 900,
            refresh_token: "rotated-refresh-token-for-sign-out-race",
            token_type: "Bearer",
          });
        }
        if (url.pathname === "/api/v1/user/provider-connections") {
          return Response.json([
            {
              gatewayBaseUrl:
                "http://localhost:4000/providers/26010000-0000-4000-8000-000000000010",
              id: "26010000-0000-4000-8000-000000000010",
              name: "OpenRouter",
              protocolProfile: "openrouter",
              status: "ACTIVE",
              workspaceId: "26010000-0000-4000-8000-000000000003",
            },
          ]);
        }
        if (url.pathname.endsWith("/images/models")) {
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
        if (url.pathname.endsWith("/videos/models")) {
          return Response.json({ data: [] });
        }
        if (url.pathname.endsWith("/auth/revoke")) {
          revokeStarted = true;
          return revokeResponse;
        }
        if (url.pathname.endsWith("/images")) {
          completions += 1;
          throw new Error("Image completion must not start after sign-out");
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

  try {
    controller.enqueue(
      new TextEncoder().encode(
        `${JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" })}\n`,
      ),
    );
    for (let attempt = 0; attempt < 100 && responses.length < 1; attempt += 1) {
      await Bun.sleep(10);
    }
    expect(responses).toHaveLength(1);
    expect(
      (
        responses[0] as {
          result: { tools: Array<{ name: string }> };
        }
      ).result.tools.some(({ name }) => name === "image.generate"),
    ).toBe(true);

    controller.enqueue(
      new TextEncoder().encode(
        `${JSON.stringify({
          id: 2,
          jsonrpc: "2.0",
          method: "tools/call",
          params: { arguments: {}, name: "service.sign_out" },
        })}\n`,
      ),
    );
    for (let attempt = 0; attempt < 100 && !revokeStarted; attempt += 1) {
      await Bun.sleep(10);
    }
    expect(revokeStarted).toBe(true);

    controller.enqueue(
      new TextEncoder().encode(
        `${JSON.stringify({
          id: 3,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: {
              model: "openai/gpt-image-1",
              operation_id: "operation-after-sign-out",
              output: "image",
              output_directory: os.tmpdir(),
              prompt: "This request must remain local.",
              references: [],
              schema: "convax.generation-call/1",
            },
            name: "image.generate",
          },
        })}\n`,
      ),
    );
    for (
      let attempt = 0;
      attempt < 100 &&
      !responses.some((response) => (response as { id?: unknown }).id === 3);
      attempt += 1
    ) {
      await Bun.sleep(10);
    }
    expect(completions).toBe(0);
    expect(
      responses.find((response) => (response as { id?: unknown }).id === 3),
    ).toMatchObject({
      id: 3,
      result: { isError: true },
    });
    expect(
      responses.some((response) => (response as { id?: unknown }).id === 2),
    ).toBe(false);

    resolveRevoke(new Response(null, { status: 204 }));
    for (
      let attempt = 0;
      attempt < 100 &&
      !responses.some((response) => (response as { id?: unknown }).id === 2);
      attempt += 1
    ) {
      await Bun.sleep(10);
    }
    expect(
      responses.find((response) => (response as { id?: unknown }).id === 2),
    ).toMatchObject({
      id: 2,
      result: {
        structuredContent: {
          credential: { configured: false },
          state: "disconnected",
        },
      },
    });
    const serialized = JSON.stringify(responses);
    expect(serialized).not.toContain("access-token-for-sign-out-race");
    expect(serialized).not.toContain("data-token-for-sign-out-race");
    expect(serialized).not.toContain("refresh-token-for-sign-out-race");
  } finally {
    resolveRevoke(new Response(null, { status: 204 }));
    await server.shutdown(1_000);
    await running;
  }
});

test("service.sign_out keeps a stale pending image catalog hidden", async () => {
  const responses: unknown[] = [];
  let modelsStarted = false;
  let resolveModels!: (response: Response) => void;
  const modelsResponse = new Promise<Response>((resolve) => {
    resolveModels = resolve;
  });
  const sessions = {
    async clear() {},
    async read() {
      return {
        nexusOrigin: "http://localhost:3000",
        refreshToken: "refresh-token-for-stale-catalog",
        schema: "convax.nexus-refresh-grant/1",
        workspaceSlug: "convax",
      };
    },
    async write() {},
  } as unknown as NexusSessionStore;
  const server = new NexusMcpServer({
    checkouts: {
      async clear() {},
    } as never,
    client: {
      fetch: async (input) => {
        const request = input instanceof Request ? input : new Request(input);
        const url = new URL(request.url);
        if (url.pathname.endsWith("/auth/token")) {
          return Response.json({
            access_token: "access-token-for-stale-catalog",
            data_token: "data-token-for-stale-catalog",
            data_token_expires_at: "2026-07-27T08:10:00.000Z",
            expires_in: 900,
            refresh_token: "rotated-refresh-token-for-stale-catalog",
            token_type: "Bearer",
          });
        }
        if (url.pathname === "/api/v1/user/provider-connections") {
          return Response.json([
            {
              gatewayBaseUrl:
                "http://localhost:4000/providers/26010000-0000-4000-8000-000000000010",
              id: "26010000-0000-4000-8000-000000000010",
              name: "OpenRouter",
              protocolProfile: "openrouter",
              status: "ACTIVE",
              workspaceId: "26010000-0000-4000-8000-000000000003",
            },
          ]);
        }
        if (url.pathname.endsWith("/images/models")) {
          modelsStarted = true;
          return modelsResponse;
        }
        if (url.pathname.endsWith("/videos/models")) {
          return Response.json({ data: [] });
        }
        if (url.pathname.endsWith("/auth/revoke")) {
          return new Response(null, { status: 204 });
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

  try {
    controller.enqueue(
      new TextEncoder().encode(
        `${JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" })}\n`,
      ),
    );
    for (let attempt = 0; attempt < 100 && !modelsStarted; attempt += 1) {
      await Bun.sleep(10);
    }
    expect(modelsStarted).toBe(true);
    expect(responses).toHaveLength(0);

    controller.enqueue(
      new TextEncoder().encode(
        `${JSON.stringify({
          id: 2,
          jsonrpc: "2.0",
          method: "tools/call",
          params: { arguments: {}, name: "service.sign_out" },
        })}\n`,
      ),
    );
    for (
      let attempt = 0;
      attempt < 100 &&
      !responses.some((response) => (response as { id?: unknown }).id === 2);
      attempt += 1
    ) {
      await Bun.sleep(10);
    }
    expect(
      responses.some((response) => (response as { id?: unknown }).id === 1),
    ).toBe(false);

    resolveModels(
      Response.json({
        data: [
          {
            architecture: { output_modalities: ["image", "text"] },
            id: "openai/gpt-image-1",
            name: "GPT Image 1",
          },
        ],
      }),
    );
    for (
      let attempt = 0;
      attempt < 100 &&
      !responses.some((response) => (response as { id?: unknown }).id === 1);
      attempt += 1
    ) {
      await Bun.sleep(10);
    }

    const listed = responses.find(
      (response) => (response as { id?: unknown }).id === 1,
    ) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(listed.result.tools.map(({ name }) => name)).toEqual([
      ...fixedToolNames,
    ]);
    const serialized = JSON.stringify(responses);
    expect(serialized).not.toContain("access-token-for-stale-catalog");
    expect(serialized).not.toContain("data-token-for-stale-catalog");
    expect(serialized).not.toContain("refresh-token-for-stale-catalog");
  } finally {
    resolveModels(new Response("Unavailable", { status: 503 }));
    await server.shutdown(1_000);
    await running;
  }
});
