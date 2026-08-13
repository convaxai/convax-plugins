import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const sourceSchema = "authx.convax-public-client/1";
const outputSchema = "convax.nexus-public-profile/1";
const exactRedirectUri = "http://127.0.0.1:65051/oauth/callback";
const exactScopes = ["openid", "profile", "email", "offline_access"];

const [sourceArgument, outputArgument] = process.argv.slice(2);
if (!sourceArgument || !outputArgument) {
  throw new Error(
    "usage: generate-local-profile <absolute AuthX handoff> <output path>",
  );
}
const sourcePath = path.resolve(sourceArgument);
if (!path.isAbsolute(sourceArgument)) {
  throw new Error("AuthX handoff path must be absolute");
}
const sourceMetadata = await fs.stat(sourcePath);
if (!sourceMetadata.isFile() || (sourceMetadata.mode & 0o077) !== 0) {
  throw new Error("AuthX handoff must be a 0600 regular file");
}
const sourceBytes = await fs.readFile(sourcePath);
if (sourceBytes.byteLength < 1 || sourceBytes.byteLength > 64 * 1024) {
  throw new Error("AuthX handoff exceeds its byte limit");
}
let source;
try {
  source = JSON.parse(sourceBytes.toString("utf8"));
} catch {
  throw new Error("AuthX handoff is invalid");
}
const profile = projectHandoff(source);
const output = {
  profile,
  profileDigest: digest(canonicalJson(profile)),
  schema: outputSchema,
  source: {
    path: sourcePath,
    schema: sourceSchema,
    sha256: digest(sourceBytes),
  },
};
const outputPath = path.resolve(outputArgument);
await fs.mkdir(path.dirname(outputPath), { mode: 0o700, recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, {
  mode: 0o600,
});
await fs.chmod(outputPath, 0o600);
console.log(
  JSON.stringify(
    {
      outputPath,
      profileDigest: output.profileDigest,
      schema: output.schema,
      sourceSha256: output.source.sha256,
    },
    null,
    2,
  ),
);

function projectHandoff(value) {
  if (!isRecord(value)) throw new Error("AuthX handoff is invalid");
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
    "AuthX handoff",
  );
  const issuer = exactIssuer(value.issuer);
  if (
    value.schema !== sourceSchema ||
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
    !identifier(value.client_id) ||
    !identifier(value.project_id) ||
    !["development", "staging", "production"].includes(value.environment) ||
    !isRecord(value.resource_server) ||
    value.resource_server.issuer !== issuer ||
    value.resource_server.audience !== value.client_id ||
    value.resource_server.project_id !== value.project_id ||
    value.resource_server.environment !== value.environment ||
    value.resource_server.jwks_uri !== value.jwks_uri
  ) {
    throw new Error("AuthX handoff is incompatible");
  }
  return {
    clientId: value.client_id,
    environment: value.environment,
    issuer,
    jwksUri: value.jwks_uri,
    projectId: value.project_id,
    redirectUri: exactRedirectUri,
    scopes: exactScopes,
  };
}

function exactIssuer(value) {
  if (typeof value !== "string") throw new Error("AuthX issuer is invalid");
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

function identifier(value) {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 191 &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value)
  );
}

function exactArray(value, expected) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  );
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} has unsupported or missing fields`);
  }
}

function canonicalJson(value) {
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
  throw new Error("Profile contains a non-canonical value");
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
