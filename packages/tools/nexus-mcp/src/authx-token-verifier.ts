import { createPublicKey, verify } from "node:crypto";

import type { AuthXPublicClientProfile } from "./authx-profile.ts";
import type { AuthXTokenResponse } from "./contracts.ts";

const maximumJsonBytes = 1024 * 1024;
const clockSkewSeconds = 30;

interface VerifiedIdentity {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
  sessionId: string;
  subject: string;
}

export class AuthXTokenVerifier {
  readonly #fetch: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  readonly #now: () => Date;

  constructor(
    private readonly profile: AuthXPublicClientProfile,
    options: {
      fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
      now?: () => Date;
    } = {},
  ) {
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? (() => new Date());
  }

  async verify(
    tokens: AuthXTokenResponse,
    expectedNonce?: string,
  ): Promise<VerifiedIdentity> {
    const discovery = await this.#discovery();
    const jwks = await this.#json(discovery.jwksUri, "AuthX JWKS");
    const access = verifyJwt(
      tokens.access_token,
      jwks,
      this.profile,
      "access",
      this.#now(),
    );
    const id = verifyJwt(
      tokens.id_token,
      jwks,
      this.profile,
      "id",
      this.#now(),
    );
    if (
      access.sub !== id.sub ||
      access.sid !== id.sid ||
      (expectedNonce !== undefined && id.nonce !== expectedNonce)
    ) {
      throw new Error("AuthX token identity or nonce is invalid");
    }
    return {
      accessToken: tokens.access_token,
      expiresAt: access.exp * 1_000,
      refreshToken: tokens.refresh_token,
      sessionId: access.sid,
      subject: access.sub,
    };
  }

  async #discovery() {
    const value = record(
      await this.#json(
        new URL("/.well-known/openid-configuration", this.profile.issuer),
        "AuthX discovery",
      ),
      "AuthX discovery",
    );
    const exact = {
      authorization_endpoint: `${this.profile.issuer}/oauth/authorize`,
      issuer: this.profile.issuer,
      jwks_uri: this.profile.jwksUri,
      revocation_endpoint: `${this.profile.issuer}/oauth/revoke`,
      token_endpoint: `${this.profile.issuer}/oauth/token`,
    };
    for (const [key, expected] of Object.entries(exact)) {
      if (value[key] !== expected) {
        throw new Error(`AuthX discovery ${key} is incompatible`);
      }
    }
    if (
      !Array.isArray(value.id_token_signing_alg_values_supported) ||
      !value.id_token_signing_alg_values_supported.includes("ES256")
    ) {
      throw new Error("AuthX discovery does not support ES256");
    }
    return { jwksUri: new URL(exact.jwks_uri) };
  }

  async #json(url: URL, label: string) {
    const response = await this.#fetch(url, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`${label} request was rejected`);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declared) && declared > maximumJsonBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`${label} is too large`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumJsonBytes) {
      throw new Error(`${label} is too large`);
    }
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      ) as unknown;
    } catch {
      throw new Error(`${label} is invalid`);
    }
  }
}

function verifyJwt(
  token: string,
  jwksValue: unknown,
  profile: AuthXPublicClientProfile,
  tokenUse: "access" | "id",
  now: Date,
) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("AuthX JWT is invalid");
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [
    string,
    string,
    string,
  ];
  const header = record(
    decodeJson(encodedHeader, "AuthX JWT header"),
    "AuthX JWT header",
  );
  if (
    Object.keys(header).length !== 3 ||
    Object.keys(header).some(
      (key) => !["alg", "kid", "typ"].includes(key),
    ) ||
    header.alg !== "ES256" ||
    header.typ !== "JWT" ||
    typeof header.kid !== "string" ||
    !header.kid
  ) {
    throw new Error("AuthX JWT protected header is invalid");
  }
  const jwks = record(jwksValue, "AuthX JWKS");
  if (!Array.isArray(jwks.keys)) throw new Error("AuthX JWKS is invalid");
  const matching = jwks.keys.filter(
    (value) =>
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).kid === header.kid,
  );
  if (matching.length !== 1) {
    throw new Error("AuthX JWT kid is not a unique known JWKS key");
  }
  const key = record(matching[0], "AuthX JWKS key");
  if (
    key.alg !== "ES256" ||
    key.kty !== "EC" ||
    key.crv !== "P-256" ||
    key.use !== "sig" ||
    typeof key.x !== "string" ||
    typeof key.y !== "string" ||
    "d" in key
  ) {
    throw new Error("AuthX JWKS key is incompatible");
  }
  let valid = false;
  try {
    valid = verify(
      "sha256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      {
        dsaEncoding: "ieee-p1363",
        key: createPublicKey({
          format: "jwk",
          key: key as JsonWebKey,
        }),
      },
      Buffer.from(encodedSignature, "base64url"),
    );
  } catch {
    throw new Error("AuthX JWT signature is invalid");
  }
  if (!valid) throw new Error("AuthX JWT signature is invalid");
  const payload = record(
    decodeJson(encodedPayload, "AuthX JWT payload"),
    "AuthX JWT payload",
  );
  const iat = integer(payload.iat, "AuthX JWT iat");
  const exp = integer(payload.exp, "AuthX JWT exp");
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (
    payload.iss !== profile.issuer ||
    payload.aud !== profile.clientId ||
    payload.project_id !== profile.projectId ||
    payload.environment !== profile.environment ||
    payload.oauth_client_id !== profile.clientId ||
    payload.client_id !== profile.clientId ||
    payload.token_use !== tokenUse ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    typeof payload.sid !== "string" ||
    !payload.sid ||
    typeof payload.jti !== "string" ||
    !payload.jti ||
    iat > nowSeconds + clockSkewSeconds ||
    exp <= nowSeconds - clockSkewSeconds ||
    exp <= iat ||
    exp - iat > 900
  ) {
    throw new Error("AuthX JWT claims are invalid");
  }
  if (
    tokenUse === "access" &&
    (payload.application_id !== profile.projectId ||
      typeof payload.scope !== "string" ||
      !payload.scope.split(/\s+/u).includes("nexus:access"))
  ) {
    throw new Error("AuthX Application Access claims are invalid");
  }
  if (
    tokenUse === "id" &&
    payload.nonce !== undefined &&
    (typeof payload.nonce !== "string" ||
      payload.nonce.length < 16 ||
      payload.nonce.length > 512)
  ) {
    throw new Error("AuthX ID Token nonce is invalid");
  }
  return {
    exp,
    nonce: payload.nonce as string | undefined,
    sid: payload.sid,
    sub: payload.sub,
  };
}

function decodeJson(value: string, label: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error(`${label} is invalid`);
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.from(value, "base64url"),
      ),
    ) as unknown;
  } catch {
    throw new Error(`${label} is invalid`);
  }
}

function integer(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} is invalid`);
  }
  return Number(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as Record<string, unknown>;
}
