import { afterEach, describe, expect, test } from "bun:test";

import { NexusLlmGateway } from "../src/llm-gateway.ts";

const servers: Array<Bun.Server<unknown>> = [];
const gateways: NexusLlmGateway[] = [];
const testModelId = "deepseek/deepseek-v4-flash";

afterEach(() => {
  for (const gateway of gateways.splice(0)) gateway.close();
  for (const server of servers.splice(0)) server.stop(true);
});

describe("NexusLlmGateway", () => {
  test("forwards the opaque OpenRouter model and short-lived Data Token to Nexus", async () => {
    const upstreamRequests: Array<{
      authorization: string | null;
      body: unknown;
    }> = [];
    const upstream = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        upstreamRequests.push({
          authorization: request.headers.get("authorization"),
          body: await request.json(),
        });
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              index: 0,
              message: { content: "Nexus connected", role: "assistant" },
            },
          ],
          model: testModelId,
        });
      },
    });
    servers.push(upstream);
    const gateway = new NexusLlmGateway({
      gatewayContext: async () => ({
        dataToken: "nxs-live-short-lived-data-token",
        provider: {
          gatewayBaseUrl: `http://127.0.0.1:${upstream.port}/providers/provider-id`,
        },
      }),
    } as never);
    gateways.push(gateway);
    const descriptor = await gateway.start();
    const response = await fetch(`${descriptor.base_url}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${descriptor.api_key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ content: "Say connected", role: "user" }],
        model: testModelId,
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ model: testModelId });
    expect(upstreamRequests).toEqual([
      {
        authorization: "Bearer nxs-live-short-lived-data-token",
        body: {
          messages: [{ content: "Say connected", role: "user" }],
          model: testModelId,
        },
      },
    ]);
  });

  test("serves the current Nexus OpenRouter model catalog instead of a hard-coded model", async () => {
    const gateway = new NexusLlmGateway({
      models: async () => ({
        models: [
          { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
          {
            id: "deepseek/deepseek-v4-flash:free",
            name: "DeepSeek V4 Flash Free",
          },
        ],
        schema: "convax.llm-model-catalog/1",
      }),
    } as never);
    gateways.push(gateway);
    const descriptor = await gateway.start();
    const response = await fetch(`${descriptor.base_url}/models`, {
      headers: { authorization: `Bearer ${descriptor.api_key}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        {
          created: 0,
          id: "anthropic/claude-sonnet-4",
          name: "Claude Sonnet 4",
          object: "model",
          owned_by: "nexus-openrouter",
        },
        {
          created: 0,
          id: "deepseek/deepseek-v4-flash:free",
          name: "DeepSeek V4 Flash Free",
          object: "model",
          owned_by: "nexus-openrouter",
        },
      ],
      object: "list",
    });
  });
});
