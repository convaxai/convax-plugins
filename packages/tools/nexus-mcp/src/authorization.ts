import { createHash, randomBytes } from "node:crypto";

import {
  externalAuthorizationCompletionSchema,
  externalAuthorizationRequestSchema,
  workspaceSlug,
  type ExternalAuthorizationRequest,
} from "./contracts.ts";
import type { NexusClient } from "./nexus-client.ts";

const authorizationTimeoutSeconds = 10 * 60;

interface CallbackOutcome {
  code?: string;
  error?: Error;
}

interface PendingAuthorization {
  authorizationId: string;
  callback: Promise<CallbackOutcome>;
  codeVerifier: string;
  completionPage: Promise<boolean>;
  nexusOrigin: string;
  redirectUri: string;
  resolveCompletionPage(succeeded: boolean): void;
  resolve(outcome: CallbackOutcome): void;
  server: Bun.Server<unknown>;
  state: string;
  timer: ReturnType<typeof setTimeout>;
}

export class NexusAuthorization {
  #pending: PendingAuthorization | undefined;

  constructor(private readonly client: NexusClient) {}

  async begin(): Promise<ExternalAuthorizationRequest> {
    this.cancel();
    const nexusOrigin = await this.client.resolveOrigin();
    const authorizationId = randomBytes(24).toString("base64url");
    const state = randomBytes(24).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    let resolveCallback!: (outcome: CallbackOutcome) => void;
    const callback = new Promise<CallbackOutcome>((resolve) => {
      resolveCallback = resolve;
    });
    let callbackSettled = false;
    const settle = (outcome: CallbackOutcome) => {
      if (callbackSettled) return;
      callbackSettled = true;
      resolveCallback(outcome);
    };
    let resolveCompletion!: (succeeded: boolean) => void;
    const completionPage = new Promise<boolean>((resolve) => {
      resolveCompletion = resolve;
    });
    let completionSettled = false;
    const settleCompletionPage = (succeeded: boolean) => {
      if (completionSettled) return;
      completionSettled = true;
      resolveCompletion(succeeded);
    };
    let server!: Bun.Server<unknown>;
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (
          request.method !== "GET" ||
          url.host !== `127.0.0.1:${server.port}` ||
          url.pathname !== "/callback"
        ) {
          return new Response("Not found", { status: 404 });
        }
        const returnedState = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (returnedState !== state || !code || code.length > 4_096) {
          settle({
            error: new Error("Nexus authorization callback was invalid"),
          });
          return callbackPage(false);
        }
        settle({ code });
        const succeeded = await completionPage;
        return callbackPage(succeeded, succeeded ? authorizationId : undefined);
      },
    });
    const redirectUri = `http://127.0.0.1:${server.port}/callback`;
    const timer = setTimeout(
      () => settle({ error: new Error("Nexus authorization timed out") }),
      authorizationTimeoutSeconds * 1_000,
    );
    timer.unref?.();
    this.#pending = {
      authorizationId,
      callback,
      codeVerifier,
      completionPage,
      nexusOrigin,
      redirectUri,
      resolveCompletionPage: settleCompletionPage,
      resolve: settle,
      server,
      state,
      timer,
    };
    const authorizationUrl = new URL(
      `/workspace/${workspaceSlug}/auth/sign-up`,
      nexusOrigin,
    );
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("code_challenge", codeChallenge);
    authorizationUrl.searchParams.set("state", state);
    return {
      authorization_id: authorizationId,
      authorization_url: authorizationUrl.href,
      schema: externalAuthorizationRequestSchema,
      timeout_seconds: authorizationTimeoutSeconds,
    };
  }

  async complete(input: unknown, signal?: AbortSignal): Promise<void> {
    const completion = parseCompletion(input);
    const pending = this.#pending;
    if (!pending || pending.authorizationId !== completion.authorizationId) {
      throw new Error("Nexus authorization request is not active");
    }
    try {
      const outcome = await waitForSignal(pending.callback, signal);
      if (outcome.error) throw outcome.error;
      if (!outcome.code)
        throw new Error("Nexus authorization did not return a code");
      await this.client.exchangeAuthorizationCode({
        code: outcome.code,
        codeVerifier: pending.codeVerifier,
        nexusOrigin: pending.nexusOrigin,
        redirectUri: pending.redirectUri,
      });
      pending.resolveCompletionPage(true);
    } catch (error) {
      pending.resolveCompletionPage(false);
      throw error;
    } finally {
      this.cancel();
    }
  }

  cancel(): void {
    const pending = this.#pending;
    if (!pending) return;
    this.#pending = undefined;
    clearTimeout(pending.timer);
    pending.resolve({ error: new Error("Nexus authorization was canceled") });
    pending.resolveCompletionPage(false);
    void pending.server.stop(false);
  }
}

function parseCompletion(value: unknown): { authorizationId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Nexus authorization completion is invalid");
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== 2 ||
    input.schema !== externalAuthorizationCompletionSchema ||
    typeof input.authorization_id !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/u.test(input.authorization_id)
  ) {
    throw new Error("Nexus authorization completion is invalid");
  }
  return { authorizationId: input.authorization_id };
}

function waitForSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function abortError() {
  const error = new Error("Nexus authorization was canceled");
  error.name = "AbortError";
  return error;
}

function callbackPage(succeeded: boolean, authorizationId?: string): Response {
  const title = succeeded ? "Connected to Nexus" : "Nexus connection failed";
  const detail = succeeded
    ? "Returning to Convax. If it does not open automatically, use the button below."
    : "Return to Convax and start the connection again.";
  const returnUrl =
    succeeded && authorizationId
      ? `convax://service-authorization/complete?authorization_id=${encodeURIComponent(authorizationId)}`
      : undefined;
  const automaticReturn = returnUrl
    ? `<meta http-equiv="refresh" content="0;url=${returnUrl}">`
    : "";
  const returnAction = returnUrl
    ? `<p><a href="${returnUrl}">Open Convax</a></p>`
    : "";
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${title}</title>${automaticReturn}<style>body{font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f6f3;color:#20201e}
main{max-width:420px;padding:32px;border:1px solid #ddd;border-radius:18px;background:white;text-align:center}h1{font-size:24px}p{color:#666}
a{display:inline-block;padding:10px 16px;border-radius:10px;background:#5b4df5;color:white;text-decoration:none;font-weight:600}</style></head>
<body><main><h1>${title}</h1><p>${detail}</p>${returnAction}</main></body></html>`,
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'",
        "Content-Type": "text/html; charset=utf-8",
      },
      status: succeeded ? 200 : 400,
    },
  );
}
