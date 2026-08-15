import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const desktopProfileSchema =
  "https://schemas.authx.dev/fixtures/desktop-public-client-profile.v1.schema.json";
const exactScopes = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "nexus:access",
] as const;
const exactRedirectUri = "http://127.0.0.1:65051/oauth/callback";
const generatedProfileSchema = "convax.nexus-public-profile/1";
const authXHandoffSchema = "authx.convax-public-client/1";

export interface AuthXPublicClientProfile {
  clientId: string;
  environment: "development" | "staging" | "production";
  issuer: string;
  jwksUri: string;
  projectId: string;
  redirectUri: typeof exactRedirectUri;
  scopes: typeof exactScopes;
}

const productionProfile: AuthXPublicClientProfile = Object.freeze({
  clientId: "oauthclient_Ty33MTkmTR6M90SCR1mvdUykHDJAHUnr",
  environment: "production",
  issuer: "https://authx.microvoid.io",
  jwksUri: "https://authx.microvoid.io/oauth/jwks.json",
  projectId: "project_OKnlkG5kU1lNrOqJs0GFTu4JM2SwNkHz",
  redirectUri: exactRedirectUri,
  scopes: exactScopes,
});

export async function resolveAuthXPublicClientProfile(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<AuthXPublicClientProfile> {
  const localDevelopment = environment.CONVAX_NEXUS_LOCAL_DEVELOPMENT === "1";
  const configured = environment.CONVAX_AUTHX_PUBLIC_CLIENT_PROFILE;
  if (!localDevelopment) {
    if (configured !== undefined) {
      throw new Error(
        "AuthX public-client profile injection is limited to local development",
      );
    }
    return productionProfile;
  }
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error(
      "Local development requires an absolute CONVAX_AUTHX_PUBLIC_CLIENT_PROFILE",
    );
  }
  const serialized = await fs.readFile(configured, "utf8");
  if (Buffer.byteLength(serialized, "utf8") > 64 * 1024) {
    throw new Error("AuthX public-client profile is too large");
  }
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("AuthX public-client profile is invalid");
  }
  const profile =
    isRecord(value) && value.schema === generatedProfileSchema
      ? await parseGeneratedAuthXPublicClientProfile(value)
      : parseAuthXPublicClientProfile(value);
  const issuer = new URL(profile.issuer);
  if (
    issuer.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(issuer.hostname)
  ) {
    throw new Error("Local AuthX public-client profile must use loopback HTTP");
  }
  return profile;
}

export function parseAuthXPublicClientProfile(
  value: unknown,
): AuthXPublicClientProfile {
  if (!isRecord(value)) {
    throw new Error("AuthX public-client profile is invalid");
  }
  const input = value;
  exactKeys(
    input,
    [
      "$schema",
      "client_id",
      "client_type",
      "code_challenge_methods",
      "environment",
      "grant_types",
      "issuer",
      "jwks_uri",
      "post_logout_redirect_uris",
      "profile",
      "project_id",
      "redirect_uris",
      "resource_server",
      "response_types",
      "scopes",
      "token_endpoint_auth_method",
    ],
    "AuthX public-client profile",
  );
  const issuer = exactIssuer(input.issuer);
  if (
    input.$schema !== desktopProfileSchema ||
    input.client_type !== "PUBLIC" ||
    input.token_endpoint_auth_method !== "none" ||
    !exactArray(input.response_types, ["code"]) ||
    !exactArray(input.grant_types, ["authorization_code", "refresh_token"]) ||
    !exactArray(input.code_challenge_methods, ["S256"]) ||
    !exactArray(input.scopes, exactScopes) ||
    !Array.isArray(input.redirect_uris) ||
    !input.redirect_uris.includes(exactRedirectUri) ||
    typeof input.client_id !== "string" ||
    !identifier(input.client_id) ||
    typeof input.project_id !== "string" ||
    !identifier(input.project_id) ||
    !["development", "staging", "production"].includes(
      String(input.environment),
    ) ||
    input.jwks_uri !== `${issuer}/oauth/jwks.json`
  ) {
    throw new Error("AuthX public-client profile is incompatible");
  }
  const resource = input.resource_server;
  if (!isRecord(resource)) {
    throw new Error("AuthX resource-server profile is invalid");
  }
  exactKeys(
    resource,
    [
      "audience",
      "environment",
      "issuer",
      "jwks_uri",
      "project_id",
      "protected_header",
      "subject",
    ],
    "AuthX resource-server profile",
  );
  const protectedHeader = resource.protected_header;
  if (
    resource.issuer !== issuer ||
    resource.audience !== input.client_id ||
    resource.project_id !== input.project_id ||
    resource.environment !== input.environment ||
    resource.jwks_uri !== input.jwks_uri ||
    resource.subject !== "required-non-empty-pairwise" ||
    !isRecord(protectedHeader)
  ) {
    throw new Error("AuthX resource-server profile is incompatible");
  }
  exactKeys(
    protectedHeader,
    ["alg", "kid", "typ"],
    "AuthX protected-header profile",
  );
  if (
    protectedHeader.alg !== "ES256" ||
    protectedHeader.typ !== "JWT" ||
    protectedHeader.kid !== "required-known-jwks-key"
  ) {
    throw new Error("AuthX resource-server profile is incompatible");
  }
  return Object.freeze({
    clientId: input.client_id,
    environment: input.environment as AuthXPublicClientProfile["environment"],
    issuer,
    jwksUri: input.jwks_uri as string,
    projectId: input.project_id,
    redirectUri: exactRedirectUri,
    scopes: exactScopes,
  });
}

export function authXScope(profile: AuthXPublicClientProfile) {
  return profile.scopes.join(" ");
}

async function parseGeneratedAuthXPublicClientProfile(
  input: Record<string, unknown>,
): Promise<AuthXPublicClientProfile> {
  exactKeys(
    input,
    ["profile", "profileDigest", "schema", "source"],
    "generated AuthX public-client profile",
  );
  if (
    input.schema !== generatedProfileSchema ||
    !isRecord(input.profile) ||
    !isRecord(input.source)
  ) {
    throw new Error("Generated AuthX public-client profile is invalid");
  }
  exactKeys(
    input.source,
    ["path", "schema", "sha256"],
    "generated AuthX profile source",
  );
  if (
    input.source.schema !== authXHandoffSchema ||
    typeof input.source.path !== "string" ||
    !path.isAbsolute(input.source.path) ||
    typeof input.source.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(input.source.sha256)
  ) {
    throw new Error("Generated AuthX profile source is invalid");
  }
  const sourceBytes = await fs.readFile(input.source.path);
  if (
    sourceBytes.byteLength > 64 * 1024 ||
    createHash("sha256").update(sourceBytes).digest("hex") !==
      input.source.sha256
  ) {
    throw new Error("Generated AuthX profile source digest does not match");
  }
  let handoff: unknown;
  try {
    handoff = JSON.parse(sourceBytes.toString("utf8"));
  } catch {
    throw new Error("Generated AuthX profile source is invalid");
  }
  const projected = projectAuthXHandoff(handoff);
  exactKeys(
    input.profile,
    [
      "clientId",
      "environment",
      "issuer",
      "jwksUri",
      "projectId",
      "redirectUri",
      "scopes",
    ],
    "generated AuthX profile projection",
  );
  if (
    canonicalJson(input.profile) !== canonicalJson(projected) ||
    typeof input.profileDigest !== "string" ||
    input.profileDigest !==
      createHash("sha256").update(canonicalJson(projected)).digest("hex")
  ) {
    throw new Error("Generated AuthX profile projection digest does not match");
  }
  return projected;
}

function projectAuthXHandoff(value: unknown): AuthXPublicClientProfile {
  if (!isRecord(value)) {
    throw new Error("AuthX public-client handoff is invalid");
  }
  exactKeys(
    value,
    [
      "client_id",
      "client_type",
      "code_challenge_methods",
      "console_origin",
      "discovery_uri",
      "environment",
      "grant_types",
      "issuer",
      "jwks_uri",
      "post_logout_redirect_uris",
      "profile",
      "project_id",
      "redirect_uris",
      "resource_server",
      "response_types",
      "schema",
      "scopes",
      "token_endpoint_auth_method",
    ],
    "AuthX public-client handoff",
  );
  const issuer = exactIssuer(value.issuer);
  if (
    value.schema !== authXHandoffSchema ||
    value.client_type !== "PUBLIC" ||
    value.token_endpoint_auth_method !== "none" ||
    value.discovery_uri !== `${issuer}/.well-known/openid-configuration` ||
    value.jwks_uri !== `${issuer}/oauth/jwks.json` ||
    !exactArray(value.response_types, ["code"]) ||
    !exactArray(value.grant_types, ["authorization_code", "refresh_token"]) ||
    !exactArray(value.code_challenge_methods, ["S256"]) ||
    !exactArray(value.scopes, exactScopes) ||
    !Array.isArray(value.redirect_uris) ||
    !value.redirect_uris.includes(exactRedirectUri) ||
    typeof value.client_id !== "string" ||
    !identifier(value.client_id) ||
    typeof value.project_id !== "string" ||
    !identifier(value.project_id) ||
    !["development", "staging", "production"].includes(
      String(value.environment),
    ) ||
    !isRecord(value.resource_server) ||
    value.resource_server.issuer !== issuer ||
    value.resource_server.audience !== value.client_id ||
    value.resource_server.project_id !== value.project_id ||
    value.resource_server.environment !== value.environment ||
    value.resource_server.jwks_uri !== value.jwks_uri
  ) {
    throw new Error("AuthX public-client handoff is incompatible");
  }
  return Object.freeze({
    clientId: value.client_id,
    environment: value.environment as AuthXPublicClientProfile["environment"],
    issuer,
    jwksUri: value.jwks_uri as string,
    projectId: value.project_id,
    redirectUri: exactRedirectUri,
    scopes: exactScopes,
  });
}

function exactArray(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  );
}

function exactIssuer(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("AuthX issuer is invalid");
  }
  const url = new URL(value);
  const loopback =
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(url.hostname);
  if (
    url.href !== `${url.origin}/` ||
    url.username ||
    url.password ||
    (!loopback && url.protocol !== "https:")
  ) {
    throw new Error("AuthX issuer is invalid");
  }
  return url.origin;
}

function identifier(value: string) {
  return (
    value.length >= 8 &&
    value.length <= 191 &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} has unsupported or missing fields`);
  }
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error("Generated AuthX profile contains a non-canonical value");
}
