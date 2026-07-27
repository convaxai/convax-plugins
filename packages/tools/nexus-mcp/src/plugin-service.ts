import {
  pluginServiceCheckoutSchema,
  pluginServiceStatusSchema,
  type PluginServiceCheckoutResult,
  type PluginServiceStatus,
} from "./contracts.ts";
import type {
  NexusCheckoutAttempt,
  NexusCheckoutStore,
} from "./checkout-store.ts";
import type { NexusAuthorization } from "./authorization.ts";
import type { NexusClient } from "./nexus-client.ts";
import type { NexusSessionStore } from "./session-store.ts";

const unavailable = { availability: "unavailable" } as const;

function disconnected(
  verification: PluginServiceStatus["credential"]["verification"] = "unknown",
): PluginServiceStatus {
  return {
    account: unavailable,
    billing: unavailable,
    credential: { configured: false, verification },
    credits: unavailable,
    plan: unavailable,
    schema: pluginServiceStatusSchema,
    state: "disconnected",
    usage: unavailable,
  };
}

export class NexusPluginService {
  constructor(
    private readonly authorization: NexusAuthorization,
    private readonly client: NexusClient,
    private readonly sessions: NexusSessionStore,
    private readonly checkouts: NexusCheckoutStore,
  ) {}

  async status(): Promise<PluginServiceStatus> {
    let configured = false;
    try {
      configured = (await this.sessions.read()) !== null;
      if (!configured) return disconnected();
      const [access, providers, quota] = await Promise.all([
        this.client.access(),
        this.client.providers(),
        this.client.quota(),
      ]);
      const pending =
        access.plan && access.billing
          ? await this.#pending(access.access.id, access.plan.key)
          : undefined;
      const providerReady = providers.some(
        ({ name, protocolProfile, status }) =>
          status === "ACTIVE" &&
          protocolProfile === "openai-compatible" &&
          name.toLocaleLowerCase("en-US").includes("openrouter"),
      );
      const consumed = boundedMetric(quota.consumedUnits);
      const remaining = boundedMetric(quota.availableUnits);
      return {
        account: {
          availability: "available",
          displayName: access.workspace.name.slice(0, 120),
        },
        billing: {
          ...(access.billing
            ? {
                availability: "available" as const,
                checkout:
                  access.billing.checkoutAvailable &&
                  access.billing.availablePlans.length > 0
                    ? {
                        availability: "available" as const,
                        ...(pending === undefined ? {} : { pending }),
                        plans: access.billing.availablePlans.map((plan) => ({
                          billingInterval: interval(plan.billingInterval),
                          key: plan.key.slice(0, 80),
                          name: plan.name.slice(0, 120),
                        })),
                      }
                    : unavailable,
                ...(access.billing.subscriptionStatus === undefined
                  ? {}
                  : {
                      subscriptionStatus:
                        access.billing.subscriptionStatus.slice(0, 64),
                    }),
              }
            : unavailable),
        },
        credential: {
          configured: true,
          verification: providerReady ? "verified" : "unverified",
        },
        credits:
          remaining === undefined
            ? unavailable
            : {
                availability: "available",
                remaining,
                unit: "Nexus quota units",
              },
        schema: pluginServiceStatusSchema,
        plan: access.plan
          ? {
              availability: "available",
              billingInterval: interval(access.plan.billingInterval),
              key: access.plan.key.slice(0, 80),
              name: access.plan.name.slice(0, 120),
            }
          : unavailable,
        state:
          providerReady && access.access.status === "ACTIVE"
            ? "connected"
            : "attention",
        usage:
          consumed === undefined
            ? unavailable
            : {
                availability: "available",
                consumed,
                period:
                  `until ${new Date(quota.periodEnd).toISOString()}`.slice(
                    0,
                    120,
                  ),
                unit: "Nexus quota units",
              },
      };
    } catch {
      return configured
        ? {
            account: unavailable,
            billing: unavailable,
            credential: { configured: true, verification: "failed" },
            credits: unavailable,
            plan: unavailable,
            schema: pluginServiceStatusSchema,
            state: "attention",
            usage: unavailable,
          }
        : disconnected("failed");
    }
  }

  authorize() {
    return this.authorization.begin();
  }

  reauthorize() {
    return this.authorization.begin();
  }

  async complete(input: unknown, signal?: AbortSignal) {
    await this.authorization.complete(input, signal);
    return this.status();
  }

  async cancel() {
    this.authorization.cancel();
    return this.status();
  }

  async signOut() {
    this.authorization.cancel();
    await this.client.signOut();
    await this.checkouts.clear();
    return disconnected();
  }

  async checkout(planKey: string): Promise<PluginServiceCheckoutResult> {
    const access = await this.client.access();
    if (
      !access.billing ||
      !access.billing.checkoutAvailable ||
      !access.billing.availablePlans.some(({ key }) => key === planKey)
    ) {
      throw new Error("The selected Nexus Plan is not available");
    }
    const attempt = await this.checkouts.begin(access.access.id, planKey);
    const checkout = await this.client.createCheckout(
      planKey,
      attempt.idempotencyKey,
    );
    await this.checkouts.write({
      ...attempt,
      checkoutId: checkout.checkoutId,
      status: checkout.status,
    });
    return {
      checkout_id: checkout.checkoutId,
      checkout_url: checkout.externalUrl,
      schema: pluginServiceCheckoutSchema,
    };
  }

  async #pending(workspaceAccessId: string, currentPlanKey: string) {
    const attempt = await this.checkouts.read();
    if (!attempt || attempt.workspaceAccessId !== workspaceAccessId)
      return undefined;
    if (attempt.planKey === currentPlanKey) {
      await this.checkouts.clear();
      return undefined;
    }
    const refreshed = attempt.checkoutId
      ? await this.#refreshCheckout(attempt)
      : attempt;
    const status = checkoutStatus(refreshed.status);
    if (status === "failed" || status === "expired") {
      await this.checkouts.clear();
      return undefined;
    }
    return refreshed.checkoutId && status
      ? {
          checkoutId: refreshed.checkoutId,
          planKey: refreshed.planKey,
          status,
        }
      : undefined;
  }

  async #refreshCheckout(
    attempt: NexusCheckoutAttempt,
  ): Promise<NexusCheckoutAttempt> {
    try {
      const status = await this.client.checkoutStatus(attempt.checkoutId!);
      const updated = { ...attempt, status: status.status };
      await this.checkouts.write(updated);
      return updated;
    } catch {
      return attempt;
    }
  }
}

function boundedMetric(value: string): number | undefined {
  if (!/^\d+$/u.test(value)) return undefined;
  const metric = Number(value);
  return Number.isSafeInteger(metric) && metric >= 0 && metric <= 1e15
    ? metric
    : undefined;
}

function interval(value: string): "month" | "year" {
  if (value === "MONTH") return "month";
  if (value === "YEAR") return "year";
  throw new Error("Nexus Plan billing interval is invalid");
}

function checkoutStatus(
  value: string | undefined,
): "created" | "processing" | "converted" | "failed" | "expired" | undefined {
  if (value === "CREATED") return "created";
  if (value === "PREPARING") return "processing";
  if (value === "CONVERTED") return "converted";
  if (value === "FAILED") return "failed";
  if (value === "EXPIRED") return "expired";
  return undefined;
}
