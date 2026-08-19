import type {
  AudioCreateRequest,
  AudioJob,
  ImageCreateRequest,
  ImageJob,
  ProviderAuthorizationCompletion,
  ProviderAuthorizationRequest,
  ProviderAuthorizationStatus,
  ProviderConfigurationSelection,
  ProviderConfigurationStatus,
  ProviderDescriptor,
  ProviderModel,
  ProviderResource,
  VideoCreateRequest,
  VideoJob,
  XiaoYunqueCredentialSnapshot,
  XiaoYunqueWebSession,
} from "shortdrama-router"

export const mcpProtocolVersion = "2025-03-26" as const
export const generationCallSchema = "convax.generation-call/1" as const
export const pluginServiceStatusSchema = "convax.plugin-service-status/2" as const
export const browserAuthorizationSchema =
  "convax.plugin-service-browser-authorization/1" as const
export const browserAuthorizationCompletionSchema =
  "convax.plugin-service-browser-authorization-completion/1" as const
export const externalAuthorizationSchema =
  "convax.plugin-service-external-authorization/1" as const
export const externalAuthorizationCompletionSchema =
  "convax.plugin-service-external-authorization-completion/1" as const

export const providerIds = ["xiaoyunque", "libtv", "jimeng"] as const
export type ProviderId = (typeof providerIds)[number]
export const generationKinds = ["audio", "image", "video"] as const
export type GenerationKind = (typeof generationKinds)[number]

export interface RouterPort {
  beginProviderAuthorization(
    id: string,
    method: "api_key" | "oauth" | "browser_session",
    signal?: AbortSignal,
  ): Promise<ProviderAuthorizationRequest>
  cancelProviderAuthorization(
    id: string,
    authorizationId: string,
    signal?: AbortSignal,
  ): Promise<void>
  clearProviderAuthorization(id: string, signal?: AbortSignal): Promise<void>
  completeProviderAuthorization(
    id: string,
    completion: ProviderAuthorizationCompletion,
    signal?: AbortSignal,
  ): Promise<ProviderAuthorizationStatus>
  createAudio(request: AudioCreateRequest, signal?: AbortSignal): Promise<AudioJob>
  createImage(request: ImageCreateRequest, signal?: AbortSignal): Promise<ImageJob>
  createVideo(request: VideoCreateRequest, signal?: AbortSignal): Promise<VideoJob>
  getAudio(id: string, signal?: AbortSignal): Promise<AudioJob>
  getImage(id: string, signal?: AbortSignal): Promise<ImageJob>
  getProvider(
    id: string,
    options?: {
      readonly probeAuthorization?: boolean
      readonly probeConfiguration?: boolean
      readonly probeDependencies?: boolean
      readonly signal?: AbortSignal
    },
  ): Promise<ProviderDescriptor>
  getProviderAuthorization(
    id: string,
    options?: { readonly probe?: boolean; readonly signal?: AbortSignal },
  ): Promise<ProviderAuthorizationStatus>
  getProviderConfiguration(
    id: string,
    options?: { readonly probe?: boolean; readonly signal?: AbortSignal },
  ): Promise<ProviderConfigurationStatus>
  getVideo(id: string, signal?: AbortSignal): Promise<VideoJob>
  listProviderModels(
    id: string,
    signal?: AbortSignal,
    probe?: boolean,
  ): Promise<readonly ProviderModel[]>
  listProviderResources(
    id: string,
    type?: string,
    signal?: AbortSignal,
  ): Promise<readonly ProviderResource[]>
  configureProvider(
    id: string,
    selection: ProviderConfigurationSelection,
    signal?: AbortSignal,
  ): Promise<ProviderConfigurationStatus>
}

export interface CombinedXiaoYunqueCredentialSource {
  read(): Promise<XiaoYunqueCredentialSnapshot>
  completeWithWebSession<T>(
    session: XiaoYunqueWebSession,
    action: () => Promise<T>,
  ): Promise<T | undefined>
}

export interface PluginServiceStatus extends Record<string, unknown> {
  account:
    | { availability: "available"; displayName: string }
    | { availability: "unavailable" }
  billing: { availability: "unavailable" }
  credential: {
    configured: boolean
    verification: "verified" | "unverified" | "failed" | "unknown"
  }
  credits: { availability: "unavailable" }
  plan: { availability: "unavailable" }
  schema: typeof pluginServiceStatusSchema
  state: "connected" | "disconnected" | "attention" | "unknown"
  usage: { availability: "unavailable" }
}

export interface BrowserAuthorizationRequest extends Record<string, unknown> {
  authorization_id: string
  cookie_names: string[]
  cookie_origin: string
  login_url: string
  schema: typeof browserAuthorizationSchema
  timeout_seconds: number
}

export interface ExternalAuthorizationRequest extends Record<string, unknown> {
  authorization_id: string
  authorization_url: string
  schema: typeof externalAuthorizationSchema
  timeout_seconds: number
}

export interface GenerationArtifact extends Record<string, unknown> {
  mimeType: string
  name: string
  path: string
}

export interface JsonRpcRequest {
  id?: number | string | null
  jsonrpc: "2.0"
  method: string
  params?: unknown
}

export interface McpTool {
  description: string
  inputSchema: Record<string, unknown>
  name: string
}

export interface ToolResult {
  content: Array<{ text: string; type: "text" }>
  isError?: boolean
  structuredContent?: Record<string, unknown>
}

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

export function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  const allowed = new Set([...required, ...optional])
  if (
    required.some((key) => !(key in value))
    || Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw new Error("Input contains unsupported or missing fields")
  }
}

export function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError")
    || (error instanceof Error && error.name === "AbortError")
  )
}

export function abortError(message = "The request was cancelled") {
  return new DOMException(message, "AbortError")
}
