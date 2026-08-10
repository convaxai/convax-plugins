import { asRecord, type JsonRpcRequest, type ToolResult } from "./contracts.ts";
import { NexusAuthorization } from "./authorization.ts";
import { NexusCheckoutStore } from "./checkout-store.ts";
import {
  NexusClient,
  NexusImageHttpError,
  NexusVideoHttpError,
  type NexusClientOptions,
  type NexusGenerationRoutes,
  type NexusImageRoute,
  type NexusVideoRoute,
} from "./nexus-client.ts";
import { NexusImageGenerator } from "./image-generator.ts";
import { NexusLlmGateway } from "./llm-gateway.ts";
import { NexusPluginService } from "./plugin-service.ts";
import { NexusSessionStore } from "./session-store.ts";
import { NexusVideoGenerator } from "./video-generator.ts";

const protocolVersion = "2025-03-26";
const maximumRequestBytes = 4 * 1024 * 1024;
const mediaModelCatalogTtlMs = 60_000;
const emptyInputSchema = {
  additionalProperties: false,
  properties: {},
  type: "object",
} as const;

function generationCallProperties(output: "image" | "video") {
  return {
    operation_id: {
      maxLength: 128,
      minLength: 1,
      pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
      type: "string",
    },
    output: { const: output, type: "string" },
    output_directory: { maxLength: 4_096, minLength: 1, type: "string" },
    prompt: { maxLength: 20_000, minLength: 1, type: "string" },
    references: { maxItems: 0, type: "array" },
    schema: { const: "convax.generation-call/1", type: "string" },
  } as const;
}

function generationModelChoices(models: readonly { id: string; name: string }[]) {
  return models
    .map(({ id, name }) => ({ id, name }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
}

export function imageGenerationTool(
  models: readonly { id: string; name: string }[],
) {
  if (models.length === 0 || models.length > 64) {
    throw new Error(
      "Nexus image model catalog is outside the bounded choice limit",
    );
  }
  const modelSchema = {
    oneOf: models.map(({ id, name }) => ({ const: id, title: name })),
    title: "Model",
    type: "string",
    "x-convax-role": "generation-model-id",
  } as const;
  return {
    description:
      "Generate an image through Convax using the OpenRouter protocol.",
    inputSchema: {
      additionalProperties: false,
      properties: { ...generationCallProperties("image"), model: modelSchema },
      required: [
        "schema",
        "operation_id",
        "prompt",
        "output",
        "output_directory",
        "references",
        "model",
      ],
      type: "object",
    },
    name: "image.generate",
  } as const;
}

export function videoGenerationTool(
  models: readonly { id: string; name: string }[],
) {
  if (models.length === 0 || models.length > 64) {
    throw new Error(
      "Nexus video model catalog is outside the bounded choice limit",
    );
  }
  const modelSchema = {
    oneOf: models.map(({ id, name }) => ({ const: id, title: name })),
    title: "Model",
    type: "string",
    "x-convax-role": "generation-model-id",
  } as const;
  return {
    description: "Generate a video through Convax using the OpenRouter protocol.",
    inputSchema: {
      additionalProperties: false,
      properties: { ...generationCallProperties("video"), model: modelSchema },
      required: [
        "schema",
        "operation_id",
        "prompt",
        "output",
        "output_directory",
        "references",
        "model",
      ],
      type: "object",
    },
    name: "video.generate",
  } as const;
}

const fixedTools = [
  {
    description:
      "Report the bounded Convax Workspace, access, quota, and OpenRouter connection status.",
    inputSchema: emptyInputSchema,
    name: "service.status",
  },
  {
    description:
      "Start Convax Hosted Auth in the user's system browser with PKCE and a loopback callback.",
    inputSchema: emptyInputSchema,
    name: "service.authorize",
  },
  {
    description:
      "Restart Convax Hosted Auth without deleting the current grant until replacement succeeds.",
    inputSchema: emptyInputSchema,
    name: "service.reauthorize",
  },
  {
    description:
      "Complete the active Convax Hosted Auth request after the loopback callback arrives.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        authorization_id: { maxLength: 128, minLength: 16, type: "string" },
        schema: {
          const: "convax.plugin-service-external-authorization-completion/1",
          type: "string",
        },
      },
      required: ["authorization_id", "schema"],
      type: "object",
    },
    name: "service.authorization.complete",
  },
  {
    description: "Cancel the active Convax Hosted Auth request.",
    inputSchema: emptyInputSchema,
    name: "service.authorization.cancel",
  },
  {
    description:
      "Revoke the Convax refresh grant and remove the local private session.",
    inputSchema: emptyInputSchema,
    name: "service.sign_out",
  },
  {
    description:
      "Create an access-scoped Convax Hosted Checkout for one server-advertised Plan.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        plan_key: {
          maxLength: 80,
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
          type: "string",
        },
      },
      required: ["plan_key"],
      type: "object",
    },
    name: "service.checkout",
  },
  {
    description:
      "Start the local OpenRouter protocol gateway backed by Convax.",
    inputSchema: emptyInputSchema,
    name: "llm.gateway.start",
  },
] as const;

export const tools = fixedTools;

const toolNames = new Set([
  "image.generate",
  "video.generate",
  ...tools.map(({ name }) => name),
]);
const emptyTools = new Set([
  "service.status",
  "service.authorize",
  "service.reauthorize",
  "service.authorization.cancel",
  "service.sign_out",
  "llm.gateway.start",
]);

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return input.jsonrpc === "2.0" && typeof input.method === "string";
}

export function publicImageGenerationErrorMessage(error: unknown) {
  if (!(error instanceof NexusImageHttpError)) {
    return (
      "Convax image generation failed. Check Convax in Services before " +
      "retrying because the upstream task result may be unknown."
    );
  }
  const details = [
    `HTTP ${error.status}`,
    ...(error.code === undefined ? [] : [`code ${error.code}`]),
    `request id ${error.requestId}`,
  ].join(", ");
  const action =
    error.status === 401 || error.status === 403
      ? "Reconnect Convax in Services before trying again."
      : error.status === 429
        ? "Check the Convax quota or Plan before trying again."
        : error.code === "metering_unsupported"
          ? "The Convax gateway has not enabled the OpenRouter image protocol yet."
          : error.status >= 500
            ? "Use the request id to review Convax diagnostics before trying again."
            : "Review Convax in Services and choose a currently listed image model before trying again.";
  return `Convax rejected image generation (${details}). ${action}`;
}

export function publicVideoGenerationErrorMessage(error: unknown) {
  if (!(error instanceof NexusVideoHttpError)) {
    return (
      "Convax video generation failed. Check Convax in Services before " +
      "retrying because the upstream task result may be unknown."
    );
  }
  const details = [
    `HTTP ${error.status}`,
    ...(error.code === undefined ? [] : [`code ${error.code}`]),
    `request id ${error.requestId}`,
  ].join(", ");
  const action =
    error.status === 401 || error.status === 403
      ? "Reconnect Convax in Services before trying again."
      : error.status === 429
        ? "Check the Convax quota or Plan before trying again."
        : error.code === "metering_unsupported"
          ? "The Convax gateway has not enabled the OpenRouter video protocol yet."
          : error.status >= 500
            ? "Use the request id to review Convax diagnostics before trying again."
            : "Review Convax in Services and choose a currently listed video model before trying again.";
  return `Convax rejected video generation (${details}). ${action}`;
}

export interface NexusMcpServerOptions {
  checkouts?: NexusCheckoutStore;
  client?: NexusClientOptions;
  environment?: Readonly<Record<string, string | undefined>>;
  send?: (value: unknown) => void;
  sessions?: NexusSessionStore;
}

export class NexusMcpServer {
  readonly #authorization: NexusAuthorization;
  readonly #client: NexusClient;
  readonly #gateway: NexusLlmGateway;
  readonly #handlers = new Set<Promise<void>>();
  readonly #inflight = new Map<number | string, AbortController>();
  readonly #sendValue: (value: unknown) => void;
  readonly #service: NexusPluginService;
  readonly #imageGenerator: NexusImageGenerator;
  readonly #videoGenerator: NexusVideoGenerator;
  #activeGenerationRoutes: NexusGenerationRoutes | undefined;
  #generationRouteEpoch = 0;
  #generationRouteExpiresAt = 0;
  #generationRouteRequest: Promise<NexusGenerationRoutes> | undefined;
  #closed = false;
  #reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  constructor(options: NexusMcpServerOptions = {}) {
    const sessions =
      options.sessions ?? new NexusSessionStore(options.environment);
    const client = new NexusClient(sessions, options.client);
    const checkouts =
      options.checkouts ?? new NexusCheckoutStore(options.environment);
    this.#authorization = new NexusAuthorization(client);
    this.#client = client;
    this.#service = new NexusPluginService(
      this.#authorization,
      client,
      sessions,
      checkouts,
    );
    this.#gateway = new NexusLlmGateway(client);
    this.#imageGenerator = new NexusImageGenerator();
    this.#videoGenerator = new NexusVideoGenerator();
    this.#sendValue =
      options.send ??
      ((value) => {
        Bun.stdout.write(`${JSON.stringify(value)}\n`);
      });
  }

  async run(input: ReadableStream<Uint8Array> = Bun.stdin.stream()) {
    if (this.#reader) throw new Error("MCP server is already running");
    let buffer = "";
    const decoder = new TextDecoder();
    const reader = input.getReader();
    this.#reader = reader;
    try {
      while (!this.#closed) {
        const { done, value: chunk } = await reader.read();
        if (done || this.#closed) break;
        buffer += decoder.decode(chunk, { stream: true });
        if (Buffer.byteLength(buffer, "utf8") > maximumRequestBytes) {
          throw new Error("MCP request exceeded the message size limit");
        }
        while (true) {
          const newline = buffer.indexOf("\n");
          if (newline < 0) break;
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          try {
            this.#dispatch(JSON.parse(line) as unknown);
          } catch {
            this.#sendError(null, -32_700, "Parse error");
          }
        }
      }
    } finally {
      this.close();
      if (this.#reader === reader) this.#reader = undefined;
      reader.releaseLock();
    }
  }

  #dispatch(value: unknown) {
    const handler = this.#handle(value);
    this.#handlers.add(handler);
    void handler.finally(() => this.#handlers.delete(handler));
  }

  async #handle(value: unknown) {
    if (this.#closed) return;
    if (!isJsonRpcRequest(value)) {
      this.#sendError(null, -32_600, "Invalid Request");
      return;
    }
    if (value.method === "notifications/initialized") return;
    if (value.method === "notifications/cancelled") {
      const params =
        value.params &&
        typeof value.params === "object" &&
        !Array.isArray(value.params)
          ? (value.params as Record<string, unknown>)
          : {};
      const requestId = params.requestId;
      if (typeof requestId === "number" || typeof requestId === "string") {
        this.#inflight.get(requestId)?.abort("Request was cancelled");
      }
      return;
    }
    if (value.id === undefined || value.id === null) return;
    if (value.method === "initialize") {
      const params = asRecord(value.params, "initialize params");
      if (params.protocolVersion !== protocolVersion) {
        this.#sendError(value.id, -32_602, "Unsupported MCP protocol version");
        return;
      }
      this.#sendResult(value.id, {
        capabilities: { tools: {} },
        protocolVersion,
        serverInfo: { name: "convax-nexus-mcp", version: "0.4.0" },
      });
      return;
    }
    if (value.method === "tools/list") {
      this.#sendResult(value.id, { tools: await this.#listedTools() });
      return;
    }
    if (value.method === "tools/call") {
      await this.#callTool({ ...value, id: value.id });
      return;
    }
    this.#sendError(value.id, -32_601, "Method not found");
  }

  async #callTool(request: JsonRpcRequest & { id: number | string }) {
    const controller = new AbortController();
    this.#inflight.set(request.id, controller);
    let toolName: string | undefined;
    try {
      const params = asRecord(request.params, "tools/call params");
      if (
        typeof params.name !== "string" ||
        !toolNames.has(params.name as (typeof tools)[number]["name"])
      ) {
        this.#sendError(request.id, -32_602, "Unknown tool");
        return;
      }
      toolName = params.name;
      const input = asRecord(params.arguments ?? {}, "tool arguments");
      if (emptyTools.has(params.name) && Object.keys(input).length !== 0) {
        this.#sendError(
          request.id,
          -32_602,
          "This tool does not accept arguments",
        );
        return;
      }
      if (
        params.name === "service.checkout" &&
        (Object.keys(input).length !== 1 ||
          typeof input.plan_key !== "string" ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.plan_key) ||
          input.plan_key.length > 80)
      ) {
        this.#sendError(request.id, -32_602, "Checkout Plan key is invalid");
        return;
      }

      let structuredContent: Record<string, unknown>;
      if (params.name === "service.status") {
        structuredContent = await this.#service.status();
      } else if (params.name === "service.authorize") {
        structuredContent = await this.#service.authorize();
      } else if (params.name === "service.reauthorize") {
        structuredContent = await this.#service.reauthorize();
      } else if (params.name === "service.authorization.complete") {
        this.#invalidateGenerationRoutes();
        structuredContent = await this.#service.complete(
          input,
          controller.signal,
        );
      } else if (params.name === "service.authorization.cancel") {
        structuredContent = await this.#service.cancel();
      } else if (params.name === "service.sign_out") {
        this.#invalidateGenerationRoutes();
        structuredContent = await this.#service.signOut();
      } else if (params.name === "service.checkout") {
        structuredContent = await this.#service.checkout(
          input.plan_key as string,
        );
      } else if (params.name === "image.generate") {
        structuredContent = {
          artifacts: await this.#imageGenerator.generate(
            input,
            () => this.#currentImageRoute(),
            controller.signal,
          ),
        };
      } else if (params.name === "video.generate") {
        structuredContent = {
          artifacts: await this.#videoGenerator.generate(
            input,
            () => this.#currentVideoRoute(),
            controller.signal,
          ),
        };
      } else {
        structuredContent = await this.#gateway.start();
      }
      this.#sendResult(request.id, {
        content: [{ text: "Convax service operation completed.", type: "text" }],
        structuredContent,
      } satisfies ToolResult);
    } catch (error) {
      const cancelled = controller.signal.aborted;
      console.error(
        cancelled ? "[nexus] request cancelled" : "[nexus] request failed",
      );
      this.#sendResult(request.id, {
        content: [
          {
            text: cancelled
              ? "Convax request was cancelled."
              : toolName === "image.generate"
                ? publicImageGenerationErrorMessage(error)
                : toolName === "video.generate"
                  ? publicVideoGenerationErrorMessage(error)
                : "Convax request failed.",
            type: "text",
          },
        ],
        isError: true,
      } satisfies ToolResult);
    } finally {
      this.#inflight.delete(request.id);
    }
  }

  async #listedTools() {
    try {
      const routes = await this.#loadGenerationRoutes();
      const dynamic = [];
      if (routes.image.models.length > 0) {
        dynamic.push(imageGenerationTool(generationModelChoices(routes.image.models)));
      }
      if (routes.video.models.length > 0) {
        dynamic.push(videoGenerationTool(generationModelChoices(routes.video.models)));
      }
      return [...dynamic, ...fixedTools];
    } catch {
      return tools;
    }
  }

  #loadGenerationRoutes(): Promise<NexusGenerationRoutes> {
    if (
      this.#generationRouteRequest &&
      (this.#activeGenerationRoutes === undefined ||
        (Date.now() < this.#generationRouteExpiresAt &&
          this.#activeGenerationRoutes.image.isCurrent()))
    ) {
      return this.#generationRouteRequest;
    }
    this.#invalidateGenerationRoutes();
    const epoch = this.#generationRouteEpoch;
    const request = this.#client.generationRoutes().then((routes) => {
      if (epoch !== this.#generationRouteEpoch) {
        throw new Error("Nexus generation route request was invalidated");
      }
      if (routes.image.models.length > 0) {
        imageGenerationTool(generationModelChoices(routes.image.models));
      }
      if (routes.video.models.length > 0) {
        videoGenerationTool(generationModelChoices(routes.video.models));
      }
      if (!Number.isFinite(routes.image.maximumAgeMs) || routes.image.maximumAgeMs <= 0) {
        throw new Error("Nexus generation route expires too soon");
      }
      return routes;
    });
    this.#generationRouteRequest = request;
    void request.then(
      (routes) => {
        if (
          epoch !== this.#generationRouteEpoch ||
          this.#generationRouteRequest !== request
        ) {
          return;
        }
        this.#activeGenerationRoutes = routes;
        this.#generationRouteExpiresAt =
          Date.now() + Math.min(mediaModelCatalogTtlMs, routes.image.maximumAgeMs);
      },
      () => undefined,
    );
    void request.catch(() => {
      if (this.#generationRouteRequest === request) {
        this.#invalidateGenerationRoutes();
      }
    });
    return request;
  }

  #currentImageRoute(): NexusImageRoute {
    const route = this.#activeGenerationRoutes?.image;
    if (
      !route ||
      Date.now() >= this.#generationRouteExpiresAt ||
      !route.isCurrent()
    ) {
      this.#invalidateGenerationRoutes();
      throw new Error("Nexus image models must be refreshed before generation");
    }
    return route;
  }

  #currentVideoRoute(): NexusVideoRoute {
    const route = this.#activeGenerationRoutes?.video;
    if (!route || Date.now() >= this.#generationRouteExpiresAt || !route.isCurrent()) {
      this.#invalidateGenerationRoutes();
      throw new Error("Nexus video models must be refreshed before generation");
    }
    return route;
  }

  #invalidateGenerationRoutes() {
    this.#generationRouteEpoch += 1;
    this.#activeGenerationRoutes = undefined;
    this.#generationRouteExpiresAt = 0;
    this.#generationRouteRequest = undefined;
  }

  #sendResult(id: number | string, result: unknown) {
    this.#sendValue({ id, jsonrpc: "2.0", result });
  }

  #sendError(id: number | string | null, code: number, message: string) {
    this.#sendValue({ error: { code, message }, id, jsonrpc: "2.0" });
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    for (const controller of this.#inflight.values())
      controller.abort("MCP server is closing");
    this.#authorization.cancel();
    this.#gateway.close();
    void this.#reader?.cancel().catch(() => undefined);
  }

  async shutdown(gracePeriodMs: number) {
    if (!Number.isFinite(gracePeriodMs) || gracePeriodMs <= 0)
      throw new Error("MCP shutdown grace period must be positive");
    this.close();
    if (this.#handlers.size === 0) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.allSettled([...this.#handlers]).then(() => true),
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), gracePeriodMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
