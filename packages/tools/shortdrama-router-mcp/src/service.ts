import type {
  ProviderAuthorizationRequest,
  ProviderAuthorizationStatus,
  XiaoYunqueCredentialSnapshot,
  XiaoYunqueWebSession,
} from "shortdrama-router"

import { boundedCall } from "./bounded-call.ts"
import {
  abortError,
  asRecord,
  browserAuthorizationCompletionSchema,
  browserAuthorizationSchema,
  exactKeys,
  externalAuthorizationCompletionSchema,
  externalAuthorizationSchema,
  isAbortError,
  pluginServiceStatusSchema,
  type BrowserAuthorizationRequest,
  type CombinedXiaoYunqueCredentialSource,
  type ExternalAuthorizationRequest,
  type McpTool,
  type PluginServiceStatus,
  type ProviderId,
  type RouterPort,
} from "./contracts.ts"

const unavailable = { availability: "unavailable" } as const
const emptyInputSchema = {
  additionalProperties: false,
  properties: {},
  type: "object",
} as const
const authorizationIdPattern = /^[A-Za-z0-9_-]{16,128}$/u
const jimengOrigin = "https://jimeng.jianying.com"
const xiaoyunqueOrigin = "https://xyq.jianying.com"
const xiaoyunqueCookieNames = [
  "sessionid_pippitcn_web",
  "sessionid_ss_pippitcn_web",
] as const
const xiaoyunqueCookieNameSet: ReadonlySet<string> = new Set(
  xiaoyunqueCookieNames,
)

interface PendingAuthorization {
  expiresAt: number
  flow: "browser" | "external"
  id: string
}

export type XiaoYunqueWebSessionProbe = (
  snapshot: XiaoYunqueCredentialSnapshot,
  signal?: AbortSignal,
) => Promise<ProviderAuthorizationStatus>

export interface ProviderServiceOptions {
  credentials?: CombinedXiaoYunqueCredentialSource
  now?: () => number
  requestTimeoutMs?: number
  webSessionProbe?: XiaoYunqueWebSessionProbe
}

function status(
  state: PluginServiceStatus["state"],
  configured: boolean,
  verification: PluginServiceStatus["credential"]["verification"],
): PluginServiceStatus {
  return {
    account: unavailable,
    billing: unavailable,
    credential: { configured, verification },
    credits: unavailable,
    plan: unavailable,
    schema: pluginServiceStatusSchema,
    state,
    usage: unavailable,
  }
}

function authorizationIsReady(value: ProviderAuthorizationStatus) {
  return (
    value.authorized === true
    && (value.state === "valid" || value.state === "expiring")
  )
}

function mappedAuthorizationStatus(
  value: ProviderAuthorizationStatus,
  providerReady: boolean,
  probeFailed = false,
) {
  if (!value.configured || value.state === "not_configured") {
    return status("disconnected", false, probeFailed ? "failed" : "unknown")
  }
  if (probeFailed || value.state === "expired" || value.state === "error") {
    return status("attention", true, "failed")
  }
  if (authorizationIsReady(value)) {
    return value.reason === undefined
        && value.reason_code === undefined
        && providerReady
      ? status("connected", true, "verified")
      : status("attention", true, "unverified")
  }
  return status("unknown", true, "unverified")
}

function requireEmptyArguments(value: unknown) {
  const input = asRecord(value ?? {}, "service arguments")
  if (Object.keys(input).length !== 0) {
    throw new Error("This service action does not accept arguments")
  }
}

function authorizationLifetime(
  request: ProviderAuthorizationRequest,
  now: number,
) {
  if (!authorizationIdPattern.test(request.authorization_id)) {
    throw new Error("Provider authorization id is invalid")
  }
  const expiresAt = new Date(request.expires_at).getTime()
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new Error("Provider authorization expiry is invalid")
  }
  const timeoutSeconds = Math.ceil((expiresAt - now) / 1_000)
  if (timeoutSeconds < 1 || timeoutSeconds > 1_800) {
    throw new Error("Provider authorization lifetime is invalid")
  }
  return { expiresAt, timeoutSeconds: Math.max(30, timeoutSeconds) }
}

function httpsUrl(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) {
    throw new Error(`${label} is invalid`)
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} is invalid`)
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.port !== ""
  ) {
    throw new Error(`${label} is invalid`)
  }
  return url.toString()
}

function browserRequest(
  request: ProviderAuthorizationRequest,
  now: number,
): { pending: PendingAuthorization; result: BrowserAuthorizationRequest } {
  const { expiresAt, timeoutSeconds } = authorizationLifetime(request, now)
  if (
    request.method !== "api_key"
    || request.cookie_origin !== xiaoyunqueOrigin
    || !Array.isArray(request.cookie_names)
    || request.cookie_names.length !== xiaoyunqueCookieNames.length
    || request.cookie_names.some(
      (name) => !xiaoyunqueCookieNameSet.has(name),
    )
    || new Set(request.cookie_names).size !== xiaoyunqueCookieNames.length
  ) {
    throw new Error("XiaoYunque authorization contract is invalid")
  }
  const loginUrl = httpsUrl(request.login_url, "XiaoYunque login URL")
  if (new URL(loginUrl).origin !== xiaoyunqueOrigin) {
    throw new Error("XiaoYunque login URL is invalid")
  }
  return {
    pending: { expiresAt, flow: "browser", id: request.authorization_id },
    result: {
      authorization_id: request.authorization_id,
      cookie_names: [...xiaoyunqueCookieNames],
      cookie_origin: xiaoyunqueOrigin,
      login_url: loginUrl,
      schema: browserAuthorizationSchema,
      timeout_seconds: timeoutSeconds,
    },
  }
}

function externalRequest(
  request: ProviderAuthorizationRequest,
  now: number,
): { pending: PendingAuthorization; result: ExternalAuthorizationRequest } {
  const { expiresAt, timeoutSeconds } = authorizationLifetime(request, now)
  if (request.method !== "oauth") {
    throw new Error("Jimeng authorization contract is invalid")
  }
  const authorizationUrl = httpsUrl(
    request.login_url,
    "Jimeng authorization URL",
  )
  if (new URL(authorizationUrl).origin !== jimengOrigin) {
    throw new Error("Jimeng authorization URL is invalid")
  }
  return {
    pending: { expiresAt, flow: "external", id: request.authorization_id },
    result: {
      authorization_id: request.authorization_id,
      authorization_url: authorizationUrl,
      schema: externalAuthorizationSchema,
      timeout_seconds: timeoutSeconds,
    },
  }
}

function parseExternalCompletion(value: unknown) {
  const input = asRecord(value, "external authorization completion")
  exactKeys(input, ["authorization_id", "schema"])
  if (
    input.schema !== externalAuthorizationCompletionSchema
    || typeof input.authorization_id !== "string"
    || !authorizationIdPattern.test(input.authorization_id)
  ) {
    throw new Error("External authorization completion is invalid")
  }
  return { authorizationId: input.authorization_id }
}

function parseBrowserCompletion(value: unknown) {
  const input = asRecord(value, "browser authorization completion")
  exactKeys(input, ["authorization_id", "cookie_origin", "cookies", "schema"])
  if (
    input.schema !== browserAuthorizationCompletionSchema
    || typeof input.authorization_id !== "string"
    || !authorizationIdPattern.test(input.authorization_id)
    || input.cookie_origin !== xiaoyunqueOrigin
    || !Array.isArray(input.cookies)
    || input.cookies.length === 0
    || input.cookies.length > xiaoyunqueCookieNames.length
  ) {
    throw new Error("Browser authorization completion is invalid")
  }
  const names = new Set<string>()
  let totalBytes = 0
  const cookies = input.cookies.map((value) => {
    const cookie = asRecord(value, "browser authorization Cookie")
    exactKeys(cookie, ["name", "value"])
    if (
      typeof cookie.name !== "string"
      || !xiaoyunqueCookieNameSet.has(cookie.name)
      || names.has(cookie.name)
      || typeof cookie.value !== "string"
      || cookie.value.length === 0
      || /[\u0000-\u0020\u007f;]/u.test(cookie.value)
      || Buffer.byteLength(cookie.value, "utf8") > 16 * 1024
    ) {
      throw new Error("Browser authorization Cookie is invalid")
    }
    totalBytes += Buffer.byteLength(cookie.name, "utf8")
      + Buffer.byteLength(cookie.value, "utf8")
    if (totalBytes > 32 * 1024) {
      throw new Error("Browser authorization Cookies are too large")
    }
    names.add(cookie.name)
    return { name: cookie.name, value: cookie.value }
  })
  return { authorizationId: input.authorization_id, cookies }
}

export function serviceTools(provider: ProviderId): McpTool[] {
  const tools: McpTool[] = [
    {
      description:
        "Report bounded authorization state for the selected short-drama service.",
      inputSchema: emptyInputSchema,
      name: "service.status",
    },
  ]
  if (provider === "libtv") {
    tools.push({
      description: "Clear LibTV authorization managed by the official local CLI.",
      inputSchema: emptyInputSchema,
      name: "service.sign_out",
    })
    return tools
  }
  tools.push(
    {
      description: `Start ${provider} authorization.`,
      inputSchema: emptyInputSchema,
      name: "service.authorize",
    },
    {
      description: `Restart ${provider} authorization without clearing the current credential first.`,
      inputSchema: emptyInputSchema,
      name: "service.reauthorize",
    },
    {
      description: `Cancel the active ${provider} authorization request.`,
      inputSchema: emptyInputSchema,
      name: "service.authorization.cancel",
    },
  )
  tools.push(
    provider === "xiaoyunque"
      ? {
          description:
            "Complete XiaoYunque authorization with the host-captured allowlisted Cookies.",
          inputSchema: {
            additionalProperties: false,
            properties: {
              authorization_id: {
                maxLength: 128,
                minLength: 16,
                pattern: "^[A-Za-z0-9_-]+$",
                type: "string",
              },
              cookie_origin: { const: xiaoyunqueOrigin, type: "string" },
              cookies: {
                items: {
                  additionalProperties: false,
                  properties: {
                    name: { enum: [...xiaoyunqueCookieNames], type: "string" },
                    value: { maxLength: 16 * 1024, minLength: 1, type: "string" },
                  },
                  required: ["name", "value"],
                  type: "object",
                },
                maxItems: 2,
                minItems: 1,
                type: "array",
              },
              schema: {
                const: browserAuthorizationCompletionSchema,
                type: "string",
              },
            },
            required: ["schema", "authorization_id", "cookie_origin", "cookies"],
            type: "object",
          },
          name: "service.authorization.complete",
        }
      : {
          description:
            "Complete the active Jimeng external device authorization.",
          inputSchema: {
            additionalProperties: false,
            properties: {
              authorization_id: {
                maxLength: 128,
                minLength: 16,
                pattern: "^[A-Za-z0-9_-]+$",
                type: "string",
              },
              schema: {
                const: externalAuthorizationCompletionSchema,
                type: "string",
              },
            },
            required: ["authorization_id", "schema"],
            type: "object",
          },
          name: "service.authorization.complete",
        },
    {
      description: `Clear the selected provider's locally managed authorization.`,
      inputSchema: emptyInputSchema,
      name: "service.sign_out",
    },
  )
  return tools
}

export class ProviderService {
  readonly #credentials: CombinedXiaoYunqueCredentialSource | undefined
  readonly #now: () => number
  #pending: PendingAuthorization | undefined
  readonly #requestTimeoutMs: number
  #tail: Promise<void> = Promise.resolve()
  readonly #webSessionProbe: XiaoYunqueWebSessionProbe | undefined

  constructor(
    readonly provider: ProviderId,
    private readonly router: RouterPort,
    options: ProviderServiceOptions = {},
  ) {
    this.#credentials = options.credentials
    this.#now = options.now ?? Date.now
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 30_000
    this.#webSessionProbe = options.webSessionProbe
    if (
      provider === "xiaoyunque"
      && (!this.#credentials || !this.#webSessionProbe)
    ) {
      throw new Error("XiaoYunque combined authorization is not configured")
    }
    if (!Number.isFinite(this.#requestTimeoutMs) || this.#requestTimeoutMs <= 0) {
      throw new Error("Provider status timeout is invalid")
    }
  }

  status(signal?: AbortSignal) {
    return this.#exclusive(() => this.#status(signal))
  }

  prepareModels(signal: AbortSignal) {
    return this.#exclusive(async () => {
      if (this.provider !== "libtv") return
      const configuration = await this.#ensureLibTvConfiguration(signal)
      if (configuration.state !== "configuration_valid") {
        throw new Error("LibTV requires one unambiguous configured project")
      }
    })
  }

  authorize(signal?: AbortSignal) {
    return this.#exclusive(() => this.#begin(signal))
  }

  reauthorize(signal?: AbortSignal) {
    return this.#exclusive(() => this.#begin(signal))
  }

  cancelAuthorization(argumentsValue: unknown, signal?: AbortSignal) {
    return this.#exclusive(async () => {
      requireEmptyArguments(argumentsValue)
      if (signal?.aborted) throw abortError()
      const pending = this.#pending
      if (pending && pending.expiresAt > this.#now()) {
        await boundedCall(
          this.#requestTimeoutMs,
          signal,
          (attemptSignal) => this.router.cancelProviderAuthorization(
            this.provider,
            pending.id,
            attemptSignal,
          ),
        )
      }
      this.#pending = undefined
      return this.#status(signal)
    })
  }

  completeAuthorization(argumentsValue: unknown, signal?: AbortSignal) {
    return this.#exclusive(async () => {
      if (signal?.aborted) throw abortError()
      const pending = this.#currentPending()
      if (this.provider === "xiaoyunque") {
        if (pending.flow !== "browser") {
          throw new Error("Browser authorization is not active")
        }
        const completion = parseBrowserCompletion(argumentsValue)
        if (completion.authorizationId !== pending.id) {
          throw new Error("Browser authorization is stale or invalid")
        }
        const session: XiaoYunqueWebSession = {
          authorized_at: new Date(this.#now()).toISOString(),
          cookies: completion.cookies,
        }
        await this.#credentials!.completeWithWebSession(session, () =>
          boundedCall(this.#requestTimeoutMs, signal, (attemptSignal) =>
            this.router.completeProviderAuthorization(
              this.provider,
              {
                authorization_id: completion.authorizationId,
                cookie_origin: xiaoyunqueOrigin,
                cookies: completion.cookies,
                method: "api_key",
              },
              attemptSignal,
            )),
        )
      } else if (this.provider === "jimeng") {
        if (pending.flow !== "external") {
          throw new Error("External authorization is not active")
        }
        const completion = parseExternalCompletion(argumentsValue)
        if (completion.authorizationId !== pending.id) {
          throw new Error("External authorization is stale or invalid")
        }
        await boundedCall(this.#requestTimeoutMs, signal, (attemptSignal) =>
          this.router.completeProviderAuthorization(
            this.provider,
            { authorization_id: completion.authorizationId, method: "oauth" },
            attemptSignal,
          ))
      } else {
        throw new Error("LibTV interactive authorization is not supported")
      }
      this.#pending = undefined
      return this.#status(signal)
    })
  }

  signOut(argumentsValue: unknown, signal?: AbortSignal) {
    return this.#exclusive(async () => {
      requireEmptyArguments(argumentsValue)
      if (signal?.aborted) throw abortError()
      this.#pending = undefined
      await boundedCall(this.#requestTimeoutMs, signal, (attemptSignal) =>
        this.router.clearProviderAuthorization(this.provider, attemptSignal))
      return this.#status(signal)
    })
  }

  async #begin(signal?: AbortSignal) {
    if (this.provider === "libtv") {
      throw new Error("LibTV interactive authorization is not supported")
    }
    if (signal?.aborted) throw abortError()
    this.#pending = undefined
    const request = await boundedCall(
      this.#requestTimeoutMs,
      signal,
      (attemptSignal) => this.router.beginProviderAuthorization(
        this.provider,
        this.provider === "xiaoyunque" ? "api_key" : "oauth",
        attemptSignal,
      ),
    )
    const projected = this.provider === "xiaoyunque"
      ? browserRequest(request, this.#now())
      : externalRequest(request, this.#now())
    this.#pending = projected.pending
    return projected.result
  }

  #currentPending() {
    const pending = this.#pending
    if (!pending || pending.expiresAt <= this.#now()) {
      this.#pending = undefined
      throw new Error("Provider authorization is stale or invalid")
    }
    return pending
  }

  async #status(signal?: AbortSignal): Promise<PluginServiceStatus> {
    if (signal?.aborted) throw abortError()
    if (this.provider === "xiaoyunque") {
      return this.#xiaoyunqueStatus(signal)
    }
    try {
      const authorization = await boundedCall(
        this.#requestTimeoutMs,
        signal,
        (attemptSignal) => this.router.getProviderAuthorization(
          this.provider,
          { probe: true, signal: attemptSignal },
        ),
      )
      if (!authorizationIsReady(authorization)) {
        return mappedAuthorizationStatus(authorization, false)
      }
      if (this.provider === "libtv") {
        await this.#ensureLibTvConfiguration(signal)
      }
      const descriptor = await boundedCall(
        this.#requestTimeoutMs,
        signal,
        (attemptSignal) => this.router.getProvider(this.provider, {
          probeAuthorization: true,
          probeConfiguration: true,
          probeDependencies: true,
          signal: attemptSignal,
        }),
      )
      const configurationReady = descriptor.configuration === undefined
        || descriptor.configuration.state === "not_required"
        || descriptor.configuration.state === "configuration_valid"
      const dependenciesReady = (descriptor.dependency_statuses ?? []).every(
        (dependency) => dependency.available === true
          && dependency.compatible !== false,
      )
      return mappedAuthorizationStatus(
        descriptor.authorization,
        configurationReady && dependenciesReady,
      )
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw abortError()
      try {
        const unprobed = await boundedCall(
          this.#requestTimeoutMs,
          signal,
          (attemptSignal) => this.router.getProviderAuthorization(
            this.provider,
            { probe: false, signal: attemptSignal },
          ),
        )
        return mappedAuthorizationStatus(unprobed, false, true)
      } catch {
        return status("disconnected", false, "failed")
      }
    }
  }

  async #ensureLibTvConfiguration(signal?: AbortSignal) {
    let configuration = await boundedCall(
      this.#requestTimeoutMs,
      signal,
      (attemptSignal) => this.router.getProviderConfiguration(
        this.provider,
        { probe: true, signal: attemptSignal },
      ),
    )
    if (
      configuration.state !== "configuration_required"
      && configuration.state !== "configuration_unavailable"
    ) {
      return configuration
    }
    const resources = await boundedCall(
      this.#requestTimeoutMs,
      signal,
      (attemptSignal) => this.router.listProviderResources(
        this.provider,
        "project",
        attemptSignal,
      ),
    )
    if (resources.length !== 1) return configuration
    const resource = resources[0]!
    configuration = await boundedCall(
      this.#requestTimeoutMs,
      signal,
      (attemptSignal) => this.router.configureProvider(
        this.provider,
        { resource_id: resource.id, resource_type: resource.type },
        attemptSignal,
      ),
    )
    return configuration
  }

  async #xiaoyunqueStatus(signal?: AbortSignal) {
    let snapshot: XiaoYunqueCredentialSnapshot
    try {
      snapshot = await this.#credentials!.read()
    } catch {
      return status("disconnected", false, "failed")
    }
    const hasAccessKey = typeof snapshot.access_key === "string"
    const hasWebSession = snapshot.web_session !== undefined
    if (!hasAccessKey && !hasWebSession) {
      return status("disconnected", false, "unknown")
    }
    if (!hasAccessKey || !hasWebSession) {
      return status("attention", true, "unverified")
    }
    try {
      const [accessKey, webSession] = await Promise.all([
        boundedCall(this.#requestTimeoutMs, signal, (attemptSignal) =>
          this.router.getProviderAuthorization(this.provider, {
            probe: true,
            signal: attemptSignal,
          })),
        boundedCall(this.#requestTimeoutMs, signal, (attemptSignal) =>
          this.#webSessionProbe!(snapshot, attemptSignal)),
      ])
      return authorizationIsReady(accessKey)
        && authorizationIsReady(webSession)
        && accessKey.reason === undefined
        && webSession.reason === undefined
        ? status("connected", true, "verified")
        : status("attention", true, "failed")
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw abortError()
      return status("attention", true, "failed")
    }
  }

  async #exclusive<T>(action: () => Promise<T>) {
    const preceding = this.#tail
    let release!: () => void
    this.#tail = new Promise<void>((resolve) => {
      release = resolve
    })
    await preceding
    try {
      return await action()
    } finally {
      release()
    }
  }
}
