import { describe, expect, test } from "bun:test";

import { NexusAuthorization } from "../src/authorization.ts";
import { externalAuthorizationCompletionSchema } from "../src/contracts.ts";

function authorizationClient(
  exchangeAuthorizationCode: (input: unknown) => Promise<unknown>,
) {
  return {
    async authorizationUrl(input: {
      codeChallenge: string;
      nonce: string;
      redirectUri: string;
      state: string;
    }) {
      const url = new URL(
        "http://localhost:3000/workspace/convax/auth/sign-up",
      );
      url.searchParams.set("code_challenge", input.codeChallenge);
      url.searchParams.set("nonce", input.nonce);
      url.searchParams.set("redirect_uri", input.redirectUri);
      url.searchParams.set("state", input.state);
      return url.href;
    },
    exchangeAuthorizationCode,
    async resolveAuthXIssuer() {
      return "http://localhost:3000";
    },
  } as never;
}

describe("NexusAuthorization", () => {
  test("keeps PKCE and the authorization code inside the companion loopback flow", async () => {
    const exchanges: unknown[] = [];
    const authorization = new NexusAuthorization(
      authorizationClient(async (input: unknown) => {
        exchanges.push(input);
        return {} as never;
      }),
    );
    const request = await authorization.begin();
    const publicUrl = new URL(request.authorization_url);
    const redirectUri = publicUrl.searchParams.get("redirect_uri");
    const state = publicUrl.searchParams.get("state");
    expect(redirectUri).toStartWith("http://127.0.0.1:");
    expect(state).toBeTruthy();
    expect(publicUrl.pathname).toBe("/workspace/convax/auth/sign-up");
    expect(publicUrl.searchParams.get("code_challenge")).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );

    const completing = authorization.complete({
      authorization_id: request.authorization_id,
      schema: externalAuthorizationCompletionSchema,
    });
    const callback = new URL(redirectUri!);
    callback.searchParams.set("code", "single-use-code");
    callback.searchParams.set("state", state!);
    const response = await fetch(callback);
    expect(response.status).toBe(200);
    const page = await response.text();
    expect(page).toContain("Connected to Convax");
    expect(page).toContain("close this tab and continue in Convax");
    expect(page).not.toContain("convax://");
    expect(page).not.toContain('http-equiv="refresh"');
    await completing;

    expect(exchanges).toHaveLength(1);
    expect(exchanges[0]).toMatchObject({
      code: "single-use-code",
      redirectUri,
    });
    expect((exchanges[0] as { codeVerifier: string }).codeVerifier).toMatch(
      /^[A-Za-z0-9_-]{43,128}$/,
    );
  });

  test("does not report success or return to Convax until the authorization code exchange succeeds", async () => {
    let finishExchange!: () => void;
    const exchange = new Promise<void>((resolve) => {
      finishExchange = resolve;
    });
    const authorization = new NexusAuthorization(
      authorizationClient(async () => {
        await exchange;
        return {} as never;
      }),
    );
    const request = await authorization.begin();
    const publicUrl = new URL(request.authorization_url);
    const callback = new URL(publicUrl.searchParams.get("redirect_uri")!);
    callback.searchParams.set("code", "single-use-code");
    callback.searchParams.set("state", publicUrl.searchParams.get("state")!);
    const completing = authorization.complete({
      authorization_id: request.authorization_id,
      schema: externalAuthorizationCompletionSchema,
    });
    let callbackCompleted = false;
    const callbackResponse = fetch(callback).then((response) => {
      callbackCompleted = true;
      return response;
    });

    await Bun.sleep(10_100);
    expect(callbackCompleted).toBeFalse();
    finishExchange();

    expect((await callbackResponse).status).toBe(200);
    await completing;
  });

  test("returns a failure page without a Convax deep link when the code exchange fails", async () => {
    const authorization = new NexusAuthorization(
      authorizationClient(async () => {
        throw new Error("token exchange failed");
      }),
    );
    const request = await authorization.begin();
    const publicUrl = new URL(request.authorization_url);
    const callback = new URL(publicUrl.searchParams.get("redirect_uri")!);
    callback.searchParams.set("code", "single-use-code");
    callback.searchParams.set("state", publicUrl.searchParams.get("state")!);
    const completing = authorization
      .complete({
        authorization_id: request.authorization_id,
        schema: externalAuthorizationCompletionSchema,
      })
      .catch((error) => error);

    const response = await fetch(callback);
    expect(response.status).toBe(400);
    const page = await response.text();
    expect(page).toContain("Convax connection failed");
    expect(page).not.toContain("convax://");
    expect(await completing).toBeInstanceOf(Error);
  });
});
