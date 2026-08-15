import { afterEach, describe, expect, test } from "bun:test";

import { NexusLlmGateway } from "../src/llm-gateway.ts";

const gateways: NexusLlmGateway[] = [];
const servers: Array<Bun.Server<unknown>> = [];

afterEach(() => {
  for (const gateway of gateways.splice(0)) gateway.close();
  for (const server of servers.splice(0)) server.stop(true);
});

describe("Nexus LLM loopback Gateway", () => {
  test("proxies only OpenRouter models and text calls with the current AuthX token", async () => {
    const requests: Array<{
      authorization: string | null;
      body: unknown;
      method: string;
      path: string;
    }> = [];
    const upstream = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        requests.push({
          authorization: request.headers.get("authorization"),
          body: request.body ? await request.json() : undefined,
          method: request.method,
          path: `${url.pathname}${url.search}`,
        });
        if (url.pathname.endsWith("/models")) {
          return Response.json({
            data: [{ id: "fake/text-v1", name: "Fake Text" }],
          });
        }
        if (url.pathname.endsWith("/chat/completions")) {
          return Response.json({
            choices: [
              {
                finish_reason: "stop",
                index: 0,
                message: { content: "deterministic", role: "assistant" },
              },
            ],
            model: "fake/text-v1",
          });
        }
        return new Response("not found", { status: 404 });
      },
    });
    servers.push(upstream);
    const accessToken = "authx.application.access.token.with.sufficient.length";
    const gateway = new NexusLlmGateway({
      async gatewayContext() {
        return {
          accessToken,
          provider: {
            gatewayBaseUrl: `http://127.0.0.1:${upstream.port}/providers/provider-fixed`,
          },
        };
      },
    } as never);
    gateways.push(gateway);
    const descriptor = await gateway.start();
    const headers = { authorization: `Bearer ${descriptor.api_key}` };

    const models = await fetch(
      `${descriptor.base_url}/models?output_modalities=text`,
      { headers },
    );
    expect(models.status).toBe(200);
    expect(await models.json()).toEqual({
      data: [{ id: "fake/text-v1", name: "Fake Text" }],
    });

    const chat = await fetch(`${descriptor.base_url}/chat/completions`, {
      body: JSON.stringify({
        messages: [{ content: "Say deterministic", role: "user" }],
        model: "fake/text-v1",
      }),
      headers: { ...headers, "content-type": "application/json" },
      method: "POST",
    });
    expect(chat.status).toBe(200);
    expect(await chat.json()).toMatchObject({ model: "fake/text-v1" });
    expect(requests).toEqual([
      {
        authorization: `Bearer ${accessToken}`,
        body: undefined,
        method: "GET",
        path: "/providers/provider-fixed/models?output_modalities=text",
      },
      {
        authorization: `Bearer ${accessToken}`,
        body: {
          messages: [{ content: "Say deterministic", role: "user" }],
          model: "fake/text-v1",
        },
        method: "POST",
        path: "/providers/provider-fixed/chat/completions",
      },
    ]);

    const providerOverride = await fetch(
      `${descriptor.base_url}/chat/completions`,
      {
        body: JSON.stringify({
          messages: [{ content: "Do not route me", role: "user" }],
          model: "fake/text-v1",
          provider: { order: ["attacker-controlled"] },
        }),
        headers: { ...headers, "content-type": "application/json" },
        method: "POST",
      },
    );
    expect(providerOverride.status).toBe(400);
    expect(JSON.stringify(await providerOverride.json())).toContain(
      "controlled by Nexus",
    );
    expect(requests).toHaveLength(2);

    const arbitraryPath = await fetch(`${descriptor.base_url}/credits`, {
      headers,
    });
    expect(arbitraryPath.status).toBe(404);
    expect(requests).toHaveLength(2);
  });
});
