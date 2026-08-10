import { randomBytes } from "node:crypto";

import { llmGatewaySchema } from "./contracts.ts";
import type { NexusClient } from "./nexus-client.ts";

const maximumRequestBytes = 8 * 1024 * 1024;

function errorResponse(status: number, message: string, type: string) {
  return Response.json(
    { error: { message, type } },
    { headers: { "Cache-Control": "no-store" }, status },
  );
}

export class NexusLlmGateway {
  readonly #token = randomBytes(32).toString("base64url");
  #server: Bun.Server<unknown> | undefined;
  #start:
    | Promise<{
        api_key: string;
        base_url: string;
        schema: typeof llmGatewaySchema;
      }>
    | undefined;

  constructor(private readonly client: NexusClient) {}

  start() {
    return (this.#start ??= this.#listen());
  }

  async #listen() {
    const server = Bun.serve({
      fetch: (request) => this.#handle(request),
      hostname: "127.0.0.1",
      maxRequestBodySize: maximumRequestBytes,
      port: 0,
    });
    this.#server = server;
    return {
      api_key: this.#token,
      base_url: `http://127.0.0.1:${server.port}/v1`,
      schema: llmGatewaySchema,
    };
  }

  async #handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.host !== `127.0.0.1:${this.#server?.port ?? 0}`) {
      return errorResponse(
        403,
        "Invalid loopback host",
        "invalid_request_error",
      );
    }
    if (request.headers.get("authorization") !== `Bearer ${this.#token}`) {
      return errorResponse(
        401,
        "Invalid gateway credential",
        "authentication_error",
      );
    }
    if (
      !["GET", "POST", "DELETE"].includes(request.method) ||
      !url.pathname.startsWith("/v1/") ||
      url.pathname.length <= "/v1/".length ||
      url.hash
    ) {
      return errorResponse(
        404,
        "OpenRouter endpoint was not found",
        "invalid_request_error",
      );
    }
    const hasBody = request.body !== null;
    if (
      hasBody &&
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      return errorResponse(
        415,
        "OpenRouter request must be JSON",
        "invalid_request_error",
      );
    }
    const contentLength = request.headers.get("content-length");
    const declared = contentLength === null ? 0 : Number(contentLength);
    if (
      !Number.isSafeInteger(declared) ||
      declared < 0 ||
      declared > maximumRequestBytes
    ) {
      return errorResponse(
        413,
        "LLM request is too large",
        "invalid_request_error",
      );
    }

    try {
      const body = hasBody
        ? new Uint8Array(await request.arrayBuffer())
        : undefined;
      if (body && body.length > maximumRequestBytes) {
        return errorResponse(
          400,
          "OpenRouter request body is invalid",
          "invalid_request_error",
        );
      }
      const context = await this.client.gatewayContext();
      const upstreamUrl = new URL(
        `${context.provider.gatewayBaseUrl}${url.pathname.slice("/v1".length)}${url.search}`,
      );
      const upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers: {
          accept: request.headers.get("accept") ?? "*/*",
          authorization: `Bearer ${context.dataToken}`,
          ...(body && body.length > 0
            ? { "content-type": "application/json" }
            : {}),
        },
        ...(body && body.length > 0 ? { body } : {}),
        signal: request.signal,
      });
      const headers = new Headers({ "Cache-Control": "no-store" });
      const contentType = upstream.headers.get("content-type");
      if (contentType) headers.set("Content-Type", contentType);
      const requestId = upstream.headers.get("x-request-id");
      if (requestId) headers.set("X-Request-Id", requestId.slice(0, 191));
      return new Response(upstream.body, { headers, status: upstream.status });
    } catch {
      if (request.signal.aborted)
        return errorResponse(499, "LLM request was cancelled", "cancelled");
      return errorResponse(502, "Convax gateway request failed", "api_error");
    }
  }

  close() {
    this.#server?.stop(true);
    this.#server = undefined;
  }
}
