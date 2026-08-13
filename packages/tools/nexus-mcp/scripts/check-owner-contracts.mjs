#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import path from "node:path";

const home = process.env.HOME ?? "/Users/bytedance";
const authxRoot =
  process.env.CONVAX_AUTHX_REPOSITORY ??
  path.join(home, "Projects/github/authx");
const nexusRoot =
  process.env.CONVAX_NEXUS_REPOSITORY ??
  path.join(home, "Projects/github/nexus");
const hostRoot =
  process.env.CONVAX_HOST_REPOSITORY ??
  path.join(home, "Projects/github-ngo/convax");

const authxFixture = json(
  await readFile(
    path.join(
      authxRoot,
      "packages/contracts/fixtures/convax-local-public-client.json",
    ),
    "utf8",
  ),
);
const authxSchema = json(
  await readFile(
    path.join(
      authxRoot,
      "packages/contracts/schemas/desktop-public-client-profile.v1.schema.json",
    ),
    "utf8",
  ),
);
const authxPackage = json(
  await readFile(
    path.join(authxRoot, "packages/contracts/package.json"),
    "utf8",
  ),
);
const authxScript = await readFile(
  path.join(authxRoot, "scripts/convax-public-client.mjs"),
  "utf8",
);
const authxRuntime = await readFile(
  path.join(authxRoot, "packages/auth/src/index.ts"),
  "utf8",
);

assert(
  authxPackage.exports?.["./fixtures/*"] === "./fixtures/*",
  "AuthX fixture export is missing",
);
assert(
  authxFixture.$schema === authxSchema.$id,
  "AuthX fixture/schema identity mismatch",
);
assertEqual(
  authxFixture.client_id,
  "oauthclient_B9_0ytc_a6EYscxqP1XJTK1dP0_MLf7L",
  "AuthX exact client id",
);
assertEqual(
  authxFixture.scopes,
  ["openid", "profile", "email", "offline_access"],
  "AuthX exact scopes",
);
assert(
  authxFixture.redirect_uris.includes(
    "http://127.0.0.1:65051/oauth/callback",
  ),
  "AuthX exact loopback callback is missing",
);
for (const evidence of [
  'const nonce = randomBytes(24).toString("base64url")',
  'assertEqual(id.payload.nonce, nonce, "ID token nonce")',
  'assertEqual(header.alg, "ES256", "JWT algorithm")',
]) {
  assert(authxScript.includes(evidence), `AuthX fixture verifier missing ${evidence}`);
}
for (const claim of [
  '"sid"',
  '"iat"',
  '"exp"',
  '"nonce"',
  '"project_id"',
  '"environment"',
  '"oauth_client_id"',
]) {
  assert(
    authxRuntime.includes(claim),
    `AuthX runtime discovery omits ${claim}`,
  );
}

const applicationOpenApi = json(
  await readFile(
    path.join(nexusRoot, "packages/contracts/application-access.openapi.json"),
    "utf8",
  ),
);
const applicationController = await readFile(
  path.join(
    nexusRoot,
    "apps/api/src/application-access/application-access.controller.ts",
  ),
  "utf8",
);
const gatewayOpenApi = json(
  await readFile(
    path.join(nexusRoot, "packages/contracts/data.openapi.json"),
    "utf8",
  ),
);
const expectedOperations = new Map([
  ["/api/v1/application-access/status", ["get"]],
  ["/api/v1/application-access/bootstrap", ["post"]],
  ["/api/v1/application-access/inference-key/rotate", ["post"]],
  ["/api/v1/application-access/revoke", ["post"]],
  ["/api/v1/application-access/checkout", ["post"]],
]);
const actualApplicationPaths = Object.keys(applicationOpenApi.paths).filter(
  (entry) => entry.startsWith("/api/v1/application-access/"),
);
assertEqual(
  actualApplicationPaths.sort(),
  [...expectedOperations.keys()].sort(),
  "Nexus Application Access paths",
);
for (const [route, methods] of expectedOperations) {
  assertEqual(
    Object.keys(applicationOpenApi.paths[route]).sort(),
    methods,
    `Nexus methods for ${route}`,
  );
  const operation = applicationOpenApi.paths[route][methods[0]];
  assert(
    operation.requestBody === undefined,
    `Nexus mutation ${route} unexpectedly accepts a body`,
  );
}
const accessSchema =
  applicationOpenApi.components.schemas.ApplicationAccessStatusDto;
assertEqual(
  accessSchema.required,
  [
    "state",
    "bindingId",
    "providerConnectionId",
    "gatewayBaseUrl",
    "planKey",
    "checkoutAvailable",
  ],
  "Nexus Application Access required fields",
);
assert(
  applicationOpenApi.components.schemas.ApplicationAccessBootstrapDto.properties
    .inferenceKeyPlaintext !== undefined,
  "Nexus bootstrap plaintext field is missing",
);
assert(
  applicationController.includes("@Post('inference-key/rotate')") &&
    applicationController.includes("@Post('checkout')"),
  "Nexus controller does not implement generated OpenAPI",
);
assert(
  gatewayOpenApi.paths[
    "/api/v1/gateway/providers/{providerConnectionId}/{providerPath}"
  ] !== undefined,
  "Nexus provider-scoped Gateway path is missing",
);

const recoveryProtocol = await readFile(
  path.join(
    hostRoot,
    "packages/desktop/src/main/generation-recovery-protocol.ts",
  ),
  "utf8",
);
const stdioClient = await readFile(
  path.join(hostRoot, "packages/desktop/src/main/stdio-mcp-client.ts"),
  "utf8",
);
const generationRuntime = await readFile(
  path.join(hostRoot, "packages/desktop/src/main/generation-plugin-runtime.ts"),
  "utf8",
);
const generationManifestContract = await readFile(
  path.join(hostRoot, "packages/plugin-sdk/src/generation.ts"),
  "utf8",
);
for (const exact of [
  'generationLroCapabilitySchema = "convax.generation-lro/1"',
  'generationLroRequestSchema = "convax.generation-lro-request/1"',
  'generationLroSnapshotSchema = "convax.generation-lro-snapshot/1"',
  'get: "convax/generation/operations/get"',
  'wait: "convax/generation/operations/wait"',
  'cancel: "convax/generation/operations/cancel"',
  'result: "convax/generation/operations/result"',
  'acknowledge: "convax/generation/operations/acknowledge"',
]) {
  assert(
    recoveryProtocol.includes(exact),
    `Convax Host LRO contract missing ${exact}`,
  );
}
assert(
  stdioClient.includes('capabilities.experimental["convax/generation-lro"]'),
  "Convax Host capability key changed",
);
assert(
  stdioClient.includes(
    "method === generationLroMethods.wait ? false : 30_000",
  ),
  "Convax Host wait deadline contract changed",
);
assert(
  generationRuntime.includes("CONVAX_GENERATION_LRO_DIRECTORY"),
  "Convax Host journal authority handoff is missing",
);
assert(
  generationManifestContract.includes(
    'recoveryInput.schema !== "convax.generation-lro/1"',
  ) &&
    generationManifestContract.includes(
      'recoveryInput.mode !== "long-running-operation"',
    ),
  "Convax Host manifest recovery contract changed",
);

console.log(
  JSON.stringify({
    authx: {
      clientId: authxFixture.client_id,
      redirectUri: "http://127.0.0.1:65051/oauth/callback",
      scopes: authxFixture.scopes,
    },
    host: {
      capability: "convax/generation-lro",
      schema: "convax.generation-lro/1",
    },
    nexus: {
      operations: [...expectedOperations.keys()],
    },
    status: "passed",
  }),
);

function json(serialized) {
  return JSON.parse(serialized);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} mismatch: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
    );
  }
}
