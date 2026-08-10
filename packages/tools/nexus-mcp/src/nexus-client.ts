import {
  workspaceSlug,
  type HostedAccess,
  type HostedCheckout,
  type HostedCheckoutStatus,
  type HostedProviderConnection,
  type HostedQuota,
  type HostedRefreshGrant,
  type HostedSession,
  type HostedTokenResponse,
  type NexusProviderModel,
} from "./contracts.ts";
import type { NexusSessionStore } from "./session-store.ts";

const localNexusOrigin = "http://localhost:3000";
const productionNexusOrigin = "https://nexus.microvoid.io";
const hostedUserApiBasePath = "/api/v1/user";
const hostedWorkspaceApiBasePath = `/api/v1/workspace/${workspaceSlug}`;
const refreshSkewMs = 30_000;
const maximumModelCatalogBytes = 8 * 1024 * 1024;
const maximumModelCatalogEntries = 2_048;
const maximumImageCompletionBytes = 48 * 1024 * 1024;
const maximumImageErrorBytes = 64 * 1024;
const maximumGatewayErrorMessageLength = 1_000;
const maximumVideoContentBytes = 256 * 1024 * 1024;
const maximumVideoJobBytes = 256 * 1024;
const openRouterModelIdPattern = /^~?[A-Za-z0-9]+(?:[._/:-][A-Za-z0-9]+)*$/;
const nexusRequestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const gatewayErrorCodePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const automaticOpenRouterModelIds: ReadonlySet<string> = new Set([
  "openrouter/auto",
  "openrouter/auto-beta",
]);

export interface NexusGatewayErrorDetails {
  readonly code?: number | string;
  readonly message?: string;
  readonly requestId?: string;
}

export class NexusGatewayHttpError extends Error {
  override name = "NexusGatewayHttpError";
  readonly code: number | string | undefined;
  readonly operationId: string | undefined;
  readonly requestId: string | undefined;
  readonly serverMessage: string | undefined;
  readonly status: number;

  constructor(
    label: string,
    status: number,
    details: NexusGatewayErrorDetails = {},
    operationId?: string,
  ) {
    super(`${label} was rejected`);
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      throw new Error("Nexus Gateway HTTP diagnostic status is invalid");
    }
    const trustedOperationId =
      operationId === undefined
        ? undefined
        : firstValidRequestId([operationId]);
    if (operationId !== undefined && trustedOperationId === undefined) {
      throw new Error("Nexus Gateway HTTP diagnostic operation id is invalid");
    }
    this.status = status;
    this.code = validErrorCode(details.code);
    this.operationId = trustedOperationId;
    this.requestId = firstValidRequestId([details.requestId]);
    this.serverMessage = validGatewayErrorMessage(details.message);
  }
}

export class NexusImageHttpError extends NexusGatewayHttpError {
  override name = "NexusImageHttpError";

  constructor(
    status: number,
    operationId: string,
    details: NexusGatewayErrorDetails = {},
  ) {
    super("Nexus image generation request", status, details, operationId);
  }
}

export class NexusVideoHttpError extends NexusGatewayHttpError {
  override name = "NexusVideoHttpError";

  constructor(
    status: number,
    operationId: string,
    details: NexusGatewayErrorDetails = {},
  ) {
    super("Nexus video generation request", status, details, operationId);
  }
}

export function publicNexusErrorMessage(subject: string, error: unknown) {
  const prefix = `Convax ${subject} failed`;
  if (error instanceof NexusGatewayHttpError) {
    const details = [
      `HTTP ${error.status}`,
      ...(error.code === undefined ? [] : [`code ${error.code}`]),
      ...(error.requestId === undefined
        ? []
        : [`request id ${error.requestId}`]),
      ...(error.operationId === undefined
        ? []
        : [`operation id ${error.operationId}`]),
    ].join(", ");
    return `${prefix} (${details})${error.serverMessage ? `: ${error.serverMessage}` : "."}`;
  }
  const message =
    error instanceof Error
      ? validGatewayErrorMessage(error.message)
      : undefined;
  return `${prefix}${message ? `: ${message}` : "."}`;
}

export interface NexusClientOptions {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  localOrigin?: string;
  now?: () => Date;
  productionOrigin?: string;
  /** Test seam; production uses the OpenRouter-recommended bounded polling interval. */
  videoPollIntervalMs?: number;
}

interface NexusGatewayContext {
  credentialEpoch: number;
  dataToken: string;
  dataTokenExpiresAt: string;
  provider: HostedProviderConnection;
}

export interface NexusImageRoute {
  readonly maximumAgeMs: number;
  readonly models: readonly NexusProviderModel[];
  isCurrent(): boolean;
  complete(
    model: Pick<NexusProviderModel, "id" | "outputModalities">,
    prompt: string,
    operationId: string,
    signal: AbortSignal,
  ): Promise<unknown>;
}

export interface NexusVideoArtifact {
  readonly bytes: Uint8Array;
  readonly mimeType: "video/mp4";
}

export interface NexusVideoRoute {
  readonly maximumAgeMs: number;
  readonly models: readonly NexusProviderModel[];
  isCurrent(): boolean;
  complete(
    model: Pick<NexusProviderModel, "id" | "outputModalities">,
    prompt: string,
    operationId: string,
    signal: AbortSignal,
  ): Promise<NexusVideoArtifact>;
}

export interface NexusGenerationRoutes {
  readonly image: NexusImageRoute;
  readonly video: NexusVideoRoute;
}

export class NexusClient {
  readonly #fetch: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  readonly #localOrigin: string;
  readonly #now: () => Date;
  readonly #productionOrigin: string;
  readonly #videoPollIntervalMs: number;
  #accessSessionRequest: Promise<HostedSession> | undefined;
  #credentialEpoch = 0;
  #credentialGeneration = 0;
  #credentialStoreTail: Promise<void> = Promise.resolve();
  #credentialTransition: number | undefined;
  #dataSessionRequest: Promise<HostedSession> | undefined;
  #resolvedOrigin: Promise<string> | undefined;
  #session: HostedSession | undefined;

  constructor(
    private readonly sessions: NexusSessionStore,
    options: NexusClientOptions = {},
  ) {
    this.#fetch = options.fetch ?? fetch;
    this.#localOrigin = new URL(options.localOrigin ?? localNexusOrigin).origin;
    this.#productionOrigin = new URL(
      options.productionOrigin ?? productionNexusOrigin,
    ).origin;
    this.#now = options.now ?? (() => new Date());
    this.#videoPollIntervalMs = options.videoPollIntervalMs ?? 2_000;
    if (
      !Number.isInteger(this.#videoPollIntervalMs) ||
      this.#videoPollIntervalMs < 1 ||
      this.#videoPollIntervalMs > 10_000
    ) {
      throw new Error("Nexus video polling interval is invalid");
    }
  }

  resolveOrigin(): Promise<string> {
    return (this.#resolvedOrigin ??= this.#detectOrigin());
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    nexusOrigin: string;
    redirectUri: string;
  }): Promise<HostedSession> {
    const generation = this.#beginCredentialTransition();
    try {
      const tokens = await this.#tokenRequest(input.nexusOrigin, {
        grantType: "authorization_code",
        code: input.code,
        codeVerifier: input.codeVerifier,
        redirectUri: input.redirectUri,
      });
      const session = this.#sessionFromTokens(input.nexusOrigin, tokens);
      return await this.#withCredentialStore(async () => {
        this.#assertCredentialGeneration(generation);
        await this.sessions.write(refreshGrant(session));
        this.#assertCredentialGeneration(generation);
        this.#replaceSession(session);
        return session;
      });
    } finally {
      this.#finishCredentialTransition(generation);
    }
  }

  async access(): Promise<HostedAccess> {
    const session = await this.ensureAccessSession();
    return parseHostedAccess(
      await this.#authorizedJson<unknown>(
        new URL(hostedUserApiPath("me/access"), session.nexusOrigin),
        session.accessToken,
      ),
    );
  }

  async quota(): Promise<HostedQuota> {
    const session = await this.ensureAccessSession();
    return parseHostedQuota(
      await this.#authorizedJson<unknown>(
        new URL(hostedUserApiPath("me/quota"), session.nexusOrigin),
        session.accessToken,
      ),
      "Nexus quota",
    );
  }

  async createCheckout(
    planKey: string,
    idempotencyKey: string,
  ): Promise<HostedCheckout> {
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(planKey) ||
      planKey.length > 80 ||
      !/^[A-Za-z0-9_-]{8,191}$/u.test(idempotencyKey)
    ) {
      throw new Error("Nexus Checkout request is invalid");
    }
    const session = await this.ensureAccessSession();
    return parseHostedCheckout(
      await this.#authorizedJson<unknown>(
        new URL(hostedUserApiPath("billing-checkouts"), session.nexusOrigin),
        session.accessToken,
        {
          body: JSON.stringify({ planKey }),
          headers: {
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
          },
          method: "POST",
        },
      ),
      session.nexusOrigin,
    );
  }

  async checkoutStatus(checkoutId: string): Promise<HostedCheckoutStatus> {
    if (!/^[A-Za-z0-9_-]{8,191}$/u.test(checkoutId))
      throw new Error("Nexus Checkout id is invalid");
    const session = await this.ensureAccessSession();
    return parseHostedCheckoutStatus(
      await this.#authorizedJson<unknown>(
        new URL(
          hostedUserApiPath(
            `billing-checkouts/${encodeURIComponent(checkoutId)}`,
          ),
          session.nexusOrigin,
        ),
        session.accessToken,
      ),
    );
  }

  async providers(): Promise<readonly HostedProviderConnection[]> {
    const session = await this.ensureAccessSession();
    return this.#providers(session);
  }

  async #providers(
    session: HostedSession,
  ): Promise<readonly HostedProviderConnection[]> {
    const providers = await this.#authorizedJson<unknown>(
      new URL(hostedUserApiPath("provider-connections"), session.nexusOrigin),
      session.accessToken,
    );
    if (!Array.isArray(providers))
      throw new Error("Nexus Provider response is invalid");
    return providers.map(parseProviderConnection);
  }

  async gatewayContext(): Promise<{
    dataToken: string;
    provider: HostedProviderConnection;
  }> {
    const { dataToken, provider } = await this.#gatewayContext();
    return { dataToken, provider };
  }

  async #gatewayContext(): Promise<NexusGatewayContext> {
    const session = await this.ensureDataSession();
    const credentialEpoch = this.#credentialEpoch;
    const providers = await this.#providers(session);
    if (
      credentialEpoch !== this.#credentialEpoch ||
      session !== this.#session
    ) {
      throw new Error("Nexus credentials changed during route discovery");
    }
    const provider = providers.find(
      (connection) =>
        connection.status === "ACTIVE" &&
        connection.protocolProfile === "openrouter",
    );
    if (!provider)
      throw new Error("The Convax Workspace has no active OpenRouter Provider");
    return {
      credentialEpoch,
      dataToken: session.dataToken,
      dataTokenExpiresAt: session.dataTokenExpiresAt,
      provider,
    };
  }

  async imageModels(
    signal?: AbortSignal,
  ): Promise<readonly NexusProviderModel[]> {
    return this.#providerModels(await this.#gatewayContext(), "image", signal);
  }

  async videoModels(
    signal?: AbortSignal,
  ): Promise<readonly NexusProviderModel[]> {
    return this.#providerModels(await this.#gatewayContext(), "video", signal);
  }

  async imageRoute(signal?: AbortSignal): Promise<NexusImageRoute> {
    return (await this.generationRoutes(signal)).image;
  }

  async videoRoute(signal?: AbortSignal): Promise<NexusVideoRoute> {
    return (await this.generationRoutes(signal)).video;
  }

  async generationRoutes(signal?: AbortSignal): Promise<NexusGenerationRoutes> {
    const context = await this.#gatewayContext();
    const [imageModels, videoModels] = await Promise.all([
      this.#providerModels(context, "image", signal),
      this.#providerModels(context, "video", signal),
    ]);
    this.#assertCurrentContext(context);
    const maximumAgeMs = Math.max(
      0,
      new Date(context.dataTokenExpiresAt).getTime() -
        this.#now().getTime() -
        refreshSkewMs,
    );
    const shared = {
      isCurrent: () => context.credentialEpoch === this.#credentialEpoch,
      maximumAgeMs,
    };
    return {
      image: {
        ...shared,
        complete: (model, prompt, operationId, completionSignal) =>
          this.#imageCompletion(
            context,
            model,
            prompt,
            operationId,
            completionSignal,
          ),
        models: imageModels,
      },
      video: {
        ...shared,
        complete: (model, prompt, operationId, completionSignal) =>
          this.#videoCompletion(
            context,
            model,
            prompt,
            operationId,
            completionSignal,
          ),
        models: videoModels,
      },
    };
  }

  async #providerModels(
    context: NexusGatewayContext,
    output: "image" | "video",
    signal?: AbortSignal,
  ): Promise<readonly NexusProviderModel[]> {
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000);
    const url = new URL(`${context.provider.gatewayBaseUrl}/${output}s/models`);
    const response = await this.#fetch(url, {
      headers: { authorization: `Bearer ${context.dataToken}` },
      signal: requestSignal,
    });
    if (!response.ok) {
      const error = await parseGatewayHttpError(response, [context.dataToken]);
      throw new NexusGatewayHttpError(
        `OpenRouter ${output} model catalog request`,
        response.status,
        error,
      );
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declared) && declared > maximumModelCatalogBytes) {
      throw new Error("Nexus model catalog response is too large");
    }
    const serialized = await response.text();
    if (
      new TextEncoder().encode(serialized).byteLength > maximumModelCatalogBytes
    ) {
      throw new Error("Nexus model catalog response is too large");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized) as unknown;
    } catch {
      throw new Error("Nexus model catalog response is invalid");
    }
    const models =
      output === "image"
        ? parseImageModelCatalog(parsed).filter(isExecutableImageModel)
        : parseVideoModelCatalog(parsed).filter(isExecutableVideoModel);
    this.#assertCurrentContext(context);
    return models;
  }

  async imageCompletion(
    model: Pick<NexusProviderModel, "id" | "outputModalities">,
    prompt: string,
    operationId: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    return this.#imageCompletion(
      await this.#gatewayContext(),
      model,
      prompt,
      operationId,
      signal,
    );
  }

  async #imageCompletion(
    context: NexusGatewayContext,
    model: Pick<NexusProviderModel, "id" | "outputModalities">,
    prompt: string,
    operationId: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.#assertCurrentContext(context);
    if (!openRouterModelIdPattern.test(model.id)) {
      throw new Error("Nexus image model is invalid");
    }
    if (!nexusRequestIdPattern.test(operationId)) {
      throw new Error("Nexus image generation operation id is invalid");
    }
    if (!model.outputModalities.includes("image")) {
      throw new Error("Nexus image model is incompatible with OpenRouter image generation");
    }
    const response = await this.#fetch(
      new URL(`${context.provider.gatewayBaseUrl}/images`),
      {
        body: JSON.stringify({
          model: model.id,
          output_format: "png",
          prompt,
        }),
        headers: {
          authorization: `Bearer ${context.dataToken}`,
          "content-type": "application/json",
          "x-nexus-request-id": operationId,
        },
        method: "POST",
        signal,
      },
    );
    if (!response.ok) {
      const error = await parseGatewayHttpError(response, [
        context.dataToken,
        prompt,
      ]);
      throw new NexusImageHttpError(response.status, operationId, error);
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declared) && declared > maximumImageCompletionBytes) {
      throw new Error("Nexus image generation response is too large");
    }
    const serialized = await response.text();
    if (
      new TextEncoder().encode(serialized).byteLength >
      maximumImageCompletionBytes
    ) {
      throw new Error("Nexus image generation response is too large");
    }
    try {
      return JSON.parse(serialized) as unknown;
    } catch {
      throw new Error("Nexus image generation response is invalid");
    }
  }

  async #videoCompletion(
    context: NexusGatewayContext,
    model: Pick<NexusProviderModel, "id" | "outputModalities">,
    prompt: string,
    operationId: string,
    signal: AbortSignal,
  ): Promise<NexusVideoArtifact> {
    this.#assertCurrentContext(context);
    if (
      !openRouterModelIdPattern.test(model.id) ||
      !model.outputModalities.includes("video")
    ) {
      throw new Error("Nexus video model is invalid");
    }
    if (!nexusRequestIdPattern.test(operationId)) {
      throw new Error("Nexus video generation operation id is invalid");
    }
    const submit = await this.#fetch(
      new URL(`${context.provider.gatewayBaseUrl}/videos`),
      {
        body: JSON.stringify({ model: model.id, prompt }),
        headers: {
          authorization: `Bearer ${context.dataToken}`,
          "content-type": "application/json",
          "x-nexus-request-id": operationId,
        },
        method: "POST",
        signal,
      },
    );
    if (!submit.ok) {
      const error = await parseGatewayHttpError(submit, [
        context.dataToken,
        prompt,
      ]);
      throw new NexusVideoHttpError(submit.status, operationId, error);
    }
    const created = parseVideoJob(
      await readJsonResponse(
        submit,
        maximumVideoJobBytes,
        "Nexus video submit response",
      ),
      [context.dataToken, prompt],
    );
    let job = created;
    while (job.status !== "completed") {
      if (["failed", "cancelled", "expired"].includes(job.status)) {
        throw new Error(
          `OpenRouter video generation ${job.status}${job.error ? `: ${job.error}` : ""}`,
        );
      }
      await abortableDelay(this.#videoPollIntervalMs, signal);
      this.#assertCurrentContext(context);
      const poll = await this.#fetch(
        new URL(
          `${context.provider.gatewayBaseUrl}/videos/${encodeURIComponent(created.id)}`,
        ),
        {
          headers: { authorization: `Bearer ${context.dataToken}` },
          signal,
        },
      );
      if (!poll.ok) {
        const error = await parseGatewayHttpError(poll, [
          context.dataToken,
          prompt,
        ]);
        throw new NexusVideoHttpError(poll.status, operationId, error);
      }
      job = parseVideoJob(
        await readJsonResponse(
          poll,
          maximumVideoJobBytes,
          "Nexus video poll response",
        ),
        [context.dataToken, prompt],
      );
    }
    const content = await this.#fetch(
      new URL(
        `${context.provider.gatewayBaseUrl}/videos/${encodeURIComponent(created.id)}/content`,
      ),
      {
        headers: { authorization: `Bearer ${context.dataToken}` },
        signal,
      },
    );
    if (!content.ok) {
      const error = await parseGatewayHttpError(content, [
        context.dataToken,
        prompt,
      ]);
      throw new NexusVideoHttpError(content.status, operationId, error);
    }
    const contentType = content.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "video/mp4") {
      throw new Error("Nexus video content type is unsupported");
    }
    const bytes = await readBoundedResponseBytes(content, maximumVideoContentBytes);
    if (!bytes || bytes.length < 12 || !matchesMp4Signature(bytes)) {
      throw new Error("Nexus video content is invalid");
    }
    return { bytes, mimeType: "video/mp4" };
  }

  async ensureAccessSession(): Promise<HostedSession> {
    if (this.#credentialTransition !== undefined) {
      throw new Error("Nexus credentials are changing");
    }
    const session = this.#session;
    if (
      session &&
      new Date(session.accessTokenExpiresAt).getTime() >
        this.#now().getTime() + refreshSkewMs
    ) {
      return session;
    }
    if (this.#accessSessionRequest) return this.#accessSessionRequest;
    const generation = this.#credentialGeneration;
    const request = this.#refreshAccessSession(generation);
    this.#accessSessionRequest = request;
    void request.then(
      () => {
        if (this.#accessSessionRequest === request)
          this.#accessSessionRequest = undefined;
      },
      () => {
        if (this.#accessSessionRequest === request)
          this.#accessSessionRequest = undefined;
      },
    );
    return request;
  }

  async #refreshAccessSession(generation: number): Promise<HostedSession> {
    const grant = await this.#withCredentialStore(async () => {
      this.#assertCredentialGeneration(generation);
      const stored = await this.sessions.read();
      this.#assertCredentialGeneration(generation);
      return stored;
    });
    if (!grant) throw new Error("Nexus is not connected");
    const tokens = await this.#tokenRequest(grant.nexusOrigin, {
      grantType: "refresh_token",
      refreshToken: grant.refreshToken,
    });
    const refreshed = this.#sessionFromTokens(grant.nexusOrigin, tokens);
    return this.#withCredentialStore(async () => {
      this.#assertCredentialGeneration(generation);
      await this.sessions.write(refreshGrant(refreshed));
      this.#assertCredentialGeneration(generation);
      this.#replaceSession(refreshed);
      return refreshed;
    });
  }

  async ensureDataSession(): Promise<HostedSession> {
    const session = await this.ensureAccessSession();
    if (this.#credentialTransition !== undefined || session !== this.#session) {
      throw new Error("Nexus credentials changed before Data Token refresh");
    }
    if (
      new Date(session.dataTokenExpiresAt).getTime() >
      this.#now().getTime() + refreshSkewMs
    )
      return session;
    if (this.#dataSessionRequest) return this.#dataSessionRequest;
    const generation = this.#credentialGeneration;
    const request = this.#refreshDataSession(session, generation);
    this.#dataSessionRequest = request;
    void request.then(
      () => {
        if (this.#dataSessionRequest === request)
          this.#dataSessionRequest = undefined;
      },
      () => {
        if (this.#dataSessionRequest === request)
          this.#dataSessionRequest = undefined;
      },
    );
    return request;
  }

  async #refreshDataSession(
    session: HostedSession,
    generation: number,
  ): Promise<HostedSession> {
    const result = await this.#authorizedJson<unknown>(
      new URL(hostedUserApiPath("data-tokens"), session.nexusOrigin),
      session.accessToken,
      { method: "POST" },
    );
    const input = record(result, "Nexus Data Token response");
    const dataToken = boundedString(
      input.data_token,
      "Nexus Data Token",
      4_096,
    );
    const expiresAt = isoDate(input.expires_at, "Nexus Data Token expiry");
    const updated: HostedSession = {
      ...session,
      dataToken,
      dataTokenExpiresAt: expiresAt,
    };
    this.#assertCredentialGeneration(generation);
    if (session !== this.#session) {
      throw new Error("Nexus credentials changed during Data Token refresh");
    }
    this.#replaceSession(updated);
    return updated;
  }

  async signOut(): Promise<void> {
    const memoryGrant = this.#session ? refreshGrant(this.#session) : null;
    const generation = this.#beginCredentialTransition();
    try {
      const storedGrant = await this.#withCredentialStore(async () => {
        this.#assertCredentialGeneration(generation);
        const grant = await this.sessions.read().catch(() => null);
        this.#assertCredentialGeneration(generation);
        await this.sessions.clear();
        return grant;
      });
      const grant = memoryGrant ?? storedGrant;
      if (grant) {
        await this.#fetch(
          new URL(hostedWorkspaceAuthApiPath("revoke"), grant.nexusOrigin),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ refreshToken: grant.refreshToken }),
            signal: AbortSignal.timeout(5_000),
          },
        );
      }
    } finally {
      this.#finishCredentialTransition(generation);
    }
  }

  #assertCurrentContext(context: NexusGatewayContext) {
    if (context.credentialEpoch !== this.#credentialEpoch) {
      throw new Error("Nexus image route credentials changed");
    }
  }

  #replaceSession(session: HostedSession) {
    this.#credentialEpoch += 1;
    this.#session = session;
  }

  #beginCredentialTransition(): number {
    const generation = ++this.#credentialGeneration;
    this.#credentialEpoch += 1;
    this.#session = undefined;
    this.#accessSessionRequest = undefined;
    this.#dataSessionRequest = undefined;
    this.#credentialTransition = generation;
    return generation;
  }

  #finishCredentialTransition(generation: number) {
    if (this.#credentialTransition === generation) {
      this.#credentialTransition = undefined;
    }
  }

  #assertCredentialGeneration(generation: number) {
    if (generation !== this.#credentialGeneration) {
      throw new Error("Nexus credentials changed during the request");
    }
  }

  #withCredentialStore<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#credentialStoreTail.then(operation);
    this.#credentialStoreTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #detectOrigin(): Promise<string> {
    try {
      const response = await this.#fetch(
        new URL("/health/ready", this.#localOrigin),
        {
          signal: AbortSignal.timeout(750),
        },
      );
      if (response.ok) return this.#localOrigin;
    } catch {
      // A local development Nexus is optional.
    }
    return this.#productionOrigin;
  }

  async #tokenRequest(
    nexusOrigin: string,
    body:
      | {
          grantType: "authorization_code";
          code: string;
          codeVerifier: string;
          redirectUri: string;
        }
      | { grantType: "refresh_token"; refreshToken: string },
  ): Promise<HostedTokenResponse> {
    const response = await this.#fetch(
      new URL(hostedWorkspaceAuthApiPath("token"), nexusOrigin),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok)
      throw new Error(
        `Nexus token exchange failed with HTTP ${response.status}`,
      );
    return parseTokenResponse(await response.json());
  }

  #sessionFromTokens(
    nexusOrigin: string,
    tokens: HostedTokenResponse,
  ): HostedSession {
    const now = this.#now();
    return {
      accessToken: tokens.access_token,
      accessTokenExpiresAt: new Date(
        now.getTime() + tokens.expires_in * 1_000,
      ).toISOString(),
      dataToken: tokens.data_token,
      dataTokenExpiresAt: tokens.data_token_expires_at,
      nexusOrigin: new URL(nexusOrigin).origin,
      refreshToken: tokens.refresh_token,
      schema: "convax.nexus-session/1",
      workspaceSlug,
    };
  }

  async #authorizedJson<T>(
    url: URL,
    accessToken: string,
    init: {
      body?: string;
      headers?: Readonly<Record<string, string>>;
      method?: string;
    } = {},
  ): Promise<T> {
    const response = await this.#fetch(url, {
      ...(init.body === undefined ? {} : { body: init.body }),
      method: init.method ?? "GET",
      headers: {
        ...init.headers,
        authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`Nexus User API failed with HTTP ${response.status}`);
    return (await response.json()) as T;
  }
}

function hostedUserApiPath(path: string): string {
  return `${hostedUserApiBasePath}/${path}`;
}

function hostedWorkspaceAuthApiPath(action: "revoke" | "token"): string {
  return `${hostedWorkspaceApiBasePath}/auth/${action}`;
}

async function parseGatewayHttpError(
  response: Response,
  sensitiveValues: readonly string[],
): Promise<NexusGatewayErrorDetails> {
  const headerRequestId = firstValidRequestId(
    [
      response.headers.get("x-request-id"),
      response.headers.get("x-nexus-request-id"),
    ],
    sensitiveValues,
  );
  const serialized = await readBoundedResponseText(
    response,
    maximumImageErrorBytes,
  ).catch(() => undefined);
  if (serialized === undefined) {
    return headerRequestId === undefined
      ? {}
      : { requestId: headerRequestId };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return headerRequestId === undefined
      ? {}
      : { requestId: headerRequestId };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return headerRequestId === undefined
      ? {}
      : { requestId: headerRequestId };
  }
  const input = parsed as Record<string, unknown>;
  const error =
    input.error &&
    typeof input.error === "object" &&
    !Array.isArray(input.error)
      ? (input.error as Record<string, unknown>)
      : undefined;
  const code = safeGatewayErrorCode(error?.code, sensitiveValues);
  const message = safeGatewayErrorMessage(error?.message, sensitiveValues);
  const requestId = firstValidRequestId(
    [headerRequestId, input.request_id],
    sensitiveValues,
  );
  return {
    ...(code === undefined ? {} : { code }),
    ...(message === undefined ? {} : { message }),
    ...(requestId === undefined ? {} : { requestId }),
  };
}

async function readJsonResponse(response: Response, maximumBytes: number, label: string): Promise<unknown> {
  const serialized = await readBoundedResponseText(response, maximumBytes);
  if (serialized === undefined) throw new Error(`${label} is too large`);
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new Error(`${label} is invalid`);
  }
}

async function readBoundedResponseBytes(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array | undefined> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    return undefined;
  }
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return undefined;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseVideoJob(
  value: unknown,
  sensitiveValues: readonly string[],
): { error?: string; id: string; status: string } {
  const input = record(value, "Nexus video job");
  const id = boundedString(input.id, "Nexus video job id", 191);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(id)) {
    throw new Error("Nexus video job id is invalid");
  }
  const status = boundedString(input.status, "Nexus video job status", 32);
  if (
    ![
      "pending",
      "queued",
      "processing",
      "in_progress",
      "completed",
      "failed",
      "cancelled",
      "expired",
    ].includes(status)
  ) {
    throw new Error("Nexus video job status is invalid");
  }
  const error =
    input.error === undefined
      ? undefined
      : safeGatewayErrorMessage(input.error, sensitiveValues);
  return { ...(error === undefined ? {} : { error }), id, status };
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(): Error {
  const error = new Error("Nexus request was cancelled");
  error.name = "AbortError";
  return error;
}

function matchesMp4Signature(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

async function readBoundedResponseText(
  response: Response,
  maximumBytes: number,
): Promise<string | undefined> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    return undefined;
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return undefined;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function validErrorCode(value: unknown): number | string | undefined {
  if (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 999_999
  ) {
    return value as number;
  }
  return typeof value === "string" && gatewayErrorCodePattern.test(value)
    ? value
    : undefined;
}

function validRequestId(value: unknown) {
  return typeof value === "string" && nexusRequestIdPattern.test(value)
    ? value
    : undefined;
}

function parseHostedAccess(value: unknown): HostedAccess {
  const input = record(value, "Nexus access response");
  const workspace = record(input.workspace, "Nexus Workspace");
  const access = record(input.access, "Nexus WorkspaceAccess");
  const plan =
    input.plan === undefined
      ? undefined
      : parseHostedPlan(input.plan, "Nexus current Plan");
  const quota =
    input.quota === undefined
      ? undefined
      : parseHostedQuota(input.quota, "Nexus quota");
  const billing =
    input.billing === undefined ? undefined : parseHostedBilling(input.billing);
  return {
    subject: boundedString(input.subject, "Nexus subject", 191),
    workspace: {
      id: boundedString(workspace.id, "Nexus Workspace id", 160),
      slug: boundedString(workspace.slug, "Nexus Workspace slug", 80),
      name: boundedString(workspace.name, "Nexus Workspace name", 160),
    },
    access: {
      id: boundedString(access.id, "Nexus WorkspaceAccess id", 160),
      planId: boundedString(
        access.planId,
        "Nexus WorkspaceAccess Plan id",
        160,
      ),
      status: boundedString(access.status, "Nexus WorkspaceAccess status", 40),
      accessStartsAt: isoDate(
        access.accessStartsAt,
        "Nexus WorkspaceAccess start",
      ),
      ...(access.accessEndsAt === undefined
        ? {}
        : {
            accessEndsAt: isoDate(
              access.accessEndsAt,
              "Nexus WorkspaceAccess end",
            ),
          }),
    },
    ...(plan === undefined ? {} : { plan }),
    ...(quota === undefined ? {} : { quota }),
    ...(billing === undefined ? {} : { billing }),
  };
}

function parseHostedBilling(value: unknown): HostedAccess["billing"] {
  const input = record(value, "Nexus billing");
  if (
    typeof input.checkoutAvailable !== "boolean" ||
    !Array.isArray(input.availablePlans) ||
    input.availablePlans.length > 32
  ) {
    throw new Error("Nexus billing response is invalid");
  }
  return {
    ...(input.subscriptionStatus === undefined ||
    input.subscriptionStatus === null
      ? {}
      : {
          subscriptionStatus: boundedString(
            input.subscriptionStatus,
            "Nexus subscription status",
            64,
          ),
        }),
    checkoutAvailable: input.checkoutAvailable,
    availablePlans: input.availablePlans.map((candidate, index) =>
      parseHostedPlan(candidate, `Nexus available Plan ${index}`),
    ),
  };
}

function parseHostedQuota(value: unknown, label: string): HostedQuota {
  const input = record(value, label);
  const usdFields = [
    input.budgetUsd,
    input.reservedUsd,
    input.consumedUsd,
    input.availableUsd,
  ];
  const providedUsdFields = usdFields.filter((field) => field !== undefined);
  if (
    providedUsdFields.length !== 0 &&
    providedUsdFields.length !== usdFields.length
  ) {
    throw new Error("Nexus quota USD response is incomplete");
  }
  return {
    ...(providedUsdFields.length === 0
      ? {}
      : {
          budgetUsd: decimalUsd(input.budgetUsd, "Nexus quota budget"),
          reservedUsd: decimalUsd(input.reservedUsd, "Nexus reserved budget"),
          consumedUsd: decimalUsd(input.consumedUsd, "Nexus consumed budget"),
          availableUsd: decimalUsd(
            input.availableUsd,
            "Nexus available budget",
          ),
        }),
    availableUnits: decimalUnits(input.availableUnits, "Nexus available quota"),
    consumedUnits: decimalUnits(input.consumedUnits, "Nexus consumed quota"),
    periodEnd: isoDate(input.periodEnd, "Nexus quota period end"),
  };
}

function parseHostedPlan(value: unknown, label: string) {
  const input = record(value, label);
  const billingInterval = boundedString(
    input.billingInterval,
    `${label} billing interval`,
    16,
  );
  if (billingInterval !== "MONTH" && billingInterval !== "YEAR")
    throw new Error(`${label} billing interval is invalid`);
  const key = boundedString(input.key, `${label} key`, 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(key))
    throw new Error(`${label} key is invalid`);
  return {
    id: boundedString(input.id, `${label} id`, 160),
    key,
    name: boundedString(input.name, `${label} name`, 160),
    billingInterval,
  };
}

function parseHostedCheckout(
  value: unknown,
  nexusOrigin: string,
): HostedCheckout {
  const input = record(value, "Nexus Checkout response");
  const checkoutId = boundedString(
    input.checkoutId,
    "Nexus Checkout id",
    191,
  );
  const browserUrl =
    input.action === undefined
      ? validatedHttpsCheckoutUrl(input.externalUrl)
      : checkoutActionBrowserUrl(input.action, nexusOrigin, checkoutId);
  return {
    browserUrl,
    checkoutId,
    status: boundedString(input.status, "Nexus Checkout status", 32),
  };
}

function checkoutActionBrowserUrl(
  value: unknown,
  nexusOrigin: string,
  checkoutId: string,
): string {
  const action = record(value, "Nexus Checkout action");
  const kind = boundedString(action.kind, "Nexus Checkout action kind", 32);
  if (kind === "REDIRECT") return validatedHttpsCheckoutUrl(action.url);
  if (kind !== "QR_CODE") {
    throw new Error("Nexus Checkout action is invalid");
  }
  boundedString(action.codeUrl, "Nexus Checkout QR code URL", 4_096);
  const origin = new URL(nexusOrigin);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("Nexus Account Portal origin is invalid");
  }
  const portal = new URL(
    `/workspace/${encodeURIComponent(workspaceSlug)}/account/subscription`,
    origin,
  );
  portal.searchParams.set("checkout", checkoutId);
  portal.searchParams.set("source", "convax-plugin");
  return portal.href;
}

function validatedHttpsCheckoutUrl(value: unknown): string {
  const checkoutUrl = boundedString(value, "Nexus Checkout URL", 4_096);
  const url = new URL(checkoutUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.href !== checkoutUrl
  ) {
    throw new Error("Nexus Checkout URL is invalid");
  }
  return checkoutUrl;
}

function parseHostedCheckoutStatus(value: unknown): HostedCheckoutStatus {
  const input = record(value, "Nexus Checkout status response");
  return {
    checkoutId: boundedString(input.checkoutId, "Nexus Checkout id", 191),
    status: boundedString(input.status, "Nexus Checkout status", 32),
    expiresAt: isoDate(input.expiresAt, "Nexus Checkout expiry"),
    ...(input.convertedAt === undefined
      ? {}
      : {
          convertedAt: isoDate(
            input.convertedAt,
            "Nexus Checkout conversion time",
          ),
        }),
  };
}

function decimalUnits(value: unknown, label: string): string {
  const text = boundedString(value, label, 32);
  if (!/^\d+$/u.test(text)) throw new Error(`${label} is invalid`);
  return text;
}

function decimalUsd(value: unknown, label: string): string {
  const text = boundedString(value, label, 32);
  if (!/^(?:0|[1-9]\d*)\.\d{6}$/u.test(text)) {
    throw new Error(`${label} is invalid`);
  }
  return text;
}

function refreshGrant(session: HostedSession): HostedRefreshGrant {
  return {
    nexusOrigin: session.nexusOrigin,
    refreshToken: session.refreshToken,
    schema: "convax.nexus-refresh-grant/1",
    workspaceSlug,
  };
}

function parseTokenResponse(value: unknown): HostedTokenResponse {
  const input = record(value, "Nexus token response");
  const expiresIn = input.expires_in;
  if (
    !Number.isSafeInteger(expiresIn) ||
    Number(expiresIn) < 60 ||
    Number(expiresIn) > 86_400
  ) {
    throw new Error("Nexus access token expiry is invalid");
  }
  if (input.token_type !== "Bearer")
    throw new Error("Nexus token type is invalid");
  return {
    access_token: boundedString(
      input.access_token,
      "Nexus access token",
      8_192,
    ),
    data_token: boundedString(input.data_token, "Nexus Data Token", 4_096),
    data_token_expires_at: isoDate(
      input.data_token_expires_at,
      "Nexus Data Token expiry",
    ),
    expires_in: Number(expiresIn),
    refresh_token: boundedString(
      input.refresh_token,
      "Nexus refresh token",
      4_096,
    ),
    token_type: "Bearer",
  };
}

function parseProviderConnection(value: unknown): HostedProviderConnection {
  const input = record(value, "Nexus ProviderConnection");
  const gatewayBaseUrl = boundedString(
    input.gatewayBaseUrl,
    "Nexus Gateway Base URL",
    2_048,
  );
  const url = new URL(gatewayBaseUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Nexus Gateway Base URL is invalid");
  }
  return {
    gatewayBaseUrl: url.href.replace(/\/$/u, ""),
    id: boundedString(input.id, "Nexus ProviderConnection id", 160),
    name: boundedString(input.name, "Nexus ProviderConnection name", 160),
    protocolProfile: boundedString(
      input.protocolProfile,
      "Nexus ProviderConnection protocol",
      80,
    ),
    status: boundedString(input.status, "Nexus ProviderConnection status", 40),
    workspaceId: boundedString(input.workspaceId, "Nexus Workspace id", 160),
  };
}

function isExecutableImageModel({
  id,
  outputModalities,
}: NexusProviderModel): boolean {
  return (
    outputModalities.includes("image") &&
    !automaticOpenRouterModelIds.has(id)
  );
}

function isExecutableVideoModel({
  id,
  outputModalities,
}: NexusProviderModel): boolean {
  return outputModalities.includes("video") && !automaticOpenRouterModelIds.has(id);
}

function modelCatalogEntries(value: unknown): readonly unknown[] {
  const input = record(value, "OpenRouter model catalog");
  if (
    !Array.isArray(input.data) ||
    input.data.length > maximumModelCatalogEntries
  ) {
    throw new Error("OpenRouter model catalog response is invalid");
  }
  return input.data;
}

function parseModelIdentity(value: unknown, index: number) {
  const model = record(value, `OpenRouter model catalog entry ${index}`);
  const id = boundedString(
    model.id,
    `OpenRouter model catalog entry ${index} id`,
    191,
  );
  if (!openRouterModelIdPattern.test(id)) {
    throw new Error(`OpenRouter model catalog entry ${index} id is invalid`);
  }
  return {
    id,
    model,
    name: boundedString(
      model.name,
      `OpenRouter model catalog entry ${index} name`,
      160,
    ),
  };
}

function assertDistinctModelIds(models: readonly NexusProviderModel[]) {
  if (new Set(models.map(({ id }) => id)).size !== models.length) {
    throw new Error("OpenRouter model catalog contains duplicate ids");
  }
}

function parseImageModelCatalog(
  value: unknown,
): readonly NexusProviderModel[] {
  const models = modelCatalogEntries(value).map((value, index) => {
    const { id, model, name } = parseModelIdentity(value, index);
    const architecture = record(
      model.architecture,
      `OpenRouter image model catalog entry ${index} architecture`,
    );
    if (
      !Array.isArray(architecture.output_modalities) ||
      architecture.output_modalities.length === 0 ||
      architecture.output_modalities.length > 16
    ) {
      throw new Error(
        `OpenRouter image model catalog entry ${index} output modalities are invalid`,
      );
    }
    const outputModalities = architecture.output_modalities.map(
      (value, modalityIndex) =>
        boundedString(
          value,
          `OpenRouter image model catalog entry ${index} output modality ${modalityIndex}`,
          32,
        ),
    );
    if (new Set(outputModalities).size !== outputModalities.length) {
      throw new Error(
        `OpenRouter image model catalog entry ${index} output modalities contain duplicates`,
      );
    }
    return { id, name, outputModalities };
  });
  assertDistinctModelIds(models);
  return models;
}

function parseVideoModelCatalog(
  value: unknown,
): readonly NexusProviderModel[] {
  const models = modelCatalogEntries(value).map((entry, index) => {
    const { id, name } = parseModelIdentity(entry, index);
    return { id, name, outputModalities: ["video"] };
  });
  assertDistinctModelIds(models);
  return models;
}

function firstValidRequestId(
  values: readonly unknown[],
  sensitiveValues: readonly string[] = [],
): string | undefined {
  for (const value of values) {
    const requestId = validRequestId(value);
    if (
      requestId !== undefined &&
      !looksLikeCredential(requestId) &&
      !sensitiveValues.some(
        (sensitive) => sensitive.length >= 4 && requestId.includes(sensitive),
      )
    ) {
      return requestId;
    }
  }
  return undefined;
}

function safeGatewayErrorCode(
  value: unknown,
  sensitiveValues: readonly string[],
): number | string | undefined {
  const code = validErrorCode(value);
  if (
    typeof code === "string" &&
    (looksLikeCredential(code) ||
      sensitiveValues.some(
        (sensitive) => sensitive.length >= 4 && code.includes(sensitive),
      ))
  ) {
    return undefined;
  }
  return code;
}

function safeGatewayErrorMessage(
  value: unknown,
  sensitiveValues: readonly string[],
): string | undefined {
  if (typeof value !== "string") return undefined;
  const message = value.replace(/\s+/gu, " ").trim();
  if (
    message.length === 0 ||
    message.length > maximumGatewayErrorMessageLength ||
    /[\u0000-\u001F\u007F]/u.test(message) ||
    looksLikeCredential(message) ||
    /(?:^|\s)(?:\/[A-Za-z0-9._-]+){2,}(?:\/|$)/u.test(message) ||
    /\b[A-Za-z]:\\/u.test(message) ||
    sensitiveValues.some(
      (sensitive) => sensitive.length >= 4 && message.includes(sensitive),
    )
  ) {
    return undefined;
  }
  return message;
}

function validGatewayErrorMessage(value: unknown): string | undefined {
  return safeGatewayErrorMessage(value, []);
}

function looksLikeCredential(value: string): boolean {
  return (
    /\bBearer\s+\S+/iu.test(value) ||
    /\b(?:sk|nxs)-[A-Za-z0-9_-]{8,}\b/u.test(value) ||
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u.test(value)
  );
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function boundedString(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximumLength ||
    value.includes("\0")
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function isoDate(value: unknown, label: string): string {
  const text = boundedString(value, label, 80);
  const time = new Date(text).getTime();
  if (!Number.isFinite(time)) throw new Error(`${label} is invalid`);
  return new Date(time).toISOString();
}
