import { afterEach, describe, expect, test } from "bun:test";
import {
  generateKeyPairSync,
  randomUUID,
  sign,
  type KeyObject,
} from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NexusClient } from "../src/application-client.ts";
import { AuthXTokenVerifier } from "../src/authx-token-verifier.ts";
import { NexusCheckoutStore } from "../src/checkout-store.ts";
import { MemoryCredentialStore } from "../src/credential-store.ts";
import {
  resolveAuthXPublicClientProfile,
  type AuthXPublicClientProfile,
} from "../src/authx-profile.ts";
import type { AuthXTokenResponse } from "../src/contracts.ts";
import { NexusPluginService } from "../src/plugin-service.ts";
import type { NexusAuthorization } from "../src/authorization.ts";

const servers: Array<Bun.Server<unknown>> = [];
const roots: string[] = [];
const clientId = "oauthclient_Ty33MTkmTR6M90SCR1mvdUykHDJAHUnr";
const projectId = "project_OKnlkG5kU1lNrOqJs0GFTu4JM2SwNkHz";
const nexusProjectId = "project_8CTrOpIkozdhK7EkndKbR210ZU1NUYvW";
const redirectUri = "http://127.0.0.1:65051/oauth/callback";
const now = new Date("2026-08-13T00:00:00.000Z");

afterEach(async () => {
  for (const server of servers.splice(0)) server.stop(true);
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("AuthX OAuth and Nexus Application Access owner contracts", () => {
  test("pins the production Convax AuthX public client", async () => {
    await expect(resolveAuthXPublicClientProfile({})).resolves.toMatchObject({
      clientId,
      environment: "production",
      issuer: "https://authx.microvoid.io",
      projectId,
      redirectUri,
    });
    expect(projectId).not.toBe(nexusProjectId);
  });

  test("rejects every tenant claim for the Convax NONE profile", async () => {
    const { privateKey, publicJwk } = signingKey();
    const issuer = "https://authx.none-profile.test";
    const profile: AuthXPublicClientProfile = {
      clientId,
      environment: "development",
      issuer,
      jwksUri: `${issuer}/oauth/jwks.json`,
      projectId,
      redirectUri,
      scopes: [
        "openid",
        "profile",
        "email",
        "offline_access",
        "nexus:access",
      ],
    };
    const verifier = new AuthXTokenVerifier(profile, {
      fetch: async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/.well-known/openid-configuration") {
          return Response.json({
            authorization_endpoint: `${issuer}/oauth/authorize`,
            id_token_signing_alg_values_supported: ["ES256"],
            issuer,
            jwks_uri: `${issuer}/oauth/jwks.json`,
            revocation_endpoint: `${issuer}/oauth/revoke`,
            token_endpoint: `${issuer}/oauth/token`,
          });
        }
        if (url.pathname === "/oauth/jwks.json") {
          return Response.json({ keys: [publicJwk] });
        }
        return new Response("not found", { status: 404 });
      },
      now: () => now,
    });

    for (const [claim, value] of [
      ["organization_id", "organization_forbidden"],
      ["tenant_id", "organization_forbidden"],
      ["selected_team_id", "team_forbidden"],
    ] as const) {
      await expect(
        verifier.verify(
          tokenSet(privateKey, issuer, "n".repeat(32), 0, {
            [claim]: value,
          }),
          "n".repeat(32),
        ),
      ).rejects.toThrow("AuthX JWT claims are invalid");
    }
  });

  test("verifies AuthX Application tokens and sends the same token directly to Nexus Gateway", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-application-contract-"),
    );
    roots.push(root);
    const requests: Array<{
      authorization: string | null;
      body: string;
      idempotencyKey: string | null;
      method: string;
      path: string;
    }> = [];
    let nexus!: Bun.Server<unknown>;
    nexus = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        const body = request.body ? await request.text() : "";
        requests.push({
          authorization: request.headers.get("authorization"),
          body,
          idempotencyKey: request.headers.get("idempotency-key"),
          method: request.method,
          path: url.pathname,
        });
        const gatewayBaseUrl = `http://127.0.0.1:${nexus.port}/api/v1/gateway/providers/provider-fixed`;
        if (url.pathname === "/api/v1/application-access/status") {
          return Response.json(accessResponse(gatewayBaseUrl));
        }
        if (
          url.pathname === "/api/v1/gateway/providers/provider-fixed/models"
        ) {
          if (url.searchParams.get("output_modalities") === "speech") {
            return Response.json({
              data: [
                {
                  architecture: { output_modalities: ["audio", "speech"] },
                  id: "fake/audio-v1",
                  name: "Fake Audio",
                },
              ],
            });
          }
          return Response.json({ data: [] });
        }
        if (url.pathname === "/api/v1/application-access/checkout") {
          return Response.json({
            action: {
              kind: "REDIRECT",
              url: "https://checkout.example.test/session/fixed",
            },
            expiresAt: "2026-08-13T00:15:00.000Z",
            id: "checkout-fixed",
            provider: "CREEM",
            status: "CREATED",
          });
        }
        if (url.pathname.endsWith("/videos/models")) {
          return Response.json({
            data: [{ id: "fake/video-v1", name: "Fake Video" }],
          });
        }
        if (url.pathname.endsWith("/images/models")) {
          return Response.json({
            data: [
              {
                architecture: { output_modalities: ["image"] },
                id: "fake/image-v1",
                name: "Fake Image",
              },
            ],
          });
        }
        if (url.pathname.endsWith("/images")) {
          return Response.json({
            data: [
              {
                b64_json: Buffer.from([
                  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0,
                ]).toString("base64"),
                media_type: "image/png",
              },
            ],
          });
        }
        if (url.pathname.endsWith("/audio/speech")) {
          return new Response(
            Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0]),
            { headers: { "content-type": "audio/mpeg" } },
          );
        }
        if (url.pathname.endsWith("/videos")) {
          return Response.json(
            { id: "provider-task-fixed", status: "queued" },
            { status: 202 },
          );
        }
        throw new Error(
          `Unexpected Nexus request: ${request.method} ${url.pathname}`,
        );
      },
    });
    servers.push(nexus);

    const { privateKey, publicJwk } = signingKey();
    const authxRequests: Array<{ body: string; path: string }> = [];
    let refreshes = 0;
    let authx!: Bun.Server<unknown>;
    authx = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        const body = request.body ? await request.text() : "";
        authxRequests.push({ body, path: url.pathname });
        if (url.pathname === "/.well-known/openid-configuration") {
          return Response.json({
            authorization_endpoint: `${authx.url.origin}/oauth/authorize`,
            id_token_signing_alg_values_supported: ["ES256"],
            issuer: authx.url.origin,
            jwks_uri: `${authx.url.origin}/oauth/jwks.json`,
            revocation_endpoint: `${authx.url.origin}/oauth/revoke`,
            token_endpoint: `${authx.url.origin}/oauth/token`,
          });
        }
        if (url.pathname === "/oauth/jwks.json") {
          return Response.json({ keys: [publicJwk] });
        }
        if (url.pathname === "/oauth/revoke") {
          return new Response(null, { status: 200 });
        }
        if (url.pathname !== "/oauth/token") {
          return new Response("not found", { status: 404 });
        }
        const form = new URLSearchParams(body);
        const grantType = form.get("grant_type");
        if (grantType === "refresh_token") refreshes += 1;
        const nonce =
          grantType === "authorization_code" ? "n".repeat(32) : undefined;
        return Response.json(
          tokenSet(privateKey, authx.url.origin, nonce, refreshes),
        );
      },
    });
    servers.push(authx);

    const profile: AuthXPublicClientProfile = {
      clientId,
      environment: "development",
      issuer: authx.url.origin,
      jwksUri: `${authx.url.origin}/oauth/jwks.json`,
      projectId,
      redirectUri,
      scopes: [
        "openid",
        "profile",
        "email",
        "offline_access",
        "nexus:access",
      ],
    };
    const credentials = new MemoryCredentialStore();
    const client = new NexusClient(credentials, {
      authxProfile: profile,
      environment: {
        HOME: root,
        XDG_CONFIG_HOME: path.join(root, "config"),
      },
      fetch,
      gatewayOrigins: [nexus.url.origin],
      nexusOrigin: nexus.url.origin,
      now: () => now,
    });

    const authorizationUrl = new URL(
      await client.authorizationUrl({
        codeChallenge: "A".repeat(43),
        nonce: "n".repeat(32),
        redirectUri,
        state: "s".repeat(32),
      }),
    );
    expect(authorizationUrl.searchParams.get("audience")).toBeNull();
    expect(authorizationUrl.searchParams.get("client_id")).toBe(clientId);
    expect(authorizationUrl.searchParams.get("scope")).toBe(
      "openid profile email offline_access nexus:access",
    );
    expect(authorizationUrl.searchParams.get("nonce")).toBe("n".repeat(32));
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(redirectUri);

    await client.exchangeAuthorizationCode({
      authorizationId: "authorization-owner-contract",
      code: "authx-single-use-authorization-code",
      codeVerifier: "v".repeat(64),
      nonce: "n".repeat(32),
      redirectUri,
    });

    expect(
      requests.filter(({ path }) =>
        ["/bootstrap", "/inference-key/rotate", "/revoke"].some((suffix) =>
          path.endsWith(suffix),
        ),
      ),
    ).toEqual([]);

    const applicationStatus = requests.find(
      ({ path }) => path === "/api/v1/application-access/status",
    );
    expect(applicationStatus?.authorization).toMatch(
      /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u,
    );

    const storedCredential = await credentials.read();
    expect(storedCredential).toMatchObject({
      authxIssuer: authx.url.origin,
      nexusOrigin: nexus.url.origin,
      schema: "convax.nexus-authx-refresh-credential/2",
    });
    expect(Object.keys(storedCredential ?? {}).sort()).toEqual([
      "accountBinding",
      "authxIssuer",
      "nexusOrigin",
      "refreshToken",
      "schema",
    ]);
    expect(
      await client.createCheckout(
        "pro",
        "checkout-owner-contract-idempotency-key",
      ),
    ).toEqual({
      action: {
        kind: "REDIRECT",
        url: "https://checkout.example.test/session/fixed",
      },
      expiresAt: "2026-08-13T00:15:00.000Z",
      id: "checkout-fixed",
      provider: "CREEM",
      status: "CREATED",
    });
    expect(
      requests.find(
        ({ path }) => path === "/api/v1/application-access/checkout",
      ),
    ).toMatchObject({
      body: "",
      idempotencyKey: "checkout-owner-contract-idempotency-key",
      method: "POST",
    });

    const routes = await client.generationRoutes();
    const audioResult = await routes.audio.complete(
      routes.audio.models[0]!,
      "A deterministic voice.",
      {
        provider: {
          allow_fallbacks: false,
          order: ["openai"],
          options: { openai: { latency: "balanced" } },
        },
        response_format: "mp3",
        speed: 1.25,
        vendor_null: null,
        voice: "alloy",
      },
      "audio-owner-contract",
      new AbortController().signal,
    );
    expect(audioResult.mimeType).toBe("audio/mpeg");
    const audioRequest = requests.find(({ path }) =>
      path.endsWith("/audio/speech"),
    );
    expect(JSON.parse(audioRequest?.body ?? "{}")).toEqual({
      input: "A deterministic voice.",
      model: "fake/audio-v1",
      provider: {
        allow_fallbacks: false,
        order: ["openai"],
        options: { openai: { latency: "balanced" } },
      },
      response_format: "mp3",
      speed: 1.25,
      vendor_null: null,
      voice: "alloy",
    });
    await routes.image.complete(
      routes.image.models[0]!,
      "A deterministic image.",
      {
        aspect_ratio: "1:1",
        background: "transparent",
        n: 2,
        output_compression: 40,
        output_format: "png",
        quality: "high",
        resolution: "1K",
        seed: 41,
        size: "1024x1024",
      },
      "image-owner-contract",
      new AbortController().signal,
    );
    const imageRequest = requests.find(({ path }) => path.endsWith("/images"));
    expect(JSON.parse(imageRequest?.body ?? "{}")).toEqual({
      aspect_ratio: "1:1",
      background: "transparent",
      model: "fake/image-v1",
      n: 2,
      output_compression: 40,
      output_format: "png",
      prompt: "A deterministic image.",
      quality: "high",
      resolution: "1K",
      seed: 41,
      size: "1024x1024",
    });

    const video = routes.video;
    await video.submit(
      video.models[0]!,
      "A deterministic video.",
      { aspect_ratio: "16:9", duration: 5, seed: 42 },
      "operation-owner-contract",
      "a".repeat(64),
      new AbortController().signal,
    );
    const submit = requests.at(-1);
    expect(submit?.path).toBe(
      "/api/v1/gateway/providers/provider-fixed/videos",
    );
    expect(submit?.authorization).toBe(applicationStatus?.authorization);
    expect(submit?.idempotencyKey).toMatch(/^convax-video-[a-f0-9]{64}$/u);
    expect(JSON.parse(submit?.body ?? "{}")).toMatchObject({
      aspect_ratio: "16:9",
      duration: 5,
      model: "fake/video-v1",
      prompt: "A deterministic video.",
      seed: 42,
    });

    await client.signOut();
    expect(await credentials.read()).toBeNull();
    expect(
      requests.find(
        ({ path }) => path === "/api/v1/application-access/revoke",
      ),
    ).toBeUndefined();
    const oauthRevoke = authxRequests.at(-1);
    expect(oauthRevoke?.path).toBe("/oauth/revoke");
    const revokeForm = new URLSearchParams(oauthRevoke?.body);
    expect(revokeForm.get("client_id")).toBe(clientId);
    expect(revokeForm.get("token")).toContain("refresh");
  });

  test("surfaces Nexus setup, disabled and outage states without storing a credential", async () => {
    for (const [status, code, expectedMessage] of [
      [
        409,
        "application_setup_required",
        "Nexus setup is not finished. Ask a Nexus administrator to bind an active Workspace, Plan, and Provider connection.",
      ],
      [
        403,
        "application_disabled",
        "Nexus access for Convax has been disabled. Ask a Nexus administrator to review the Application binding.",
      ],
      [
        503,
        "nexus_unavailable",
        "Nexus is temporarily unavailable. Try again later.",
      ],
    ] as const) {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), "convax-nexus-admission-error-"),
      );
      roots.push(root);
      const { privateKey, publicJwk } = signingKey();
      const issuer = "https://authx.admission.test";
      const profile: AuthXPublicClientProfile = {
        clientId,
        environment: "development",
        issuer,
        jwksUri: `${issuer}/oauth/jwks.json`,
        projectId,
        redirectUri,
        scopes: [
          "openid",
          "profile",
          "email",
          "offline_access",
          "nexus:access",
        ],
      };
      const credentials = new MemoryCredentialStore();
      const client = new NexusClient(credentials, {
        authxProfile: profile,
        nexusOrigin: "http://127.0.0.1:3000",
        now: () => now,
        fetch: async (input) => {
          const url = new URL(String(input));
          if (url.origin === issuer && url.pathname === "/.well-known/openid-configuration") {
            return Response.json({
              authorization_endpoint: `${issuer}/oauth/authorize`,
              id_token_signing_alg_values_supported: ["ES256"],
              issuer,
              jwks_uri: `${issuer}/oauth/jwks.json`,
              revocation_endpoint: `${issuer}/oauth/revoke`,
              token_endpoint: `${issuer}/oauth/token`,
            });
          }
          if (url.origin === issuer && url.pathname === "/oauth/jwks.json") {
            return Response.json({ keys: [publicJwk] });
          }
          if (url.origin === issuer && url.pathname === "/oauth/token") {
            return Response.json(
              tokenSet(privateKey, issuer, "n".repeat(32), 0),
            );
          }
          if (url.pathname === "/api/v1/application-access/status") {
            return Response.json(
              { code, message: "server detail must not replace public copy" },
              { status },
            );
          }
          return new Response("not found", { status: 404 });
        },
      });

      await expect(
        client.exchangeAuthorizationCode({
          authorizationId: `authorization-${code}`,
          code: "authx-single-use-authorization-code",
          codeVerifier: "v".repeat(64),
          nonce: "n".repeat(32),
          redirectUri,
        }),
      ).rejects.toThrow(expectedMessage);
      expect(await credentials.read()).toBeNull();
    }
  });

  test("surfaces setup-required status instead of collapsing it to generic attention", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-status-error-"),
    );
    roots.push(root);
    const { privateKey, publicJwk } = signingKey();
    const issuer = "https://authx.status.test";
    const nexusOrigin = "http://127.0.0.1:3000";
    const profile: AuthXPublicClientProfile = {
      clientId,
      environment: "development",
      issuer,
      jwksUri: `${issuer}/oauth/jwks.json`,
      projectId,
      redirectUri,
      scopes: [
        "openid",
        "profile",
        "email",
        "offline_access",
        "nexus:access",
      ],
    };
    const credentials = new MemoryCredentialStore();
    await credentials.write({
      accountBinding: "a".repeat(64),
      authxIssuer: issuer,
      nexusOrigin,
      refreshToken: "authx.refresh.credential.with.sufficient.length",
      schema: "convax.nexus-authx-refresh-credential/2",
    });
    const client = new NexusClient(credentials, {
      authxProfile: profile,
      nexusOrigin,
      now: () => now,
      fetch: async (input) => {
        const url = new URL(String(input));
        if (url.origin === issuer && url.pathname === "/oauth/token") {
          return Response.json(tokenSet(privateKey, issuer, undefined, 1));
        }
        if (
          url.origin === issuer &&
          url.pathname === "/.well-known/openid-configuration"
        ) {
          return Response.json({
            authorization_endpoint: `${issuer}/oauth/authorize`,
            id_token_signing_alg_values_supported: ["ES256"],
            issuer,
            jwks_uri: `${issuer}/oauth/jwks.json`,
            revocation_endpoint: `${issuer}/oauth/revoke`,
            token_endpoint: `${issuer}/oauth/token`,
          });
        }
        if (url.origin === issuer && url.pathname === "/oauth/jwks.json") {
          return Response.json({ keys: [publicJwk] });
        }
        if (url.pathname === "/api/v1/application-access/status") {
          return Response.json(
            { code: "application_setup_required" },
            { status: 409 },
          );
        }
        return new Response("not found", { status: 404 });
      },
    });
    const service = new NexusPluginService(
      {} as NexusAuthorization,
      client,
      credentials,
      new NexusCheckoutStore({ XDG_CONFIG_HOME: root }),
    );

    await expect(service.status()).rejects.toThrow(
      "Nexus setup is not finished. Ask a Nexus administrator to bind an active Workspace, Plan, and Provider connection.",
    );
  });
});

function accessResponse(gatewayBaseUrl: string) {
  return {
    applicationId: "application-fixed",
    applicationVersion: 1,
    checkoutAvailable: true,
    gatewayBaseUrl,
    planKey: "pro",
    state: "ACTIVE",
  };
}

function signingKey() {
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    privateKey: pair.privateKey,
    publicJwk: {
      ...(pair.publicKey.export({ format: "jwk" }) as JsonWebKey),
      alg: "ES256",
      kid: "authx-test-key",
      use: "sig",
    },
  };
}

function tokenSet(
  privateKey: KeyObject,
  issuer: string,
  nonce: string | undefined,
  refreshes: number,
  additionalClaims: Readonly<Record<string, unknown>> = {},
): AuthXTokenResponse {
  const iat = Math.floor(now.getTime() / 1_000);
  const common = {
    application_id: projectId,
    aud: clientId,
    client_id: clientId,
    environment: "development",
    exp: iat + 900,
    iat,
    iss: issuer,
    jti: randomUUID(),
    oauth_client_id: clientId,
    project_id: projectId,
    sid: "authx-session-fixed",
    sub: "pairwise-subject-fixed",
    ...additionalClaims,
  };
  return {
    access_token: jwt(privateKey, {
      ...common,
      scope: "openid profile email offline_access nexus:access",
      token_use: "access",
    }),
    expires_in: 900,
    id_token: jwt(privateKey, {
      ...common,
      ...(nonce === undefined ? {} : { nonce }),
      token_use: "id",
    }),
    refresh_token: `authx.rotating.refresh.${refreshes}.with.sufficient.length`,
    scope: "openid profile email offline_access nexus:access",
    token_type: "Bearer",
  };
}

function jwt(privateKey: KeyObject, payload: Record<string, unknown>) {
  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", kid: "authx-test-key", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign("sha256", Buffer.from(`${header}.${body}`), {
    dsaEncoding: "ieee-p1363",
    key: privateKey,
  }).toString("base64url");
  return `${header}.${body}.${signature}`;
}
