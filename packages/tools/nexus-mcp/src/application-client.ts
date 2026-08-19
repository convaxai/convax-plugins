import { createHash } from "node:crypto";

import {
  applicationCredentialsSchema,
  type AuthXTokenResponse,
  type NexusApplicationAccess,
  type NexusApplicationCheckout,
  type GenerationProviderParameters,
  type NexusProviderModel,
} from "./contracts.ts";
import {
  authXScope,
  resolveAuthXPublicClientProfile,
  type AuthXPublicClientProfile,
} from "./authx-profile.ts";
import { AuthXTokenVerifier } from "./authx-token-verifier.ts";
import type { NexusCredentialStore } from "./credential-store.ts";

const productionNexusOrigin = "https://nexus.microvoid.io";
const productionGatewayOrigin = "https://gateway.nexus.microvoid.io";
const applicationApiBasePath = "/api/v1/application-access";
const refreshSkewMs = 30_000;
const maximumJsonBytes = 8 * 1024 * 1024;
const maximumImageBytes = 48 * 1024 * 1024;
const maximumAudioBytes = 48 * 1024 * 1024;
const maximumVideoBytes = 256 * 1024 * 1024;
const maximumErrorBytes = 64 * 1024;
const maximumModelEntries = 2_048;
const modelIdPattern = /^~?[A-Za-z0-9]+(?:[._/:-][A-Za-z0-9]+)*$/u;
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u;
const terminalVideoStatuses = new Set([
  "completed",
  "failed",
  "cancelled",
  "expired",
]);

export interface NexusClientOptions {
  authxProfile?: AuthXPublicClientProfile;
  environment?: Readonly<Record<string, string | undefined>>;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  gatewayOrigins?: readonly string[];
  nexusOrigin?: string;
  now?: () => Date;
}

interface IdentitySession {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
  sessionId: string;
  subject: string;
}

interface GatewayContext {
  access: NexusApplicationAccess;
  epoch: number;
  identity: IdentitySession;
}

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
    this.status = status;
    this.code = safeErrorCode(details.code, []);
    this.operationId = safeRequestId(operationId, []);
    this.requestId = safeRequestId(details.requestId, []);
    this.serverMessage = safeErrorMessage(details.message, []);
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

export class NexusAudioHttpError extends NexusGatewayHttpError {
  override name = "NexusAudioHttpError";

  constructor(
    status: number,
    operationId: string,
    details: NexusGatewayErrorDetails = {},
  ) {
    super("Nexus audio generation request", status, details, operationId);
  }
}

export class NexusApplicationAccessError extends Error {
  override name = "NexusApplicationAccessError";
  readonly code: string | undefined;
  readonly status: number;

  constructor(status: number, code?: string) {
    super(applicationAccessErrorMessage(status, code));
    this.status = status;
    this.code = code;
  }
}

export type NexusAudioMimeType =
  | "audio/aac"
  | "audio/flac"
  | "audio/mpeg"
  | "audio/ogg"
  | "audio/opus"
  | "audio/pcm"
  | "audio/wav"
  | "audio/x-wav";

export interface NexusAudioRoute {
  readonly maximumAgeMs: number;
  readonly models: readonly NexusProviderModel[];
  complete(
    model: Pick<NexusProviderModel, "id" | "outputModalities">,
    prompt: string,
    providerParameters: GenerationProviderParameters,
    operationId: string,
    signal: AbortSignal,
  ): Promise<{ bytes: Uint8Array; mimeType: NexusAudioMimeType }>;
  isCurrent(): boolean;
}

export interface NexusImageRoute {
  readonly maximumAgeMs: number;
  readonly models: readonly NexusProviderModel[];
  complete(
    model: Pick<NexusProviderModel, "id" | "outputModalities">,
    prompt: string,
    providerParameters: GenerationProviderParameters,
    operationId: string,
    signal: AbortSignal,
  ): Promise<unknown>;
  isCurrent(): boolean;
}

export interface NexusVideoTask {
  error?: string;
  status:
    | "pending"
    | "queued"
    | "processing"
    | "in_progress"
    | "completed"
    | "failed"
    | "cancelled"
    | "expired";
  taskId: string;
}

export interface NexusVideoRoute {
  readonly maximumAgeMs: number;
  readonly models: readonly NexusProviderModel[];
  cancel(
    taskId: string,
    operationId: string,
    signal: AbortSignal,
  ): Promise<NexusVideoTask>;
  content(
    taskId: string,
    operationId: string,
    signal: AbortSignal,
  ): Promise<{ bytes: Uint8Array; mimeType: "video/mp4" }>;
  get(
    taskId: string,
    operationId: string,
    signal: AbortSignal,
  ): Promise<NexusVideoTask>;
  isCurrent(): boolean;
  submit(
    model: Pick<NexusProviderModel, "id" | "outputModalities">,
    prompt: string,
    providerParameters: GenerationProviderParameters,
    operationId: string,
    requestDigest: string,
    signal: AbortSignal,
  ): Promise<NexusVideoTask>;
}

export interface NexusGenerationRoutes {
  readonly audio: NexusAudioRoute;
  readonly image: NexusImageRoute;
  readonly video: NexusVideoRoute;
}

export class NexusClient {
  readonly #authxProfile: Promise<AuthXPublicClientProfile>;
  readonly #fetch: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  readonly #gatewayOrigins: ReadonlySet<string>;
  readonly #nexusOrigin: string;
  readonly #now: () => Date;
  #credentialEpoch = 0;
  #identityRequest: Promise<IdentitySession> | undefined;
  #identitySession: IdentitySession | undefined;

  constructor(
    private readonly credentials: NexusCredentialStore,
    options: NexusClientOptions = {},
  ) {
    this.#authxProfile = options.authxProfile
      ? Promise.resolve(options.authxProfile)
      : resolveAuthXPublicClientProfile(options.environment);
    this.#nexusOrigin = exactConfiguredOrigin(
      options.nexusOrigin ?? productionNexusOrigin,
      "Nexus origin",
      options.nexusOrigin !== undefined,
    );
    const configuredGatewayOrigins =
      options.gatewayOrigins ??
      (options.nexusOrigin === undefined
        ? [productionGatewayOrigin, this.#nexusOrigin]
        : [this.#nexusOrigin]);
    const gatewayOrigins = [...configuredGatewayOrigins, this.#nexusOrigin];
    this.#gatewayOrigins = new Set(
      gatewayOrigins.map((origin) =>
        exactConfiguredOrigin(
          origin,
          "Nexus Gateway origin",
          options.nexusOrigin !== undefined,
        ),
      ),
    );
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? (() => new Date());
  }

  async resolveAuthXIssuer(): Promise<string> {
    return (await this.#authxProfile).issuer;
  }

  async authorizationUrl(input: {
    codeChallenge: string;
    nonce: string;
    redirectUri: string;
    state: string;
  }) {
    const profile = await this.#authxProfile;
    const url = new URL("/oauth/authorize", profile.issuer);
    url.searchParams.set("client_id", profile.clientId);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set(
      "redirect_uri",
      exactLoopbackRedirect(input.redirectUri, profile),
    );
    url.searchParams.set("nonce", highEntropyValue(input.nonce, "AuthX nonce"));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", authXScope(profile));
    url.searchParams.set("state", highEntropyValue(input.state, "AuthX state"));
    return url.href;
  }

  async exchangeAuthorizationCode(input: {
    authorizationId: string;
    code: string;
    codeVerifier: string;
    nonce: string;
    redirectUri: string;
  }): Promise<void> {
    const profile = await this.#authxProfile;
    const token = await this.#tokenRequest({
      client_id: profile.clientId,
      code: boundedString(input.code, "AuthX authorization code", 4_096),
      code_verifier: boundedString(
        input.codeVerifier,
        "AuthX PKCE verifier",
        128,
      ),
      grant_type: "authorization_code",
      redirect_uri: exactLoopbackRedirect(input.redirectUri, profile),
    });
    const identity = await this.#identityFromToken(token, input.nonce);
    boundedId(input.authorizationId, "Convax authorization id");
    await this.#currentWithIdentity(identity);
    await this.credentials.write({
      accountBinding: createHash("sha256")
        .update(`${profile.issuer}\0${profile.clientId}\0${identity.subject}`)
        .digest("hex"),
      authxIssuer: profile.issuer,
      nexusOrigin: this.#nexusOrigin,
      refreshToken: identity.refreshToken,
      schema: applicationCredentialsSchema,
    });
    this.#credentialEpoch += 1;
    this.#identitySession = identity;
  }

  async current(): Promise<NexusApplicationAccess> {
    const identity = await this.#ensureIdentity();
    return this.#currentWithIdentity(identity);
  }

  async #currentWithIdentity(
    identity: IdentitySession,
  ): Promise<NexusApplicationAccess> {
    return this.#authorizedApplicationJson(
      new URL(`${applicationApiBasePath}/status`, this.#nexusOrigin),
      identity.accessToken,
    ).then((value) => parseApplicationAccess(value, this.#gatewayOrigins));
  }

  async createCheckout(
    planKey: string,
    idempotencyKey: string,
  ): Promise<NexusApplicationCheckout> {
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(planKey) ||
      planKey.length > 80 ||
      !/^[A-Za-z0-9_-]{8,191}$/u.test(idempotencyKey)
    ) {
      throw new Error("Nexus Application Checkout request is invalid");
    }
    const access = await this.current();
    if (
      !access.checkoutAvailable ||
      access.planKey !== planKey ||
      access.state !== "ACTIVE"
    ) {
      throw new Error("The selected Nexus Plan is not available");
    }
    const identity = await this.#ensureIdentity();
    return parseCheckout(
      await this.#authorizedApplicationJson(
        new URL(`${applicationApiBasePath}/checkout`, this.#nexusOrigin),
        identity.accessToken,
        {
          headers: { "idempotency-key": idempotencyKey },
          method: "POST",
        },
      ),
    );
  }

  async signOut(): Promise<void> {
    const stored = await this.credentials.read();
    let identity: IdentitySession | undefined;
    let failure: unknown;
    try {
      try {
        identity = stored ? await this.#ensureIdentity() : undefined;
      } catch (error) {
        failure = error;
      }
      if (stored) {
        try {
          const profile = await this.#authxProfile;
          const response = await this.#fetch(
            new URL("/oauth/revoke", profile.issuer),
            {
              body: formBody({
                client_id: profile.clientId,
                token: identity?.refreshToken ?? stored.refreshToken,
                token_type_hint: "refresh_token",
              }),
              headers: {
                "content-type": "application/x-www-form-urlencoded",
              },
              method: "POST",
              redirect: "error",
              signal: AbortSignal.timeout(15_000),
            },
          );
          if (!response.ok) {
            throw new Error("AuthX refresh credential revocation was rejected");
          }
        } catch (error) {
          failure ??= error;
        }
      }
    } finally {
      await this.credentials.clear();
      this.#identitySession = undefined;
      this.#identityRequest = undefined;
      this.#credentialEpoch += 1;
    }
    if (failure) throw failure;
  }

  async gatewayContext() {
    const context = await this.#gatewayContext();
    return {
      accessToken: context.identity.accessToken,
      provider: {
        gatewayBaseUrl: context.access.gatewayBaseUrl,
      },
    };
  }

  async generationRoutes(signal?: AbortSignal): Promise<NexusGenerationRoutes> {
    const context = await this.#gatewayContext();
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000);
    const [audioModels, imageModels, videoModels] = await Promise.all([
      this.#models(context, "audio", requestSignal),
      this.#models(context, "image", requestSignal),
      this.#models(context, "video", requestSignal),
    ]);
    this.#assertCurrent(context);
    const shared = {
      isCurrent: () => context.epoch === this.#credentialEpoch,
      maximumAgeMs: 60_000,
    };
    return {
      audio: {
        ...shared,
        complete: (
          model,
          prompt,
          providerParameters,
          operationId,
          completionSignal,
        ) =>
          this.#audioCompletion(
            context,
            model,
            prompt,
            providerParameters,
            operationId,
            completionSignal,
          ),
        models: audioModels,
      },
      image: {
        ...shared,
        complete: (
          model,
          prompt,
          providerParameters,
          operationId,
          completionSignal,
        ) =>
          this.#imageCompletion(
            context,
            model,
            prompt,
            providerParameters,
            operationId,
            completionSignal,
          ),
        models: imageModels,
      },
      video: {
        ...shared,
        cancel: (taskId, operationId, completionSignal) =>
          this.#videoAction(
            context,
            taskId,
            "cancel",
            operationId,
            completionSignal,
          ),
        content: (taskId, operationId, completionSignal) =>
          this.#videoContent(context, taskId, operationId, completionSignal),
        get: (taskId, operationId, completionSignal) =>
          this.#videoAction(
            context,
            taskId,
            "get",
            operationId,
            completionSignal,
          ),
        models: videoModels,
        submit: (
          model,
          prompt,
          providerParameters,
          operationId,
          requestDigest,
          completionSignal,
        ) =>
          this.#videoSubmit(
            context,
            model,
            prompt,
            providerParameters,
            operationId,
            requestDigest,
            completionSignal,
          ),
      },
    };
  }

  async videoRoute(signal?: AbortSignal): Promise<NexusVideoRoute> {
    const context = await this.#gatewayContext();
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000);
    const models = await this.#models(context, "video", requestSignal);
    this.#assertCurrent(context);
    return {
      cancel: (taskId, operationId, completionSignal) =>
        this.#videoAction(
          context,
          taskId,
          "cancel",
          operationId,
          completionSignal,
        ),
      content: (taskId, operationId, completionSignal) =>
        this.#videoContent(context, taskId, operationId, completionSignal),
      get: (taskId, operationId, completionSignal) =>
        this.#videoAction(
          context,
          taskId,
          "get",
          operationId,
          completionSignal,
        ),
      isCurrent: () => context.epoch === this.#credentialEpoch,
      maximumAgeMs: 60_000,
      models,
      submit: (
        model,
        prompt,
        providerParameters,
        operationId,
        requestDigest,
        completionSignal,
      ) =>
        this.#videoSubmit(
          context,
          model,
          prompt,
          providerParameters,
          operationId,
          requestDigest,
          completionSignal,
        ),
    };
  }

  async #gatewayContext(): Promise<GatewayContext> {
    const stored = await this.credentials.read();
    if (!stored) throw new Error("Convax is not connected to Nexus");
    const profile = await this.#authxProfile;
    if (
      stored.authxIssuer !== profile.issuer ||
      stored.nexusOrigin !== this.#nexusOrigin
    ) {
      throw new Error("Nexus credential authority does not match configuration");
    }
    const identity = await this.#ensureIdentity();
    const access = await this.#currentWithIdentity(identity);
    return { access, epoch: this.#credentialEpoch, identity };
  }

  async #ensureIdentity(): Promise<IdentitySession> {
    const current = this.#identitySession;
    if (current && current.expiresAt - refreshSkewMs > this.#now().getTime()) {
      return current;
    }
    if (this.#identityRequest) return this.#identityRequest;
    const request = this.#refreshIdentity();
    this.#identityRequest = request;
    try {
      return await request;
    } finally {
      if (this.#identityRequest === request) this.#identityRequest = undefined;
    }
  }

  async #refreshIdentity() {
    const stored = await this.credentials.read();
    if (!stored) throw new Error("Convax is not connected to Nexus");
    if (
      stored.authxIssuer !== (await this.#authxProfile).issuer ||
      stored.nexusOrigin !== this.#nexusOrigin
    ) {
      throw new Error(
        "Nexus credential authority does not match configuration",
      );
    }
    const profile = await this.#authxProfile;
    const token = await this.#tokenRequest({
      client_id: profile.clientId,
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken,
      scope: authXScope(profile),
    });
    const identity = await this.#identityFromToken(token);
    await this.credentials.write({
      ...stored,
      refreshToken: identity.refreshToken,
    });
    this.#identitySession = identity;
    this.#credentialEpoch += 1;
    return identity;
  }

  async #tokenRequest(
    fields: Readonly<Record<string, string>>,
  ): Promise<AuthXTokenResponse> {
    const response = await this.#fetch(
      new URL("/oauth/token", (await this.#authxProfile).issuer),
      {
        body: formBody(fields),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw new Error("AuthX token request was rejected");
    return parseTokenResponse(
      await readJson(response, maximumJsonBytes, "AuthX token response"),
    );
  }

  async #identityFromToken(
    token: AuthXTokenResponse,
    expectedNonce?: string,
  ): Promise<IdentitySession> {
    const profile = await this.#authxProfile;
    if (token.scope !== undefined && token.scope !== authXScope(profile)) {
      throw new Error("AuthX granted scope is incompatible");
    }
    return new AuthXTokenVerifier(profile, {
      fetch: this.#fetch,
      now: this.#now,
    }).verify(token, expectedNonce);
  }

  async #authorizedApplicationJson(
    url: URL,
    accessToken: string,
    init: RequestInit = {},
  ) {
    assertApplicationUrl(url, this.#nexusOrigin);
    let response;
    try {
      response = await this.#fetch(url, {
        ...init,
        headers: {
          ...headerRecord(init.headers),
          authorization: `Bearer ${accessToken}`,
        },
        redirect: "error",
        signal: init.signal ?? AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (
        init.signal?.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw error;
      }
      throw new NexusApplicationAccessError(503, "nexus_unavailable");
    }
    if (!response.ok) {
      const details = await parseApplicationAccessError(response, [
        accessToken,
      ]);
      throw new NexusApplicationAccessError(
        response.status,
        typeof details.code === "string" ? details.code : undefined,
      );
    }
    return response.status === 204
      ? {}
      : readJson(response, maximumJsonBytes, "Nexus Application response");
  }

  async #models(
    context: GatewayContext,
    output: "audio" | "image" | "video",
    signal: AbortSignal,
  ) {
    const suffix =
      output === "audio"
        ? "/models?output_modalities=speech"
        : `/${output}s/models`;
    const response = await this.#gatewayFetch(context, suffix, { signal });
    if (!response.ok) {
      throw new NexusGatewayHttpError(
        `OpenRouter ${output} model catalog request`,
        response.status,
        await parseGatewayError(response, [context.identity.accessToken]),
      );
    }
    const parsed = await readJson(
      response,
      maximumJsonBytes,
      `OpenRouter ${output} model catalog`,
    );
    return output === "image"
      ? parseImageModels(parsed)
      : output === "video"
        ? parseVideoModels(parsed)
        : parseAudioModels(parsed);
  }

  async #audioCompletion(
    context: GatewayContext,
    model: Pick<NexusProviderModel, "id" | "outputModalities">,
    prompt: string,
    providerParameters: GenerationProviderParameters,
    operationId: string,
    signal: AbortSignal,
  ) {
    validateModel(model, "audio");
    validateOperationId(operationId);
    const response = await this.#gatewayFetch(context, "/audio/speech", {
      body: JSON.stringify({
        input: prompt,
        model: model.id,
        response_format: "mp3",
        voice: "alloy",
        ...providerParameters,
      }),
      headers: {
        "content-type": "application/json",
        "x-nexus-request-id": operationId,
      },
      method: "POST",
      signal,
    });
    if (!response.ok) {
      throw new NexusAudioHttpError(
        response.status,
        operationId,
        await parseGatewayError(response, [
          context.identity.accessToken,
          prompt,
        ]),
      );
    }
    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (!isAudioMimeType(contentType)) {
      throw new Error("Nexus audio content type is unsupported");
    }
    const bytes = await readBytes(response, maximumAudioBytes);
    if (!matchesAudioSignature(bytes, contentType)) {
      throw new Error("Nexus audio content is invalid");
    }
    return { bytes, mimeType: contentType };
  }

  async #imageCompletion(
    context: GatewayContext,
    model: Pick<NexusProviderModel, "id" | "outputModalities">,
    prompt: string,
    providerParameters: GenerationProviderParameters,
    operationId: string,
    signal: AbortSignal,
  ) {
    validateModel(model, "image");
    validateOperationId(operationId);
    const response = await this.#gatewayFetch(context, "/images", {
      body: JSON.stringify({
        model: model.id,
        output_format: "png",
        prompt,
        ...providerParameters,
      }),
      headers: {
        "content-type": "application/json",
        "x-nexus-request-id": operationId,
      },
      method: "POST",
      signal,
    });
    if (!response.ok) {
      throw new NexusImageHttpError(
        response.status,
        operationId,
        await parseGatewayError(response, [
          context.identity.accessToken,
          prompt,
        ]),
      );
    }
    return readJson(response, maximumImageBytes, "Nexus image response");
  }

  async #videoSubmit(
    context: GatewayContext,
    model: Pick<NexusProviderModel, "id" | "outputModalities">,
    prompt: string,
    providerParameters: GenerationProviderParameters,
    operationId: string,
    requestDigest: string,
    signal: AbortSignal,
  ) {
    validateModel(model, "video");
    validateOperationId(operationId);
    if (!/^[a-f0-9]{64}$/u.test(requestDigest)) {
      throw new Error("Nexus generation request digest is invalid");
    }
    const response = await this.#gatewayFetch(context, "/videos", {
      body: JSON.stringify({ model: model.id, prompt, ...providerParameters }),
      headers: {
        "content-type": "application/json",
        "idempotency-key": createGenerationIdempotencyKey(
          operationId,
          requestDigest,
        ),
        "x-nexus-request-id": operationId,
      },
      method: "POST",
      signal,
    });
    return this.#parseVideoResponse(
      response,
      operationId,
      context.identity.accessToken,
      prompt,
    );
  }

  async #videoAction(
    context: GatewayContext,
    taskId: string,
    action: "get" | "cancel",
    operationId: string,
    signal: AbortSignal,
  ) {
    validateOperationId(operationId);
    const response = await this.#gatewayFetch(
      context,
      `/videos/${encodeURIComponent(boundedId(taskId, "Nexus video task id"))}`,
      {
        headers: { "x-nexus-request-id": operationId },
        method: action === "cancel" ? "DELETE" : "GET",
        signal,
      },
    );
    return this.#parseVideoResponse(
      response,
      operationId,
      context.identity.accessToken,
    );
  }

  async #parseVideoResponse(
    response: Response,
    operationId: string,
    accessToken: string,
    prompt?: string,
  ) {
    if (!response.ok) {
      throw new NexusVideoHttpError(
        response.status,
        operationId,
        await parseGatewayError(response, [
          accessToken,
          ...(prompt === undefined ? [] : [prompt]),
        ]),
      );
    }
    return parseVideoTask(
      await readJson(response, maximumJsonBytes, "Nexus video task"),
      [accessToken, ...(prompt === undefined ? [] : [prompt])],
    );
  }

  async #videoContent(
    context: GatewayContext,
    taskId: string,
    operationId: string,
    signal: AbortSignal,
  ) {
    validateOperationId(operationId);
    const response = await this.#gatewayFetch(
      context,
      `/videos/${encodeURIComponent(
        boundedId(taskId, "Nexus video task id"),
      )}/content`,
      {
        headers: { "x-nexus-request-id": operationId },
        signal,
      },
    );
    if (!response.ok) {
      throw new NexusVideoHttpError(
        response.status,
        operationId,
        await parseGatewayError(response, [context.identity.accessToken]),
      );
    }
    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "video/mp4") {
      throw new Error("Nexus video content type is unsupported");
    }
    const bytes = await readBytes(response, maximumVideoBytes);
    if (!matchesMp4Signature(bytes)) {
      throw new Error("Nexus video content is invalid");
    }
    return { bytes, mimeType: "video/mp4" as const };
  }

  #gatewayFetch(context: GatewayContext, suffix: string, init: RequestInit) {
    this.#assertCurrent(context);
    const url = new URL(`${context.access.gatewayBaseUrl}${suffix}`);
    assertProviderScopedGatewayUrl(url, context.access.gatewayBaseUrl);
    return this.#fetch(url, {
      ...init,
      headers: {
        ...headerRecord(init.headers),
        authorization: `Bearer ${context.identity.accessToken}`,
      },
      redirect: "error",
      signal:
        init.signal && !init.signal.aborted
          ? AbortSignal.any([
              init.signal as AbortSignal,
              AbortSignal.timeout(30_000),
            ])
          : (init.signal ?? AbortSignal.timeout(30_000)),
    });
  }

  #assertCurrent(context: GatewayContext) {
    if (context.epoch !== this.#credentialEpoch) {
      throw new Error("Nexus credentials changed during the request");
    }
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
    return `${prefix} (${details})${
      error.serverMessage ? `: ${error.serverMessage}` : "."
    }`;
  }
  const message =
    error instanceof Error ? safeErrorMessage(error.message, []) : undefined;
  return `${prefix}${message ? `: ${message}` : "."}`;
}

function parseApplicationAccess(
  value: unknown,
  trustedGatewayOrigins: ReadonlySet<string>,
): NexusApplicationAccess {
  const input = record(value, "Nexus Application Access");
  const allowed = [
    "applicationId",
    "applicationVersion",
    "checkoutAvailable",
    "gatewayBaseUrl",
    "planKey",
    "state",
  ];
  if (
    Object.keys(input).length !== allowed.length ||
    Object.keys(input).some((key) => !allowed.includes(key)) ||
    input.state !== "ACTIVE" ||
    !Number.isSafeInteger(input.applicationVersion) ||
    Number(input.applicationVersion) < 1
  ) {
    throw new Error("Nexus Application Access response is invalid");
  }
  return {
    applicationId: boundedId(input.applicationId, "Nexus Application id"),
    applicationVersion: Number(input.applicationVersion),
    checkoutAvailable: boolean(
      input.checkoutAvailable,
      "Nexus Checkout availability",
    ),
    gatewayBaseUrl: parseGatewayBaseUrl(
      input.gatewayBaseUrl,
      trustedGatewayOrigins,
    ),
    planKey: boundedString(input.planKey, "Nexus Plan key", 80),
    state: "ACTIVE",
  };
}

function parseTokenResponse(value: unknown): AuthXTokenResponse {
  const input = record(value, "AuthX token response");
  const expiresIn = input.expires_in;
  if (
    input.token_type !== "Bearer" ||
    !Number.isSafeInteger(expiresIn) ||
    Number(expiresIn) < 60 ||
    Number(expiresIn) > 86_400
  ) {
    throw new Error("AuthX token response is invalid");
  }
  return {
    access_token: credential(input.access_token, "AuthX access token"),
    expires_in: Number(expiresIn),
    id_token: credential(input.id_token, "AuthX ID Token"),
    refresh_token: credential(input.refresh_token, "AuthX refresh credential"),
    ...(input.scope === undefined
      ? {}
      : {
          scope: boundedString(input.scope, "AuthX granted scope", 512),
        }),
    token_type: "Bearer",
  };
}

function parseCheckout(value: unknown): NexusApplicationCheckout {
  const input = record(value, "Nexus Application Checkout");
  if (
    Object.keys(input).some(
      (key) =>
        !["action", "expiresAt", "id", "provider", "status"].includes(key),
    )
  ) {
    throw new Error("Nexus Application Checkout response is invalid");
  }
  const action =
    input.action === undefined ? undefined : parseCheckoutAction(input.action);
  return {
    ...(action === undefined ? {} : { action }),
    expiresAt: isoDate(input.expiresAt, "Nexus Checkout expiry"),
    id: boundedId(input.id, "Nexus Checkout id"),
    provider: boundedString(input.provider, "Nexus Checkout provider", 80),
    status: boundedString(input.status, "Nexus Checkout status", 32),
  };
}

function parseCheckoutAction(value: unknown) {
  const input = record(value, "Nexus Checkout action");
  if (
    !["REDIRECT", "QR_CODE", "FORM_POST"].includes(String(input.kind)) ||
    Object.keys(input).some((key) => !["kind", "qrCode", "url"].includes(key))
  ) {
    throw new Error("Nexus Checkout action is invalid");
  }
  return {
    kind: input.kind as "REDIRECT" | "QR_CODE" | "FORM_POST",
    ...(input.qrCode === undefined
      ? {}
      : {
          qrCode: boundedString(input.qrCode, "Nexus Checkout QR code", 8_192),
        }),
    ...(input.url === undefined
      ? {}
      : { url: exactHttpsUrl(input.url, "Nexus Checkout URL") }),
  };
}

function parseImageModels(value: unknown): readonly NexusProviderModel[] {
  const models = modelEntries(value).map((entry, index) => {
    const input = record(entry, `OpenRouter image model ${index}`);
    const architecture = record(
      input.architecture,
      `OpenRouter image model ${index} architecture`,
    );
    if (
      !Array.isArray(architecture.output_modalities) ||
      architecture.output_modalities.length === 0 ||
      architecture.output_modalities.length > 16
    ) {
      throw new Error("OpenRouter image model modalities are invalid");
    }
    return {
      ...parseModelIdentity(input, index),
      outputModalities: architecture.output_modalities.map(
        (modality, modalityIndex) =>
          boundedString(
            modality,
            `OpenRouter image model ${index} modality ${modalityIndex}`,
            32,
          ),
      ),
    };
  });
  assertDistinctModels(models);
  return models.filter(({ outputModalities }) =>
    outputModalities.includes("image"),
  );
}

function parseVideoModels(value: unknown): readonly NexusProviderModel[] {
  const models = modelEntries(value).map((entry, index) => ({
    ...parseModelIdentity(
      record(entry, `OpenRouter video model ${index}`),
      index,
    ),
    outputModalities: ["video"],
  }));
  assertDistinctModels(models);
  return models;
}

function parseAudioModels(value: unknown): readonly NexusProviderModel[] {
  const models = modelEntries(value).map((entry, index) => {
    const input = record(entry, `OpenRouter audio model ${index}`);
    const architecture = record(
      input.architecture,
      `OpenRouter audio model ${index} architecture`,
    );
    if (
      !Array.isArray(architecture.output_modalities) ||
      architecture.output_modalities.length === 0 ||
      architecture.output_modalities.length > 16
    ) {
      throw new Error("OpenRouter audio model modalities are invalid");
    }
    return {
      ...parseModelIdentity(input, index),
      outputModalities: architecture.output_modalities.map(
        (modality, modalityIndex) =>
          boundedString(
            modality,
            `OpenRouter audio model ${index} modality ${modalityIndex}`,
            32,
          ),
      ),
    };
  });
  assertDistinctModels(models);
  return models.filter(({ outputModalities }) =>
    outputModalities.some(
      (modality) => modality === "audio" || modality === "speech",
    ),
  );
}

function modelEntries(value: unknown) {
  const input = record(value, "OpenRouter model catalog");
  if (!Array.isArray(input.data) || input.data.length > maximumModelEntries) {
    throw new Error("OpenRouter model catalog is invalid");
  }
  return input.data;
}

function parseModelIdentity(input: Record<string, unknown>, index: number) {
  const id = boundedString(input.id, `OpenRouter model ${index} id`, 191);
  if (!modelIdPattern.test(id))
    throw new Error("OpenRouter model id is invalid");
  return {
    id,
    name: boundedString(input.name, `OpenRouter model ${index} name`, 160),
  };
}

function assertDistinctModels(models: readonly NexusProviderModel[]) {
  if (new Set(models.map(({ id }) => id)).size !== models.length) {
    throw new Error("OpenRouter model catalog contains duplicate ids");
  }
}

function validateModel(
  model: Pick<NexusProviderModel, "id" | "outputModalities">,
  output: "audio" | "image" | "video",
) {
  if (
    !modelIdPattern.test(model.id) ||
    !(output === "audio"
      ? model.outputModalities.some(
          (modality) => modality === "audio" || modality === "speech",
        )
      : model.outputModalities.includes(output))
  ) {
    throw new Error(`Nexus ${output} model is invalid`);
  }
}

function isAudioMimeType(
  value: string | undefined,
): value is NexusAudioMimeType {
  return (
    value !== undefined &&
    [
      "audio/aac",
      "audio/flac",
      "audio/mpeg",
      "audio/ogg",
      "audio/opus",
      "audio/pcm",
      "audio/wav",
      "audio/x-wav",
    ].includes(value)
  );
}

function matchesAudioSignature(
  bytes: Uint8Array,
  mimeType: NexusAudioMimeType,
) {
  if (bytes.byteLength === 0) return false;
  if (mimeType === "audio/pcm") return true;
  const ascii = (start: number, end: number) =>
    new TextDecoder("ascii").decode(bytes.subarray(start, end));
  if (mimeType === "audio/mpeg") {
    return (
      ascii(0, 3) === "ID3" ||
      (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
    );
  }
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") {
    return (
      bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE"
    );
  }
  if (mimeType === "audio/flac") return ascii(0, 4) === "fLaC";
  if (mimeType === "audio/ogg" || mimeType === "audio/opus") {
    return ascii(0, 4) === "OggS";
  }
  return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xf0) === 0xf0;
}

function parseVideoTask(
  value: unknown,
  sensitiveValues: readonly string[],
): NexusVideoTask {
  const input = record(value, "Nexus video task");
  const status = boundedString(input.status, "Nexus video task status", 32);
  if (
    ![
      "pending",
      "queued",
      "processing",
      "in_progress",
      ...terminalVideoStatuses,
    ].includes(status)
  ) {
    throw new Error("Nexus video task status is invalid");
  }
  const error =
    input.error === undefined
      ? undefined
      : safeErrorMessage(input.error, sensitiveValues);
  return {
    ...(error === undefined ? {} : { error }),
    status: status as NexusVideoTask["status"],
    taskId: boundedId(input.id, "Nexus video task id"),
  };
}

async function parseGatewayError(
  response: Response,
  sensitiveValues: readonly string[],
): Promise<NexusGatewayErrorDetails> {
  const headerRequestId = safeRequestId(
    response.headers.get("x-request-id") ??
      response.headers.get("x-nexus-request-id"),
    sensitiveValues,
  );
  const serialized = await readText(response, maximumErrorBytes).catch(
    () => undefined,
  );
  if (serialized === undefined) {
    return headerRequestId ? { requestId: headerRequestId } : {};
  }
  let input: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(serialized) as unknown;
    input = record(parsed, "Nexus Gateway error");
  } catch {
    return headerRequestId ? { requestId: headerRequestId } : {};
  }
  const error =
    input.error &&
    typeof input.error === "object" &&
    !Array.isArray(input.error)
      ? (input.error as Record<string, unknown>)
      : undefined;
  const code = safeErrorCode(error?.code, sensitiveValues);
  const message = safeErrorMessage(error?.message, sensitiveValues);
  const requestId =
    headerRequestId ?? safeRequestId(input.request_id, sensitiveValues);
  return {
    ...(code === undefined ? {} : { code }),
    ...(message === undefined ? {} : { message }),
    ...(requestId === undefined ? {} : { requestId }),
  };
}

async function parseApplicationAccessError(
  response: Response,
  sensitiveValues: readonly string[],
): Promise<NexusGatewayErrorDetails> {
  const serialized = await readText(response, maximumErrorBytes).catch(
    () => undefined,
  );
  if (serialized === undefined) return {};
  let input: Record<string, unknown>;
  try {
    input = record(
      JSON.parse(serialized) as unknown,
      "Nexus Application Access error",
    );
  } catch {
    return {};
  }
  const nested =
    input.error &&
    typeof input.error === "object" &&
    !Array.isArray(input.error)
      ? (input.error as Record<string, unknown>)
      : undefined;
  const code = safeErrorCode(input.code ?? nested?.code, sensitiveValues);
  const message = safeErrorMessage(
    input.message ?? nested?.message,
    sensitiveValues,
  );
  return {
    ...(code === undefined ? {} : { code }),
    ...(message === undefined ? {} : { message }),
  };
}

function applicationAccessErrorMessage(status: number, code?: string) {
  if (code === "application_setup_required") {
    return "Nexus setup is not finished. Ask a Nexus administrator to bind an active Workspace, Plan, and Provider connection.";
  }
  if (code === "application_disabled" || code === "access_revoked") {
    return "Nexus access for Convax has been disabled. Ask a Nexus administrator to review the Application binding.";
  }
  if (code === "nexus_unavailable" || status >= 500) {
    return "Nexus is temporarily unavailable. Try again later.";
  }
  if (status === 401 || status === 403) {
    return "Convax could not verify the current Nexus access. Sign in again or ask an administrator to review access.";
  }
  return "Nexus Application Access is unavailable.";
}

function exactConfiguredOrigin(
  value: string,
  label: string,
  localInjection: boolean,
) {
  const url = new URL(value);
  const loopback =
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(url.hostname);
  if (
    url.href !== `${url.origin}/` ||
    url.username ||
    url.password ||
    (localInjection ? !loopback : url.protocol !== "https:")
  ) {
    throw new Error(`${label} is invalid`);
  }
  return url.origin;
}

function exactLoopbackRedirect(
  value: string,
  profile: AuthXPublicClientProfile,
) {
  const url = new URL(value);
  if (
    url.href !== profile.redirectUri ||
    url.href !== "http://127.0.0.1:65051/oauth/callback"
  ) {
    throw new Error("AuthX loopback redirect is invalid");
  }
  return profile.redirectUri;
}

function assertApplicationUrl(url: URL, nexusOrigin: string) {
  if (
    url.origin !== nexusOrigin ||
    !url.pathname.startsWith(`${applicationApiBasePath}/`) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error("Nexus Application Access URL is invalid");
  }
}

function parseGatewayBaseUrl(
  value: unknown,
  trustedOrigins: ReadonlySet<string>,
) {
  if (typeof value !== "string") {
    throw new Error("Nexus Gateway Base URL is invalid");
  }
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !trustedOrigins.has(url.origin) ||
    !/^\/api\/v1\/gateway\/providers\/[A-Za-z0-9][A-Za-z0-9._:-]{7,190}$/u.test(
      url.pathname,
    )
  ) {
    throw new Error("Nexus Gateway Base URL is invalid");
  }
  return url.href.replace(/\/$/u, "");
}

function assertProviderScopedGatewayUrl(url: URL, baseUrl: string) {
  const base = new URL(baseUrl);
  if (
    url.origin !== base.origin ||
    !url.pathname.startsWith(`${base.pathname}/`) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error("Nexus provider-scoped Gateway URL is invalid");
  }
}

async function readJson(
  response: Response,
  maximumBytes: number,
  label: string,
) {
  const serialized = await readText(response, maximumBytes);
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new Error(`${label} is invalid`);
  }
}

async function readText(response: Response, maximumBytes: number) {
  const bytes = await readBytes(response, maximumBytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Response is not valid UTF-8");
  }
}

async function readBytes(response: Response, maximumBytes: number) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Response is too large");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) throw new Error("Response is too large");
  return bytes;
}

function formBody(fields: Readonly<Record<string, string>>) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form.toString();
}

function headerRecord(headers: HeadersInit | undefined) {
  const result: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, label: string, maximumLength: number) {
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

function boundedId(value: unknown, label: string) {
  const id = boundedString(value, label, 191);
  if (!requestIdPattern.test(id)) throw new Error(`${label} is invalid`);
  return id;
}

function highEntropyValue(value: unknown, label: string) {
  const text = boundedString(value, label, 512);
  if (text.length < 32 || !/^[A-Za-z0-9_-]+$/u.test(text)) {
    throw new Error(`${label} is invalid`);
  }
  return text;
}

function credential(value: unknown, label: string) {
  const secret = boundedString(value, label, 8_192);
  if (secret.length < 20 || /[\u0000-\u001F\u007F]/u.test(secret)) {
    throw new Error(`${label} is invalid`);
  }
  return secret;
}

function boolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new Error(`${label} is invalid`);
  return value;
}

function isoDate(value: unknown, label: string) {
  const text = boundedString(value, label, 80);
  const time = new Date(text).getTime();
  if (!Number.isFinite(time)) throw new Error(`${label} is invalid`);
  return new Date(time).toISOString();
}

function exactHttpsUrl(value: unknown, label: string) {
  const text = boundedString(value, label, 4_096);
  const url = new URL(text);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.href !== text
  ) {
    throw new Error(`${label} is invalid`);
  }
  return text;
}

function validateOperationId(value: string) {
  if (!requestIdPattern.test(value)) {
    throw new Error("Nexus generation operation id is invalid");
  }
}

function createGenerationIdempotencyKey(
  operationId: string,
  requestDigest: string,
) {
  return `convax-video-${createHash("sha256")
    .update(`${operationId}\0${requestDigest}`)
    .digest("hex")}`;
}

function safeRequestId(value: unknown, sensitiveValues: readonly string[]) {
  if (
    typeof value !== "string" ||
    !requestIdPattern.test(value) ||
    looksLikeCredential(value) ||
    sensitiveValues.some(
      (sensitive) => sensitive.length >= 4 && value.includes(sensitive),
    )
  ) {
    return undefined;
  }
  return value;
}

function safeErrorCode(
  value: unknown,
  sensitiveValues: readonly string[],
): number | string | undefined {
  if (Number.isSafeInteger(value) && Number(value) >= 0) return Number(value);
  return safeRequestId(value, sensitiveValues);
}

function safeErrorMessage(value: unknown, sensitiveValues: readonly string[]) {
  if (typeof value !== "string") return undefined;
  const message = value.replace(/\s+/gu, " ").trim();
  if (
    message.length === 0 ||
    message.length > 1_000 ||
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

function looksLikeCredential(value: string) {
  return (
    /\bBearer\s+\S+/iu.test(value) ||
    /\b(?:sk|nxs)[_-][A-Za-z0-9_-]{8,}\b/u.test(value) ||
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u.test(value)
  );
}

function matchesMp4Signature(bytes: Uint8Array) {
  return (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}
