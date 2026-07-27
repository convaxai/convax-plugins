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

  models(signal?: AbortSignal) {
    return this.client.models(signal);
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
      request.method === "GET" &&
      url.pathname === "/v1/models" &&
      !url.search &&
      !url.hash
    ) {
      try {
        const catalog = await this.client.models(request.signal);
        return Response.json(
          {
            data: catalog.models.map(({ id, name }) => ({
              created: 0,
              id,
              name,
              object: "model",
              owned_by: "nexus-openrouter",
            })),
            object: "list",
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch {
        if (request.signal.aborted)
          return errorResponse(499, "LLM request was cancelled", "cancelled");
        return errorResponse(
          502,
          "Nexus model catalog request failed",
          "api_error",
        );
      }
    }
    if (
      request.method !== "POST" ||
      url.pathname !== "/v1/chat/completions" ||
      url.search ||
      url.hash
    ) {
      return errorResponse(
        404,
        "LLM endpoint was not found",
        "invalid_request_error",
      );
    }
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      return errorResponse(
        415,
        "LLM request must be JSON",
        "invalid_request_error",
      );
    }
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > maximumRequestBytes) {
      return errorResponse(
        413,
        "LLM request is too large",
        "invalid_request_error",
      );
    }

    try {
      const body = new Uint8Array(await request.arrayBuffer());
      if (body.length < 2 || body.length > maximumRequestBytes) {
        return errorResponse(
          400,
          "LLM request body is invalid",
          "invalid_request_error",
        );
      }
      const context = await this.client.gatewayContext();
      const upstream = await fetch(
        `${context.provider.gatewayBaseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            accept: request.headers.get("accept") ?? "*/*",
            authorization: `Bearer ${context.dataToken}`,
            "content-type": "application/json",
          },
          body,
          signal: request.signal,
        },
      );
      const headers = new Headers({ "Cache-Control": "no-store" });
      const contentType = upstream.headers.get("content-type");
      if (contentType) headers.set("Content-Type", contentType);
      const requestId = upstream.headers.get("x-request-id");
      if (requestId) headers.set("X-Request-Id", requestId.slice(0, 191));
      return new Response(upstream.body, { headers, status: upstream.status });
    } catch {
      if (request.signal.aborted)
        return errorResponse(499, "LLM request was cancelled", "cancelled");
      return errorResponse(502, "Nexus Gateway request failed", "api_error");
    }
  }

  close() {
    this.#server?.stop(true);
    this.#server = undefined;
  }
}
