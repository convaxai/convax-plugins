import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  NexusClient,
  NexusImageHttpError,
} from "../src/nexus-client.ts";
import { NexusSessionStore } from "../src/session-store.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("NexusClient", () => {
  test("reads the composite Plan status and creates Checkout with only Plan key and an idempotency header", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-client-"),
    );
    roots.push(root);
    const sessions = new NexusSessionStore({ XDG_CONFIG_HOME: root });
    await sessions.write({
      nexusOrigin: "http://localhost:3000",
      refreshToken: "original-refresh-token-value",
      schema: "convax.nexus-refresh-grant/1",
      workspaceSlug: "convax",
    });
    const checkoutRequests: Array<{
      body: unknown;
      idempotencyKey: string | null;
    }> = [];
    const client = new NexusClient(sessions, {
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.pathname.endsWith("/auth/token")) {
          return Response.json({
            access_token: "fresh-access-token-with-sufficient-length",
            data_token: "fresh-data-token-with-sufficient-length",
            data_token_expires_at: "2026-07-26T08:10:00.000Z",
            expires_in: 900,
            refresh_token: "rotated-refresh-token-with-sufficient-length",
            token_type: "Bearer",
          });
        }
        if (url.pathname === "/api/v1/user/me/access") {
          return Response.json({
            subject: "pairwise-subject",
            workspace: {
              id: "26010000-0000-4000-8000-000000000003",
              slug: "convax",
              name: "Convax",
            },
            access: {
              id: "26010000-0000-4000-8000-000000000005",
              planId: "26010000-0000-4000-8000-000000000004",
              status: "ACTIVE",
              accessStartsAt: "2026-07-26T08:00:00.000Z",
            },
            plan: {
              id: "26010000-0000-4000-8000-000000000004",
              key: "free",
              name: "Free",
              billingInterval: "MONTH",
            },
            quota: {
              budgetUsd: "1.000000",
              reservedUsd: "0.000000",
              consumedUsd: "0.001200",
              availableUsd: "0.998800",
              availableUnits: "998800",
              consumedUnits: "1200",
              periodEnd: "2026-08-26T08:00:00.000Z",
            },
            billing: {
              checkoutAvailable: true,
              availablePlans: [
                {
                  id: "26010000-0000-4000-8000-000000000006",
                  key: "pro",
                  name: "Pro",
                  billingInterval: "MONTH",
                },
              ],
            },
          });
        }
        if (url.pathname === "/api/v1/user/billing-checkouts") {
          checkoutRequests.push({
            body: JSON.parse(String(init?.body)),
            idempotencyKey: new Headers(init?.headers).get("idempotency-key"),
          });
          return Response.json({
            checkoutId: "26010000-0000-4000-8000-000000000009",
            externalUrl: "https://checkout.creem.test/session/hosted-user",
            status: "CREATED",
          });
        }
        throw new Error(`Unexpected request: ${url.pathname}`);
      },
      now: () => new Date("2026-07-26T08:00:00.000Z"),
    });

    const access = await client.access();
    expect(access.plan?.name).toBe("Free");
    expect(access.quota).toMatchObject({
      budgetUsd: "1.000000",
      consumedUsd: "0.001200",
      availableUsd: "0.998800",
    });
    expect(access.billing?.availablePlans.map(({ key }) => key)).toEqual([
      "pro",
    ]);
    expect(
      await client.createCheckout("pro", "checkout_attempt_12345678"),
    ).toEqual({
      browserUrl: "https://checkout.creem.test/session/hosted-user",
      checkoutId: "26010000-0000-4000-8000-000000000009",
      status: "CREATED",
    });
    expect(checkoutRequests).toEqual([
      {
        body: { planKey: "pro" },
        idempotencyKey: "checkout_attempt_12345678",
      },
    ]);
  });

  test("opens QR Checkouts in the trusted Nexus Account Portal", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-client-"),
    );
    roots.push(root);
    const sessions = new NexusSessionStore({ XDG_CONFIG_HOME: root });
    await sessions.write({
      nexusOrigin: "https://nexus.microvoid.io",
      refreshToken: "original-refresh-token-value",
      schema: "convax.nexus-refresh-grant/1",
      workspaceSlug: "convax",
    });
    const client = new NexusClient(sessions, {
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.pathname.endsWith("/auth/token")) {
          return Response.json({
            access_token: "fresh-access-token-with-sufficient-length",
            data_token: "fresh-data-token-with-sufficient-length",
            data_token_expires_at: "2026-07-26T08:10:00.000Z",
            expires_in: 900,
            refresh_token: "rotated-refresh-token-with-sufficient-length",
            token_type: "Bearer",
          });
        }
        if (url.pathname === "/api/v1/user/billing-checkouts") {
          return Response.json({
            action: {
              codeUrl: "weixin://wxpay/bizpayurl?pr=test",
              kind: "QR_CODE",
            },
            checkoutId: "26010000-0000-4000-8000-000000000009",
            status: "CREATED",
          });
        }
        throw new Error(`Unexpected request: ${url.pathname}`);
      },
      now: () => new Date("2026-07-26T08:00:00.000Z"),
    });

    expect(
      await client.createCheckout("pro", "checkout_attempt_12345678"),
    ).toEqual({
      browserUrl:
        "https://nexus.microvoid.io/workspace/convax/account/subscription?checkout=26010000-0000-4000-8000-000000000009&source=convax-plugin",
      checkoutId: "26010000-0000-4000-8000-000000000009",
      status: "CREATED",
    });
  });

  test("accepts the deployed base Access shape and reads Quota from its dedicated endpoint", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-client-"),
    );
    roots.push(root);
    const sessions = new NexusSessionStore({ XDG_CONFIG_HOME: root });
    await sessions.write({
      nexusOrigin: "http://localhost:3000",
      refreshToken: "original-refresh-token-value",
      schema: "convax.nexus-refresh-grant/1",
      workspaceSlug: "convax",
    });
    const client = new NexusClient(sessions, {
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.pathname.endsWith("/auth/token")) {
          return Response.json({
            access_token: "fresh-access-token-with-sufficient-length",
            data_token: "fresh-data-token-with-sufficient-length",
            data_token_expires_at: "2026-07-26T08:10:00.000Z",
            expires_in: 900,
            refresh_token: "rotated-refresh-token-with-sufficient-length",
            token_type: "Bearer",
          });
        }
        if (url.pathname === "/api/v1/user/me/access") {
          return Response.json({
            subject: "pairwise-subject",
            workspace: {
              id: "26010000-0000-4000-8000-000000000003",
              slug: "convax",
              name: "Convax",
            },
            access: {
              id: "26010000-0000-4000-8000-000000000005",
              planId: "26010000-0000-4000-8000-000000000004",
              status: "ACTIVE",
              accessStartsAt: "2026-07-26T08:00:00.000Z",
            },
          });
        }
        if (url.pathname === "/api/v1/user/me/quota") {
          return Response.json({
            availableUnits: "998800",
            consumedUnits: "1200",
            periodEnd: "2026-08-26T08:00:00.000Z",
          });
        }
        throw new Error(`Unexpected request: ${url.pathname}`);
      },
      now: () => new Date("2026-07-26T08:00:00.000Z"),
    });

    expect(await client.access()).toMatchObject({
      access: { status: "ACTIVE" },
      workspace: { name: "Convax", slug: "convax" },
    });
    expect(await client.access()).not.toHaveProperty("plan");
    expect(await client.access()).not.toHaveProperty("billing");
    expect(await client.quota()).toEqual({
      availableUnits: "998800",
      consumedUnits: "1200",
      periodEnd: "2026-08-26T08:00:00.000Z",
    });
  });

  test("rotates an expired refresh grant and resolves the Workspace OpenRouter gateway without exposing its key", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-client-"),
    );
    roots.push(root);
    const sessions = new NexusSessionStore({ XDG_CONFIG_HOME: root });
    await sessions.write({
      nexusOrigin: "http://localhost:3000",
      refreshToken: "original-refresh-token-value",
      schema: "convax.nexus-refresh-grant/1",
      workspaceSlug: "convax",
    });
    const requests: Array<{
      authorization: string | undefined;
      body: unknown;
      pathname: string;
    }> = [];
    const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      const headers = new Headers(init?.headers);
      requests.push({
        authorization: headers.get("authorization") ?? undefined,
        body,
        pathname: url.pathname,
      });
      if (url.pathname.endsWith("/auth/token")) {
        return Response.json({
          access_token: "fresh-access-token-with-sufficient-length",
          data_token: "fresh-data-token-with-sufficient-length",
          data_token_expires_at: "2026-07-26T08:10:00.000Z",
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
            protocolProfile: "openai-compatible",
            status: "ACTIVE",
            workspaceId: "26010000-0000-4000-8000-000000000003",
          },
        ]);
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    };
    const client = new NexusClient(sessions, {
      fetch: fakeFetch,
      now: () => new Date("2026-07-26T08:00:00.000Z"),
    });

    const context = await client.gatewayContext();
    expect(context.dataToken).toBe("fresh-data-token-with-sufficient-length");
    expect(context.provider.name).toBe("OpenRouter");
    expect(requests[0]).toMatchObject({
      body: {
        grantType: "refresh_token",
        refreshToken: "original-refresh-token-value",
      },
      pathname: "/api/v1/workspace/convax/auth/token",
    });
    expect(requests[1]).toMatchObject({
      authorization: "Bearer fresh-access-token-with-sufficient-length",
      pathname: "/api/v1/user/provider-connections",
    });
    expect((await sessions.read())?.refreshToken).toBe(
      "rotated-refresh-token-with-sufficient-length",
    );
  });

  test("single-flights concurrent refreshes and persists only the rotated grant", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-client-"),
    );
    roots.push(root);
    const sessions = new NexusSessionStore({ XDG_CONFIG_HOME: root });
    await sessions.write({
      nexusOrigin: "http://localhost:3000",
      refreshToken: "original-refresh-token-value",
      schema: "convax.nexus-refresh-grant/1",
      workspaceSlug: "convax",
    });
    let tokenRequests = 0;
    const client = new NexusClient(sessions, {
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (!url.pathname.endsWith("/auth/token"))
          throw new Error(`Unexpected request: ${url.pathname}`);
        tokenRequests += 1;
        await Promise.resolve();
        expect(JSON.parse(String(init?.body))).toEqual({
          grantType: "refresh_token",
          refreshToken: "original-refresh-token-value",
        });
        return Response.json({
          access_token: "fresh-access-token-with-sufficient-length",
          data_token: "fresh-data-token-with-sufficient-length",
          data_token_expires_at: "2026-07-26T08:10:00.000Z",
          expires_in: 900,
          refresh_token: "rotated-refresh-token-with-sufficient-length",
          token_type: "Bearer",
        });
      },
      now: () => new Date("2026-07-26T08:00:00.000Z"),
    });

    const [first, second, third] = await Promise.all([
      client.ensureAccessSession(),
      client.ensureAccessSession(),
      client.ensureAccessSession(),
    ]);
    expect(tokenRequests).toBe(1);
    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(await sessions.read()).toEqual({
      nexusOrigin: "http://localhost:3000",
      refreshToken: "rotated-refresh-token-with-sufficient-length",
      schema: "convax.nexus-refresh-grant/1",
      workspaceSlug: "convax",
    });
  });

  test("uses versioned Hosted API routes when refreshing data access and signing out", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-client-"),
    );
    roots.push(root);
    const sessions = new NexusSessionStore({ XDG_CONFIG_HOME: root });
    await sessions.write({
      nexusOrigin: "http://localhost:3000",
      refreshToken: "original-refresh-token-value",
      schema: "convax.nexus-refresh-grant/1",
      workspaceSlug: "convax",
    });
    const requests: Array<{ method: string; pathname: string }> = [];
    const client = new NexusClient(sessions, {
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        requests.push({
          method: init?.method ?? "GET",
          pathname: url.pathname,
        });
        if (url.pathname.endsWith("/auth/token")) {
          return Response.json({
            access_token: "fresh-access-token-with-sufficient-length",
            data_token: "expired-data-token-with-sufficient-length",
            data_token_expires_at: "2026-07-26T08:00:01.000Z",
            expires_in: 900,
            refresh_token: "rotated-refresh-token-with-sufficient-length",
            token_type: "Bearer",
          });
        }
        if (url.pathname === "/api/v1/user/data-tokens") {
          return Response.json({
            data_token: "refreshed-data-token-with-sufficient-length",
            expires_at: "2026-07-26T08:10:00.000Z",
          });
        }
        if (url.pathname.endsWith("/auth/revoke")) {
          return new Response(null, { status: 204 });
        }
        throw new Error(`Unexpected request: ${url.pathname}`);
      },
      now: () => new Date("2026-07-26T08:00:00.000Z"),
    });

    expect((await client.ensureDataSession()).dataToken).toBe(
      "refreshed-data-token-with-sufficient-length",
    );
    await client.signOut();

    expect(requests).toEqual([
      {
        method: "POST",
        pathname: "/api/v1/workspace/convax/auth/token",
      },
      { method: "POST", pathname: "/api/v1/user/data-tokens" },
      {
        method: "POST",
        pathname: "/api/v1/workspace/convax/auth/revoke",
      },
    ]);
    expect(await sessions.read()).toBeNull();
  });

  test("keeps automatic routers in the LLM catalog but excludes them from image models", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-client-"),
    );
    roots.push(root);
    const sessions = new NexusSessionStore({ XDG_CONFIG_HOME: root });
    await sessions.write({
      nexusOrigin: "http://localhost:3000",
      refreshToken: "original-refresh-token-value",
      schema: "convax.nexus-refresh-grant/1",
      workspaceSlug: "convax",
    });
    const requests: Array<{
      authorization: string | undefined;
      pathname: string;
      search: string;
    }> = [];
    const client = new NexusClient(sessions, {
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        requests.push({
          authorization:
            new Headers(init?.headers).get("authorization") ?? undefined,
          pathname: url.pathname,
          search: url.search,
        });
        if (url.pathname.endsWith("/auth/token")) {
          return Response.json({
            access_token: "fresh-access-token-with-sufficient-length",
            data_token: "fresh-data-token-with-sufficient-length",
            data_token_expires_at: "2026-07-26T08:10:00.000Z",
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
              protocolProfile: "openai-compatible",
              status: "ACTIVE",
              workspaceId: "26010000-0000-4000-8000-000000000003",
            },
          ]);
        }
        if (
          url.pathname.endsWith(
            "/providers/26010000-0000-4000-8000-000000000010/models",
          )
        ) {
          return Response.json({
            data: [
              {
                architecture: { output_modalities: ["text"] },
                id: "~openai/gpt-latest",
                name: "OpenAI GPT Latest",
              },
              {
                architecture: { output_modalities: ["text"] },
                id: "deepseek/deepseek-v4-flash:free",
                name: "DeepSeek V4 Flash Free",
              },
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
      now: () => new Date("2026-07-26T08:00:00.000Z"),
    });

    expect(await client.models()).toEqual({
      models: [
        { id: "~openai/gpt-latest", name: "OpenAI GPT Latest" },
        {
          id: "deepseek/deepseek-v4-flash:free",
          name: "DeepSeek V4 Flash Free",
        },
        { id: "openrouter/auto", name: "Auto Router" },
        { id: "openrouter/auto-beta", name: "Auto Router Beta" },
        { id: "openai/gpt-image-1", name: "GPT Image 1" },
      ],
      schema: "convax.llm-model-catalog/1",
    });
    expect(requests.at(-1)).toEqual({
      authorization: "Bearer fresh-data-token-with-sufficient-length",
      pathname: "/providers/26010000-0000-4000-8000-000000000010/models",
      search: "?output_modalities=all",
    });
    expect(await client.imageModels()).toEqual([
      {
        id: "openai/gpt-image-1",
        name: "GPT Image 1",
        outputModalities: ["image", "text"],
      },
    ]);
  });

  test("correlates image requests and exposes only bounded HTTP diagnostics", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-client-"),
    );
    roots.push(root);
    const sessions = new NexusSessionStore({ XDG_CONFIG_HOME: root });
    await sessions.write({
      nexusOrigin: "http://localhost:3000",
      refreshToken: "original-refresh-token-value",
      schema: "convax.nexus-refresh-grant/1",
      workspaceSlug: "convax",
    });
    const imageRequests: Array<{
      authorization: string | null;
      body: unknown;
      requestId: string | null;
    }> = [];
    let imageAttempts = 0;
    const client = new NexusClient(sessions, {
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.pathname.endsWith("/auth/token")) {
          return Response.json({
            access_token: "fresh-access-token-with-sufficient-length",
            data_token: "fresh-data-token-with-sufficient-length",
            data_token_expires_at: "2026-07-26T08:10:00.000Z",
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
              protocolProfile: "openai-compatible",
              status: "ACTIVE",
              workspaceId: "26010000-0000-4000-8000-000000000003",
            },
          ]);
        }
        if (url.pathname.endsWith("/chat/completions")) {
          const headers = new Headers(init?.headers);
          imageRequests.push({
            authorization: headers.get("authorization"),
            body: JSON.parse(String(init?.body)),
            requestId: headers.get("x-nexus-request-id"),
          });
          imageAttempts += 1;
          if (imageAttempts === 1) {
            return Response.json(
              {
                error: {
                  code: "metering_unsupported",
                  message:
                    "raw upstream detail containing secret-token and secret-prompt",
                },
                request_id: "sk-or-v1-secret-token",
              },
              {
                headers: {
                  "x-nexus-request-id": "secret-prompt",
                  "x-request-id": "sk-or-v1-secret-token",
                },
                status: 409,
              },
            );
          }
          if (imageAttempts === 2) {
            return Response.json(
              {
                error: { code: "secret-prompt" },
                padding: "x".repeat(70 * 1024),
                request_id: "sk-or-v1-secret-token",
              },
              { status: 500 },
            );
          }
          return Response.json(
            {
              error: {
                code: "secret-prompt",
                requestId: "sk-or-v1-secret-token",
              },
              request_id: "secret-prompt",
            },
            { status: 422 },
          );
        }
        throw new Error(`Unexpected request: ${url.pathname}`);
      },
      now: () => new Date("2026-07-26T08:00:00.000Z"),
    });

    let rejected: unknown;
    try {
      await client.imageCompletion(
        "openai/gpt-image-1",
        "secret-prompt",
        "operation-123",
        new AbortController().signal,
      );
    } catch (error) {
      rejected = error;
    }
    expect(rejected).toBeInstanceOf(NexusImageHttpError);
    expect(rejected).toMatchObject({
      code: "metering_unsupported",
      requestId: "operation-123",
      status: 409,
    });
    expect(String(rejected)).not.toContain("secret-token");
    expect(String(rejected)).not.toContain("secret-prompt");
    expect(imageRequests[0]).toEqual({
      authorization: "Bearer fresh-data-token-with-sufficient-length",
      body: {
        messages: [{ content: "secret-prompt", role: "user" }],
        modalities: ["image", "text"],
        model: "openai/gpt-image-1",
        stream: false,
      },
      requestId: "operation-123",
    });

    let oversized: unknown;
    try {
      await client.imageCompletion(
        "openai/gpt-image-1",
        "another prompt",
        "operation-oversized",
        new AbortController().signal,
      );
    } catch (error) {
      oversized = error;
    }
    expect(oversized).toBeInstanceOf(NexusImageHttpError);
    expect(oversized).toMatchObject({
      requestId: "operation-oversized",
      status: 500,
    });
    expect((oversized as NexusImageHttpError).code).toBeUndefined();

    let untrustedDiagnostics: unknown;
    try {
      await client.imageCompletion(
        "openai/gpt-image-1",
        "third prompt",
        "operation-json",
        new AbortController().signal,
      );
    } catch (error) {
      untrustedDiagnostics = error;
    }
    expect(untrustedDiagnostics).toMatchObject({
      code: undefined,
      requestId: "operation-json",
      status: 422,
    });
    expect(JSON.stringify(untrustedDiagnostics)).not.toContain("secret-prompt");
    expect(JSON.stringify(untrustedDiagnostics)).not.toContain(
      "sk-or-v1-secret-token",
    );
  });
});
