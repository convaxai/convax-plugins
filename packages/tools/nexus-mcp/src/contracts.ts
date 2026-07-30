export const pluginServiceStatusSchema =
  "convax.plugin-service-status/2" as const;
export const pluginServiceCheckoutSchema =
  "convax.plugin-service-checkout/1" as const;
export const externalAuthorizationRequestSchema =
  "convax.plugin-service-external-authorization/1" as const;
export const externalAuthorizationCompletionSchema =
  "convax.plugin-service-external-authorization-completion/1" as const;
export const llmGatewaySchema = "convax.llm-gateway/1" as const;
export const llmModelCatalogSchema = "convax.llm-model-catalog/1" as const;
export const generationCallSchema = "convax.generation-call/1" as const;

export const workspaceSlug = "convax";

export interface LlmModelCatalog extends Record<string, unknown> {
  models: Array<{ id: string; name: string }>;
  schema: typeof llmModelCatalogSchema;
}

export interface NexusProviderModel {
  id: string;
  name: string;
  outputModalities: readonly string[];
}

export interface GenerationCall extends Record<string, unknown> {
  model: string;
  operation_id: string;
  output: "image";
  output_directory: string;
  prompt: string;
  references: [];
  schema: typeof generationCallSchema;
}

export interface GenerationArtifact extends Record<string, unknown> {
  mimeType: string;
  name: string;
  path: string;
}

export interface PluginServiceStatus extends Record<string, unknown> {
  account:
    | { availability: "available"; displayName: string }
    | { availability: "unavailable" };
  credential: {
    configured: boolean;
    verification: "verified" | "unverified" | "failed" | "unknown";
  };
  credits:
    | { availability: "available"; remaining: number; unit: string }
    | { availability: "unavailable" };
  plan:
    | {
        availability: "available";
        billingInterval?: "month" | "year";
        key: string;
        name: string;
      }
    | { availability: "unavailable" };
  billing:
    | {
        availability: "available";
        checkout:
          | {
              availability: "available";
              pending?: {
                checkoutId: string;
                planKey: string;
                status:
                  | "created"
                  | "processing"
                  | "converted"
                  | "failed"
                  | "expired";
              };
              plans: Array<{
                billingInterval?: "month" | "year";
                key: string;
                name: string;
              }>;
            }
          | { availability: "unavailable" };
        subscriptionStatus?: string;
      }
    | { availability: "unavailable" };
  schema: typeof pluginServiceStatusSchema;
  state: "connected" | "disconnected" | "attention" | "unknown";
  usage:
    | {
        availability: "available";
        consumed: number;
        period?: string;
        unit: string;
      }
    | { availability: "unavailable" };
}

export interface ExternalAuthorizationRequest extends Record<string, unknown> {
  authorization_id: string;
  authorization_url: string;
  schema: typeof externalAuthorizationRequestSchema;
  timeout_seconds: number;
}

export interface HostedSession {
  accessToken: string;
  accessTokenExpiresAt: string;
  dataToken: string;
  dataTokenExpiresAt: string;
  nexusOrigin: string;
  refreshToken: string;
  schema: "convax.nexus-session/1";
  workspaceSlug: typeof workspaceSlug;
}

export interface HostedRefreshGrant {
  nexusOrigin: string;
  refreshToken: string;
  schema: "convax.nexus-refresh-grant/1";
  workspaceSlug: typeof workspaceSlug;
}

export interface HostedTokenResponse {
  access_token: string;
  data_token: string;
  data_token_expires_at: string;
  expires_in: number;
  refresh_token: string;
  token_type: "Bearer";
}

export interface HostedAccess {
  subject: string;
  workspace: { id: string; slug: string; name: string };
  access: {
    id: string;
    planId: string;
    status: string;
    accessStartsAt: string;
    accessEndsAt?: string;
  };
  plan?: {
    id: string;
    key: string;
    name: string;
    billingInterval: string;
  };
  quota?: HostedQuota;
  billing?: {
    subscriptionStatus?: string;
    checkoutAvailable: boolean;
    availablePlans: Array<{
      id: string;
      key: string;
      name: string;
      billingInterval: string;
    }>;
  };
}

export interface HostedQuota {
  availableUsd?: string;
  availableUnits: string;
  budgetUsd?: string;
  consumedUsd?: string;
  consumedUnits: string;
  periodEnd: string;
  reservedUsd?: string;
}

export interface HostedCheckout {
  checkoutId: string;
  externalUrl: string;
  status: string;
}

export interface HostedCheckoutStatus {
  checkoutId: string;
  convertedAt?: string;
  expiresAt: string;
  status: string;
}

export interface PluginServiceCheckoutResult extends Record<string, unknown> {
  checkout_id: string;
  checkout_url: string;
  schema: typeof pluginServiceCheckoutSchema;
}

export interface HostedProviderConnection {
  gatewayBaseUrl: string;
  id: string;
  name: string;
  protocolProfile: string;
  status: string;
  workspaceId: string;
}

export interface JsonRpcRequest {
  id?: number | string | null;
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface ToolResult {
  content: Array<{ text: string; type: "text" }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

export function asRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
