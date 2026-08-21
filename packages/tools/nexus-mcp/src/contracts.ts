export const pluginServiceStatusSchema =
  "convax.plugin-service-status/2" as const;
export const pluginServiceCheckoutSchema =
  "convax.plugin-service-checkout/1" as const;
export const externalAuthorizationRequestSchema =
  "convax.plugin-service-external-authorization/1" as const;
export const externalAuthorizationCompletionSchema =
  "convax.plugin-service-external-authorization-completion/1" as const;
export const llmGatewaySchema = "convax.llm-gateway/1" as const;
export const generationCallSchema = "convax.generation-call/1" as const;
export const generationLroCapabilitySchema = "convax.generation-lro/1" as const;
export const generationLroRequestSchema =
  "convax.generation-lro-request/1" as const;
export const generationLroSnapshotSchema =
  "convax.generation-lro-snapshot/1" as const;
export const generationLroResultSchema =
  "convax.generation-lro-result/1" as const;
export const generationLroAcknowledgementSchema =
  "convax.generation-lro-acknowledgement/1" as const;
export const applicationCredentialsSchema =
  "convax.nexus-authx-refresh-credential/2" as const;

export interface NexusProviderModel {
  id: string;
  name: string;
  outputModalities: readonly string[];
}

export type GenerationProviderParameter =
  | null
  | string
  | number
  | boolean
  | readonly GenerationProviderParameter[]
  | { readonly [key: string]: GenerationProviderParameter };
export type GenerationProviderParameters = Readonly<
  Record<string, GenerationProviderParameter>
>;

const generationCallEnvelopeFields = new Set([
  "model",
  "operation_id",
  "output",
  "output_directory",
  "prompt",
  "references",
  "schema",
]);
export function generationProviderParameters(
  input: Readonly<Record<string, unknown>>,
): GenerationProviderParameters {
  const entries = Object.entries(input)
    .filter(([key]) => !generationCallEnvelopeFields.has(key))
    .sort(([left], [right]) => left.localeCompare(right));
  const parameters: Record<string, GenerationProviderParameter> = {};
  for (const [key, value] of entries) {
    if (!isJsonValue(value)) {
      throw new Error(`Nexus generation provider parameter ${key} is not JSON`);
    }
    parameters[key] = value;
  }
  return parameters;
}

export function isGenerationProviderParameters(
  value: unknown,
): value is GenerationProviderParameters {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const parsed = generationProviderParameters(
      value as Record<string, unknown>,
    );
    const input = value as Record<string, unknown>;
    return Object.keys(parsed).length === Object.keys(input).length;
  } catch {
    return false;
  }
}

function isJsonValue(value: unknown): value is GenerationProviderParameter {
  try {
    JSON.stringify(value);
  } catch {
    return false;
  }
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean"
    ) {
      continue;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) return false;
      continue;
    }
    if (!current || typeof current !== "object") return false;
    pending.push(
      ...(Array.isArray(current) ? current : Object.values(current)),
    );
  }
  return true;
}

export interface GenerationCall extends Record<string, unknown> {
  model: string;
  operation_id: string;
  output: "audio" | "image" | "video";
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
                  "created" | "processing" | "converted" | "failed" | "expired";
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

export interface NexusApplicationCredentials {
  accountBinding: string;
  authxIssuer: string;
  nexusOrigin: string;
  refreshToken: string;
  schema: typeof applicationCredentialsSchema;
}

export interface AuthXTokenResponse {
  access_token: string;
  expires_in: number;
  id_token: string;
  refresh_token: string;
  scope?: string;
  token_type: "Bearer";
}

export interface NexusApplicationAccess {
  applicationId: string;
  applicationVersion: number;
  checkoutAvailable: boolean;
  gatewayBaseUrl: string;
  planKey: string;
  providerAccessRevision: number;
  state: "ACTIVE";
}

export interface NexusApplicationCheckout {
  action?: {
    kind: "REDIRECT" | "QR_CODE" | "FORM_POST";
    qrCode?: string;
    url?: string;
  };
  expiresAt: string;
  id: string;
  provider: string;
  status: string;
}

export interface PluginServiceCheckoutResult extends Record<string, unknown> {
  checkout_id: string;
  checkout_url: string;
  schema: typeof pluginServiceCheckoutSchema;
}

export interface GenerationRecoveryRequest {
  operationId: string;
  outputDirectory?: string;
  requestDigest: string;
  resultDigest?: string;
  schema: typeof generationLroRequestSchema;
  taskId?: string;
}

export type GenerationRecoverySnapshot =
  | {
      schema: typeof generationLroSnapshotSchema;
      status: "absent" | "prepared" | "unknown";
    }
  | {
      schema: typeof generationLroSnapshotSchema;
      status: "submitted" | "running";
      taskId: string;
    }
  | {
      resultDigest: string;
      schema: typeof generationLroSnapshotSchema;
      status: "succeeded";
      taskId: string;
    }
  | {
      error: { code: string; message: string };
      schema: typeof generationLroSnapshotSchema;
      status: "failed";
      taskId?: string;
    }
  | {
      schema: typeof generationLroSnapshotSchema;
      status: "cancelled";
      taskId?: string;
    };

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
