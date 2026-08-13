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
import { MemoryCredentialStore } from "../src/credential-store.ts";
import type { AuthXPublicClientProfile } from "../src/authx-profile.ts";

const servers: Array<Bun.Server<unknown>> = [];
const roots: string[] = [];
const clientId = "oauthclient_B9_0ytc_a6EYscxqP1XJTK1dP0_MLf7L";
const projectId = "project_MsBvyP8LJmnTzmkwTLfmc5ORarS6fhfC";
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
  test("verifies AuthX ES256 tokens and consumes only generated Application Access operations", async () => {
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
    let rotationCount = 0;
    let revoked = false;
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
        if (url.pathname === "/api/v1/application-access/bootstrap") {
          return Response.json(accessResponse(gatewayBaseUrl));
        }
        if (
          url.pathname === "/api/v1/application-access/inference-key/rotate"
        ) {
          rotationCount += 1;
          return Response.json({
            ...accessResponse(gatewayBaseUrl),
            ...(rotationCount === 1
              ? {}
              : {
                  inferenceKeyPlaintext:
                    "nxs_test_inference_key_with_sufficient_length",
                }),
          });
        }
        if (url.pathname === "/api/v1/application-access/status") {
          return Response.json(accessResponse(gatewayBaseUrl));
        }
        if (url.pathname === "/api/v1/application-access/revoke") {
          revoked = true;
          return Response.json({
            ...accessResponse(gatewayBaseUrl),
            state: "REVOKED",
          });
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
          return revoked
            ? Response.json({ error: "revoked" }, { status: 401 })
            : Response.json({ data: [] });
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
      scopes: ["openid", "profile", "email", "offline_access"],
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
      "openid profile email offline_access",
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

    expect(rotationCount).toBe(2);
    const mutationRequests = requests.filter(({ method }) => method === "POST");
    expect(mutationRequests.map(({ path }) => path)).toEqual([
      "/api/v1/application-access/bootstrap",
      "/api/v1/application-access/inference-key/rotate",
      "/api/v1/application-access/inference-key/rotate",
    ]);
    for (const request of mutationRequests) {
      expect(request.body).toBe("");
      expect(request.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
      expect(request.authorization).toMatch(
        /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u,
      );
    }
    expect(mutationRequests[1]?.idempotencyKey).not.toBe(
      mutationRequests[2]?.idempotencyKey,
    );

    expect(await credentials.read()).toMatchObject({
      authxIssuer: authx.url.origin,
      bindingId: "binding-fixed",
      gatewayBaseUrl: `${nexus.url.origin}/api/v1/gateway/providers/provider-fixed`,
      inferenceKey: "nxs_test_inference_key_with_sufficient_length",
      providerConnectionId: "provider-fixed",
    });
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
    expect(submit?.authorization).toBe(
      "Bearer nxs_test_inference_key_with_sufficient_length",
    );
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
    const nexusRevoke = requests.find(
      ({ path }) => path === "/api/v1/application-access/revoke",
    );
    expect(nexusRevoke).toMatchObject({ body: "", method: "POST" });
    expect(nexusRevoke?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
    const oauthRevoke = authxRequests.at(-1);
    expect(oauthRevoke?.path).toBe("/oauth/revoke");
    const revokeForm = new URLSearchParams(oauthRevoke?.body);
    expect(revokeForm.get("client_id")).toBe(clientId);
    expect(revokeForm.get("token")).toContain("refresh");
    expect(
      JSON.stringify(
        requests
          .filter(({ path }) => path.startsWith("/api/v1/application-access/"))
          .map(({ body, idempotencyKey, method, path }) => ({
            body,
            idempotencyKey,
            method,
            path,
          })),
      ),
    ).not.toContain("nxs_test_inference_key_with_sufficient_length");
  });
});

function accessResponse(gatewayBaseUrl: string) {
  return {
    bindingId: "binding-fixed",
    checkoutAvailable: true,
    gatewayBaseUrl,
    inferenceKey: {
      enabled: true,
      expiresAt: "2026-09-13T00:00:00.000Z",
      id: "inference-key-fixed",
      prefix: "nxs_test",
    },
    planKey: "pro",
    providerConnectionId: "provider-fixed",
    state: "ACTIVE",
    workspaceAccessId: "workspace-access-fixed",
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
) {
  const iat = Math.floor(now.getTime() / 1_000);
  const common = {
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
  };
  return {
    access_token: jwt(privateKey, { ...common, token_use: "access" }),
    expires_in: 900,
    id_token: jwt(privateKey, {
      ...common,
      ...(nonce === undefined ? {} : { nonce }),
      token_use: "id",
    }),
    refresh_token: `authx.rotating.refresh.${refreshes}.with.sufficient.length`,
    scope: "openid profile email offline_access",
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
