import { createHash } from "node:crypto";
import path from "node:path";

import {
  asRecord,
  generationLroCapabilitySchema,
  generationLroRequestSchema,
  type GenerationRecoveryRequest,
  type JsonRpcRequest,
  type ToolResult,
} from "./contracts.ts";
import { NexusAuthorization } from "./authorization.ts";
import { NexusCheckoutStore } from "./checkout-store.ts";
import {
  NexusClient,
  publicNexusErrorMessage,
  type NexusClientOptions,
  type NexusAudioRoute,
  type NexusGenerationRoutes,
  type NexusImageRoute,
  type NexusVideoRoute,
} from "./application-client.ts";
import { NexusAudioGenerator } from "./audio-generator.ts";
import {
  createCredentialStore,
  type NexusCredentialStore,
} from "./credential-store.ts";
import { NexusImageGenerator } from "./image-generator.ts";
import { NexusLlmGateway } from "./llm-gateway.ts";
import { NexusPluginService } from "./plugin-service.ts";
import { productionIpv6Fetch } from "./production-network-fetch.ts";
import { NexusGenerationLro } from "./generation-lro.ts";
import { resolveNexusLocalDevelopmentEnvironment } from "./local-development-config.ts";
import { VideoOperationJournal } from "./video-journal.ts";

const protocolVersion = "2025-03-26";
const maximumRequestBytes = 4 * 1024 * 1024;
const mediaModelCatalogTtlMs = 60_000;
const generationLroCapabilityKey = "convax/generation-lro";
const generationLroMethods = {
  acknowledge: "convax/generation/operations/acknowledge",
  cancel: "convax/generation/operations/cancel",
  get: "convax/generation/operations/get",
  result: "convax/generation/operations/result",
  wait: "convax/generation/operations/wait",
} as const;
const unsafeTaskIdSegment =
  /(?:^|[._:-])(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|access[-_]?key|ak|sk)(?:[._:-]|$)/i;
const emptyInputSchema = {
  additionalProperties: false,
  properties: {},
  type: "object",
} as const;

function generationCallProperties(output: "audio" | "image" | "video") {
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

const boundedProviderToken = {
  maxLength: 32,
  minLength: 1,
  type: "string",
} as const;

const imageGenerationProperties = {
  aspect_ratio: {
    description: "Requested output aspect ratio, for example 1:1 or 16:9.",
    maxLength: 16,
    minLength: 3,
    title: "Aspect ratio",
    type: "string",
  },
  background: {
    description: "Requested image background mode.",
    enum: ["auto", "opaque", "transparent"],
    title: "Background",
    type: "string",
  },
  n: {
    description: "Number of images to generate.",
    maximum: 8,
    minimum: 1,
    title: "Images",
    type: "integer",
  },
  output_compression: {
    description: "Requested output compression from 0 to 100.",
    maximum: 100,
    minimum: 0,
    title: "Compression",
    type: "integer",
  },
  output_format: {
    description: "Requested image encoding.",
    enum: ["png", "jpeg", "webp"],
    title: "Format",
    type: "string",
  },
  quality: {
    description: "Requested image quality.",
    enum: ["auto", "low", "medium", "high"],
    title: "Quality",
    type: "string",
  },
  resolution: {
    ...boundedProviderToken,
    description: "Provider-native image resolution token.",
    title: "Resolution",
  },
  seed: {
    description: "Deterministic provider seed when supported.",
    maximum: 4_294_967_295,
    minimum: 0,
    title: "Seed",
    type: "integer",
  },
  size: {
    ...boundedProviderToken,
    description: "Provider-native image size token, for example 1024x1024.",
    title: "Size",
  },
} as const;

const videoGenerationProperties = {
  aspect_ratio: {
    description: "Requested output aspect ratio, for example 16:9 or 9:16.",
    maxLength: 16,
    minLength: 3,
    title: "Aspect ratio",
    type: "string",
  },
  duration: {
    description: "Requested video duration in seconds.",
    maximum: 60,
    minimum: 1,
    title: "Duration",
    type: "integer",
  },
  generate_audio: {
    description: "Request generated audio when the model supports it.",
    title: "Generate audio",
    type: "boolean",
  },
  resolution: {
    ...boundedProviderToken,
    description: "Provider-native video resolution token.",
    title: "Resolution",
  },
  seed: {
    description: "Deterministic provider seed when supported.",
    maximum: 4_294_967_295,
    minimum: 0,
    title: "Seed",
    type: "integer",
  },
  size: {
    ...boundedProviderToken,
    description: "Provider-native video size token, for example 1280x720.",
    title: "Size",
  },
} as const;

const audioGenerationProperties = {
  instructions: {
    description: "Provider-native voice rendering instructions.",
    maxLength: 4_096,
    minLength: 1,
    title: "Instructions",
    type: "string",
  },
  response_format: {
    description: "Requested audio encoding.",
    enum: ["mp3", "opus", "aac", "flac", "wav", "pcm"],
    title: "Format",
    type: "string",
  },
  speed: {
    description: "Requested speaking speed.",
    maximum: 4,
    minimum: 0.25,
    title: "Speed",
    type: "number",
  },
  voice: {
    ...boundedProviderToken,
    description: "Provider-native voice identifier.",
    title: "Voice",
  },
} as const;

function generationModelChoices(
  models: readonly { id: string; name: string }[],
) {
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
      additionalProperties: true,
      properties: {
        ...generationCallProperties("image"),
        ...imageGenerationProperties,
        model: modelSchema,
      },
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
    description:
      "Generate a video through Convax using the OpenRouter protocol.",
    inputSchema: {
      additionalProperties: true,
      properties: {
        ...generationCallProperties("video"),
        ...videoGenerationProperties,
        model: modelSchema,
      },
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

export function audioGenerationTool(
  models: readonly { id: string; name: string }[],
) {
  if (models.length === 0 || models.length > 64) {
    throw new Error(
      "Nexus audio model catalog is outside the bounded choice limit",
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
      "Generate audio through Convax using the OpenRouter speech protocol.",
    inputSchema: {
      additionalProperties: true,
      properties: {
        ...generationCallProperties("audio"),
        ...audioGenerationProperties,
        model: modelSchema,
      },
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
    name: "audio.generate",
  } as const;
}

const fixedTools = [
  {
    description:
      "Report the bounded Nexus Application Access, quota, Plan, and fixed OpenRouter connection status.",
    inputSchema: emptyInputSchema,
    name: "service.status",
  },
  {
    description:
      "Start AuthX Authorization Code login in the system browser with PKCE S256 and an exact loopback callback.",
    inputSchema: emptyInputSchema,
    name: "service.authorize",
  },
  {
    description:
      "Restart AuthX login without deleting the current credential until Application Access replacement succeeds.",
    inputSchema: emptyInputSchema,
    name: "service.reauthorize",
  },
  {
    description:
      "Complete AuthX login, bootstrap Nexus Application Access, and rotate this application's Inference Key.",
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
    description: "Cancel the active AuthX loopback authorization request.",
    inputSchema: emptyInputSchema,
    name: "service.authorization.cancel",
  },
  {
    description:
      "Revoke Nexus Application Access, revoke the AuthX refresh credential, and remove the Keychain item.",
    inputSchema: emptyInputSchema,
    name: "service.sign_out",
  },
  {
    description:
      "Create this application's Checkout for one server-advertised Plan.",
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
  "audio.generate",
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
  return publicNexusErrorMessage("image generation", error);
}

export function publicAudioGenerationErrorMessage(error: unknown) {
  return publicNexusErrorMessage("audio generation", error);
}

export function publicVideoGenerationErrorMessage(error: unknown) {
  return publicNexusErrorMessage("video generation", error);
}

export interface NexusMcpServerOptions {
  checkouts?: NexusCheckoutStore;
  client?: NexusClientOptions;
  credentials?: NexusCredentialStore;
  environment?: Readonly<Record<string, string | undefined>>;
  nexusClient?: NexusClient;
  send?: (value: unknown) => void;
  videoJournal?: VideoOperationJournal;
}

export class NexusMcpServer {
  readonly #authorization: NexusAuthorization;
  readonly #client: NexusClient;
  readonly #gateway: NexusLlmGateway;
  readonly #handlers = new Set<Promise<void>>();
  readonly #inflight = new Map<number | string, AbortController>();
  readonly #sendValue: (value: unknown) => void;
  readonly #service: NexusPluginService;
  readonly #audioGenerator: NexusAudioGenerator;
  readonly #imageGenerator: NexusImageGenerator;
  readonly #videoLro: NexusGenerationLro | undefined;
  readonly #recoveryBinding: Promise<string | undefined>;
  #activeGenerationRoutes: NexusGenerationRoutes | undefined;
  #generationRouteEpoch = 0;
  #generationRouteExpiresAt = 0;
  #generationRouteRequest: Promise<NexusGenerationRoutes> | undefined;
  #closed = false;
  #reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  constructor(options: NexusMcpServerOptions = {}) {
    const environment = resolveNexusLocalDevelopmentEnvironment(
      options.environment,
    );
    const credentials =
      options.credentials ?? createCredentialStore(environment);
    const client =
      options.nexusClient ??
      new NexusClient(
        credentials,
        options.client ?? clientOptionsFromEnvironment(environment),
      );
    const checkouts = options.checkouts ?? new NexusCheckoutStore(environment);
    this.#authorization = new NexusAuthorization(client);
    this.#client = client;
    this.#service = new NexusPluginService(
      this.#authorization,
      client,
      credentials,
      checkouts,
    );
    this.#gateway = new NexusLlmGateway(client);
    this.#audioGenerator = new NexusAudioGenerator();
    this.#imageGenerator = new NexusImageGenerator();
    let videoJournal = options.videoJournal;
    if (!videoJournal) {
      try {
        videoJournal = new VideoOperationJournal(environment);
      } catch {
        videoJournal = undefined;
      }
    }
    this.#videoLro = videoJournal
      ? new NexusGenerationLro(videoJournal)
      : undefined;
    this.#recoveryBinding = recoveryBinding(credentials, videoJournal);
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
      const recoveryBinding = await this.#recoveryBinding;
      this.#sendResult(value.id, {
        capabilities: {
          ...(recoveryBinding === undefined
            ? {}
            : {
                experimental: {
                  [generationLroCapabilityKey]: {
                    binding: recoveryBinding,
                    mode: "long-running-operation",
                    schema: generationLroCapabilitySchema,
                  },
                },
              }),
          tools: {},
        },
        protocolVersion,
        serverInfo: { name: "convax-nexus-mcp", version: "1.0.4" },
      });
      return;
    }
    if (
      Object.values(generationLroMethods).includes(
        value.method as (typeof generationLroMethods)[keyof typeof generationLroMethods],
      )
    ) {
      await this.#handleOperation({ ...value, id: value.id });
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
      } else if (params.name === "audio.generate") {
        structuredContent = {
          artifacts: await this.#audioGenerator.generate(
            input,
            () => this.#currentAudioRoute(),
            controller.signal,
          ),
        };
      } else if (params.name === "image.generate") {
        structuredContent = {
          artifacts: await this.#imageGenerator.generate(
            input,
            () => this.#currentImageRoute(),
            controller.signal,
          ),
        };
      } else if (params.name === "video.generate") {
        if (!this.#videoLro || (await this.#recoveryBinding) === undefined) {
          throw new Error("Nexus video recovery authority is unavailable");
        }
        const generation = parseGenerationOperationMeta(params._meta);
        const result = await this.#videoLro.start(
          input,
          generation.request,
          () => this.#currentVideoRoute(),
          controller.signal,
          generation.progressToken === undefined
            ? undefined
            : async (taskId) => {
                this.#sendValue({
                  jsonrpc: "2.0",
                  method: "notifications/convax/generation-lifecycle",
                  params: {
                    event: "submitted",
                    progressToken: generation.progressToken,
                    schema: "convax.generation-lifecycle/1",
                    taskId,
                  },
                });
              },
        );
        this.#sendResult(request.id, result);
        return;
      } else {
        structuredContent = await this.#gateway.start();
      }
      this.#sendResult(request.id, {
        content: [
          { text: "Convax service operation completed.", type: "text" },
        ],
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
              : toolName === "audio.generate"
                ? publicAudioGenerationErrorMessage(error)
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

  async #handleOperation(request: JsonRpcRequest & { id: number | string }) {
    const controller = new AbortController();
    this.#inflight.set(request.id, controller);
    try {
      if (!this.#videoLro || (await this.#recoveryBinding) === undefined) {
        this.#sendError(request.id, -32_601, "Method not found");
        return;
      }
      const input = parseOperationParams(
        request.params,
        request.method === generationLroMethods.result,
      );
      let result: Record<string, unknown>;
      if (request.method === generationLroMethods.get) {
        result = await this.#videoLro.get(input);
      } else if (request.method === generationLroMethods.wait) {
        result = await this.#videoLro.wait(
          input,
          () => this.#recoveryVideoRoute(),
          controller.signal,
        );
      } else if (request.method === generationLroMethods.cancel) {
        result = await this.#videoLro.cancel(
          input,
          () => this.#recoveryVideoRoute(),
          controller.signal,
        );
      } else if (request.method === generationLroMethods.result) {
        result = await this.#videoLro.result({
          ...input,
          outputDirectory: input.outputDirectory!,
        });
      } else {
        result = await this.#videoLro.acknowledge(input);
      }
      this.#sendResult(request.id, result);
    } catch (error) {
      console.error(
        controller.signal.aborted
          ? "[nexus] operation request cancelled"
          : "[nexus] operation request failed",
      );
      this.#sendError(
        request.id,
        controller.signal.aborted ? -32_800 : -32_602,
        controller.signal.aborted
          ? "Operation request was cancelled"
          : publicVideoGenerationErrorMessage(error),
      );
    } finally {
      this.#inflight.delete(request.id);
    }
  }

  async #listedTools() {
    try {
      const routes = await this.#loadGenerationRoutes();
      const dynamic = [];
      if (routes.audio.models.length > 0) {
        dynamic.push(
          audioGenerationTool(generationModelChoices(routes.audio.models)),
        );
      }
      if (routes.image.models.length > 0) {
        dynamic.push(
          imageGenerationTool(generationModelChoices(routes.image.models)),
        );
      }
      if (
        routes.video.models.length > 0 &&
        (await this.#recoveryBinding) !== undefined
      ) {
        dynamic.push(
          videoGenerationTool(generationModelChoices(routes.video.models)),
        );
      }
      return [...dynamic, ...fixedTools];
    } catch (error) {
      console.error(publicNexusErrorMessage("model catalog", error));
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
      if (routes.audio.models.length > 0) {
        audioGenerationTool(generationModelChoices(routes.audio.models));
      }
      if (routes.image.models.length > 0) {
        imageGenerationTool(generationModelChoices(routes.image.models));
      }
      if (routes.video.models.length > 0) {
        videoGenerationTool(generationModelChoices(routes.video.models));
      }
      if (
        !Number.isFinite(routes.image.maximumAgeMs) ||
        routes.image.maximumAgeMs <= 0
      ) {
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
          Date.now() +
          Math.min(mediaModelCatalogTtlMs, routes.image.maximumAgeMs);
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

  #currentAudioRoute(): NexusAudioRoute {
    const route = this.#activeGenerationRoutes?.audio;
    if (
      !route ||
      Date.now() >= this.#generationRouteExpiresAt ||
      !route.isCurrent()
    ) {
      this.#invalidateGenerationRoutes();
      throw new Error("Nexus audio models must be refreshed before generation");
    }
    return route;
  }

  #currentVideoRoute(): NexusVideoRoute {
    const route = this.#activeGenerationRoutes?.video;
    if (
      !route ||
      Date.now() >= this.#generationRouteExpiresAt ||
      !route.isCurrent()
    ) {
      this.#invalidateGenerationRoutes();
      throw new Error("Nexus video models must be refreshed before generation");
    }
    return route;
  }

  async #recoveryVideoRoute(): Promise<NexusVideoRoute> {
    return this.#client.videoRoute();
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
    this.#videoLro?.close();
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

function clientOptionsFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): NexusClientOptions {
  const nexusOrigin = environment.CONVAX_NEXUS_ORIGIN;
  const gatewayOrigin = environment.CONVAX_NEXUS_GATEWAY_ORIGIN;
  const localDevelopment = environment.CONVAX_NEXUS_LOCAL_DEVELOPMENT === "1";
  if (!localDevelopment) {
    if (
      environment.CONVAX_AUTHX_PUBLIC_CLIENT_PROFILE !== undefined ||
      nexusOrigin !== undefined ||
      gatewayOrigin !== undefined
    ) {
      throw new Error(
        "Local AuthX and Nexus configuration requires CONVAX_NEXUS_LOCAL_DEVELOPMENT=1",
      );
    }
    return { environment, fetch: productionIpv6Fetch };
  }
  if (
    !environment.CONVAX_AUTHX_PUBLIC_CLIENT_PROFILE ||
    !nexusOrigin ||
    !gatewayOrigin
  ) {
    throw new Error(
      "Local AuthX profile, Nexus origin, and Gateway origin must be configured",
    );
  }
  return {
    environment,
    gatewayOrigins: [gatewayOrigin],
    nexusOrigin,
  };
}

function parseOperationParams(value: unknown, acceptsOutputDirectory: boolean) {
  const input = asRecord(value, "operation params");
  const allowed = [
    "operationId",
    "outputDirectory",
    "requestDigest",
    "resultDigest",
    "schema",
    "taskId",
  ];
  if (
    Object.keys(input).some((key) => !allowed.includes(key)) ||
    input.schema !== generationLroRequestSchema ||
    typeof input.operationId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(input.operationId) ||
    typeof input.requestDigest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(input.requestDigest) ||
    (input.taskId !== undefined &&
      (typeof input.taskId !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u.test(input.taskId) ||
        unsafeTaskIdSegment.test(input.taskId))) ||
    (input.resultDigest !== undefined &&
      (typeof input.resultDigest !== "string" ||
        !/^[a-f0-9]{64}$/u.test(input.resultDigest))) ||
    (acceptsOutputDirectory && typeof input.outputDirectory !== "string") ||
    (input.outputDirectory !== undefined &&
      (!acceptsOutputDirectory ||
        typeof input.outputDirectory !== "string" ||
        !path.isAbsolute(input.outputDirectory) ||
        input.outputDirectory.includes("\0") ||
        input.outputDirectory.length > 4_096))
  ) {
    throw new Error("Generation operation params are invalid");
  }
  return {
    operationId: input.operationId,
    ...(input.outputDirectory === undefined
      ? {}
      : { outputDirectory: input.outputDirectory }),
    requestDigest: input.requestDigest,
    schema: generationLroRequestSchema,
    ...(input.resultDigest === undefined
      ? {}
      : { resultDigest: input.resultDigest }),
    ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
  } satisfies GenerationRecoveryRequest;
}

function parseGenerationOperationMeta(value: unknown) {
  const meta = asRecord(value, "generation call metadata");
  const operation = asRecord(
    meta.convaxGeneration,
    "Convax generation operation metadata",
  );
  if (
    Object.keys(meta).some(
      (key) => !["convaxGeneration", "progressToken"].includes(key),
    ) ||
    Object.keys(operation).length !== 4 ||
    operation.schema !== "convax.generation-operation/1" ||
    operation.recovery !== "required" ||
    typeof operation.operationId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(operation.operationId) ||
    typeof operation.requestDigest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(operation.requestDigest) ||
    (meta.progressToken !== undefined &&
      (typeof meta.progressToken !== "string" ||
        meta.progressToken.length < 1 ||
        meta.progressToken.length > 512 ||
        meta.progressToken.includes("\0")))
  ) {
    throw new Error("Convax generation operation metadata is invalid");
  }
  return {
    ...(meta.progressToken === undefined
      ? {}
      : { progressToken: meta.progressToken }),
    request: {
      operationId: operation.operationId,
      requestDigest: operation.requestDigest,
      schema: generationLroRequestSchema,
    } satisfies GenerationRecoveryRequest,
  };
}

async function recoveryBinding(
  credentials: NexusCredentialStore,
  journal: VideoOperationJournal | undefined,
) {
  if (!journal) return undefined;
  const stored = await credentials.read();
  if (!stored) return undefined;
  const authority = await journal.authority();
  return `nexus.${createHash("sha256")
    .update(
      JSON.stringify({
        accountBinding: stored.accountBinding,
        authxIssuer: stored.authxIssuer,
        journalAuthority: authority,
        nexusOrigin: stored.nexusOrigin,
      }),
    )
    .digest("hex")}`;
}
