import { describe, expect, test } from "bun:test";

import { NexusAuthorization } from "../src/authorization.ts";
import { externalAuthorizationCompletionSchema } from "../src/contracts.ts";

describe("NexusAuthorization", () => {
  test("keeps PKCE and the authorization code inside the companion loopback flow", async () => {
    const exchanges: unknown[] = [];
    const authorization = new NexusAuthorization({
      resolveOrigin: async () => "http://localhost:3000",
      async exchangeAuthorizationCode(input: unknown) {
        exchanges.push(input);
        return {} as never;
      },
    } as never);
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
      nexusOrigin: "http://localhost:3000",
      redirectUri,
    });
    expect((exchanges[0] as { codeVerifier: string }).codeVerifier).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
  });

  test("does not report success or return to Convax until the authorization code exchange succeeds", async () => {
    let finishExchange!: () => void;
    const exchange = new Promise<void>((resolve) => {
      finishExchange = resolve;
    });
    const authorization = new NexusAuthorization({
      resolveOrigin: async () => "http://localhost:3000",
      async exchangeAuthorizationCode() {
        await exchange;
        return {} as never;
      },
    } as never);
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

    await Bun.sleep(10);
    expect(callbackCompleted).toBeFalse();
    finishExchange();

    expect((await callbackResponse).status).toBe(200);
    await completing;
  });

  test("returns a failure page without a Convax deep link when the code exchange fails", async () => {
    const authorization = new NexusAuthorization({
      resolveOrigin: async () => "http://localhost:3000",
      async exchangeAuthorizationCode() {
        throw new Error("token exchange failed");
      },
    } as never);
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
