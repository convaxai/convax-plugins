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
import {
  NexusApplicationAccessError,
  type NexusClient,
} from "./application-client.ts";
import type { NexusCredentialStore } from "./credential-store.ts";

const unavailable = { availability: "unavailable" } as const;
const connectedAccount = {
  availability: "available",
  displayName: "Convax",
} as const;

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
    private readonly credentials: NexusCredentialStore,
    private readonly checkouts: NexusCheckoutStore,
  ) {}

  async status(): Promise<PluginServiceStatus> {
    let configured = false;
    try {
      configured = (await this.credentials.read()) !== null;
      if (!configured) return disconnected();
      const access = await this.client.current();
      const providerReady = access.state === "ACTIVE";
      return {
        account: providerReady ? connectedAccount : unavailable,
        billing: {
          availability: "available",
          checkout: access.checkoutAvailable
            ? {
                availability: "available",
                plans: [
                  {
                    key: access.planKey.slice(0, 80),
                    name: access.planKey.slice(0, 120),
                  },
                ],
              }
            : unavailable,
        },
        credential: {
          configured: true,
          verification: providerReady ? "verified" : "unverified",
        },
        credits: unavailable,
        schema: pluginServiceStatusSchema,
        plan: {
          availability: "available",
          key: access.planKey.slice(0, 80),
          name: access.planKey.slice(0, 120),
        },
        state: providerReady ? "connected" : "attention",
        usage: unavailable,
      };
    } catch (error) {
      if (configured && error instanceof NexusApplicationAccessError) {
        throw error;
      }
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
    const access = await this.client.current();
    if (
      !access.checkoutAvailable ||
      access.planKey !== planKey ||
      access.state !== "ACTIVE"
    ) {
      throw new Error("The selected Nexus Plan is not available");
    }
    const attempt = await this.checkouts.begin(access.applicationId, planKey);
    const checkout = await this.client.createCheckout(
      planKey,
      attempt.idempotencyKey,
    );
    await this.checkouts.write({
      ...attempt,
      checkoutId: checkout.id,
      status: checkout.status,
    });
    const checkoutUrl = checkout.action?.url;
    if (!checkoutUrl) {
      throw new Error("Nexus Checkout did not provide a browser URL");
    }
    return {
      checkout_id: checkout.id,
      checkout_url: checkoutUrl,
      schema: pluginServiceCheckoutSchema,
    };
  }
}
