import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { NexusAuthorization } from "../src/authorization.ts";
import { NexusCheckoutStore } from "../src/checkout-store.ts";
import type { NexusClient } from "../src/nexus-client.ts";
import { NexusPluginService } from "../src/plugin-service.ts";
import type { NexusSessionStore } from "../src/session-store.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("NexusPluginService", () => {
  test("projects the authoritative Plan catalog and creates a retryable Checkout", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-service-"),
    );
    roots.push(root);
    const checkouts = new NexusCheckoutStore({ XDG_CONFIG_HOME: root });
    const createCalls: Array<{
      idempotencyKey: string;
      planKey: string;
    }> = [];
    const client = {
      async access() {
        return {
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
        };
      },
      async providers() {
        return [
          {
            gatewayBaseUrl:
              "https://nexus.test/providers/26010000-0000-4000-8000-000000000010",
            id: "26010000-0000-4000-8000-000000000010",
            name: "OpenRouter",
            protocolProfile: "openai-compatible",
            status: "ACTIVE",
            workspaceId: "26010000-0000-4000-8000-000000000003",
          },
        ];
      },
      async quota() {
        return {
          availableUnits: "998800",
          consumedUnits: "1200",
          periodEnd: "2026-08-26T08:00:00.000Z",
        };
      },
      async createCheckout(planKey: string, idempotencyKey: string) {
        createCalls.push({ idempotencyKey, planKey });
        return {
          checkoutId: "26010000-0000-4000-8000-000000000009",
          externalUrl: "https://checkout.creem.test/session/hosted-user",
          status: "CREATED",
        };
      },
      async checkoutStatus() {
        return {
          checkoutId: "26010000-0000-4000-8000-000000000009",
          expiresAt: "2026-07-27T08:00:00.000Z",
          status: "CREATED",
        };
      },
      async signOut() {},
    } as unknown as NexusClient;
    const sessions = {
      async read() {
        return {
          nexusOrigin: "https://nexus.test",
          refreshToken: "refresh-token-with-sufficient-length",
          schema: "convax.nexus-refresh-grant/1",
          workspaceSlug: "convax",
        };
      },
    } as unknown as NexusSessionStore;
    const service = new NexusPluginService(
      {} as NexusAuthorization,
      client,
      sessions,
      checkouts,
    );

    expect(await service.status()).toMatchObject({
      billing: {
        availability: "available",
        checkout: {
          availability: "available",
          plans: [{ billingInterval: "month", key: "pro", name: "Pro" }],
        },
      },
      plan: {
        availability: "available",
        billingInterval: "month",
        key: "free",
        name: "Free",
      },
      schema: "convax.plugin-service-status/2",
      state: "connected",
    });
    expect(await service.checkout("pro")).toEqual({
      checkout_id: "26010000-0000-4000-8000-000000000009",
      checkout_url: "https://checkout.creem.test/session/hosted-user",
      schema: "convax.plugin-service-checkout/1",
    });
    expect(createCalls[0]?.planKey).toBe("pro");
    expect(createCalls[0]?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(await checkouts.read()).toMatchObject({
      checkoutId: "26010000-0000-4000-8000-000000000009",
      planKey: "pro",
      status: "CREATED",
    });
  });

  test("keeps a deployed base Access response connected while Plan and Billing remain unavailable", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-service-"),
    );
    roots.push(root);
    const service = new NexusPluginService(
      {} as NexusAuthorization,
      {
        async access() {
          return {
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
          };
        },
        async providers() {
          return [
            {
              gatewayBaseUrl:
                "https://nexus.test/providers/26010000-0000-4000-8000-000000000010",
              id: "26010000-0000-4000-8000-000000000010",
              name: "OpenRouter",
              protocolProfile: "openai-compatible",
              status: "ACTIVE",
              workspaceId: "26010000-0000-4000-8000-000000000003",
            },
          ];
        },
        async quota() {
          return {
            availableUnits: "1000000",
            consumedUnits: "0",
            periodEnd: "2026-08-26T08:00:00.000Z",
          };
        },
      } as unknown as NexusClient,
      {
        async read() {
          return {
            nexusOrigin: "https://nexus.test",
            refreshToken: "refresh-token-with-sufficient-length",
            schema: "convax.nexus-refresh-grant/1",
            workspaceSlug: "convax",
          };
        },
      } as unknown as NexusSessionStore,
      new NexusCheckoutStore({ XDG_CONFIG_HOME: root }),
    );

    expect(await service.status()).toEqual({
      account: { availability: "available", displayName: "Convax" },
      billing: { availability: "unavailable" },
      credential: { configured: true, verification: "verified" },
      credits: {
        availability: "available",
        remaining: 1000000,
        unit: "Nexus quota units",
      },
      plan: { availability: "unavailable" },
      schema: "convax.plugin-service-status/2",
      state: "connected",
      usage: {
        availability: "available",
        consumed: 0,
        period: "until 2026-08-26T08:00:00.000Z",
        unit: "Nexus quota units",
      },
    });
    await expect(service.checkout("pro")).rejects.toThrow(
      "The selected Nexus Plan is not available",
    );
  });
});
