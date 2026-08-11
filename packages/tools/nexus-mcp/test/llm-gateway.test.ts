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

  test("passes the OpenRouter model catalog query through without a companion-owned catalog", async () => {
    const requests: string[] = [];
    const upstream = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        requests.push(request.url);
        return Response.json({
          data: [
            {
              architecture: { output_modalities: ["text"] },
              id: "anthropic/claude-sonnet-4",
              name: "Claude Sonnet 4",
            },
          ],
        });
      },
    });
    servers.push(upstream);
    const gateway = new NexusLlmGateway({
      gatewayContext: async () => ({
        dataToken: "nxs-live-short-lived-data-token",
        provider: { gatewayBaseUrl: `http://127.0.0.1:${upstream.port}/providers/provider-id` },
      }),
    } as never);
    gateways.push(gateway);
    const descriptor = await gateway.start();
    const response = await fetch(`${descriptor.base_url}/models?output_modalities=text`, {
      headers: { authorization: `Bearer ${descriptor.api_key}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [{ architecture: { output_modalities: ["text"] }, id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" }],
    });
    expect(requests).toEqual([
      `http://127.0.0.1:${upstream.port}/providers/provider-id/models?output_modalities=text`,
    ]);
  });

  test("reports a safe gateway-context failure instead of hiding it", async () => {
    const gateway = new NexusLlmGateway({
      gatewayContext: async () => {
        throw new Error("The Convax Workspace has no active OpenRouter Provider");
      },
    } as never);
    gateways.push(gateway);
    const descriptor = await gateway.start();
    const response = await fetch(`${descriptor.base_url}/models`, {
      headers: { authorization: `Bearer ${descriptor.api_key}` },
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: {
        message:
          "Convax LLM gateway request failed: The Convax Workspace has no active OpenRouter Provider",
        type: "api_error",
      },
    });
  });

  test("redacts unsafe gateway-context details", async () => {
    const gateway = new NexusLlmGateway({
      gatewayContext: async () => {
        throw new Error(
          "Bearer nxs-secret-token failed at /private/provider/config",
        );
      },
    } as never);
    gateways.push(gateway);
    const descriptor = await gateway.start();
    const response = await fetch(`${descriptor.base_url}/models`, {
      headers: { authorization: `Bearer ${descriptor.api_key}` },
    });
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(502);
    expect(serialized).toContain("Convax LLM gateway request failed.");
    expect(serialized).not.toContain("nxs-secret-token");
    expect(serialized).not.toContain("/private/provider/config");
  });
});
