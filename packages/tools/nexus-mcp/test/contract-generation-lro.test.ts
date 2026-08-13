import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  NexusGenerationRoutes,
  NexusVideoRoute,
} from "../src/application-client.ts";
import { MemoryCredentialStore } from "../src/credential-store.ts";
import type { GenerationProviderParameters } from "../src/contracts.ts";
import { NexusGenerationLro } from "../src/generation-lro.ts";
import { NexusMcpServer } from "../src/mcp-server.ts";
import {
  VideoOperationJournal,
  videoJournalSchema,
  type VideoJournalRecord,
} from "../src/video-journal.ts";

const roots: string[] = [];
const mp4 = Uint8Array.from([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
]);

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("Convax Host exact generation LRO", () => {
  test("defaults prompt-only video requests to one second without filtering provider parameters", async () => {
    const fixture = await createFixture();
    const engine = new NexusGenerationLro(fixture.journal);
    let submittedParameters: GenerationProviderParameters | undefined;
    const call = generationCall(fixture.firstOutput);
    delete (call as Partial<typeof call>).duration;

    await engine.start(
      call,
      request("operation-default-duration", "d".repeat(64)),
      () =>
        completedRoute({
          async submit(_model, _prompt, providerParameters) {
            submittedParameters = providerParameters;
            return {
              status: "completed",
              taskId: "provider-task-default-duration",
            };
          },
        }),
      new AbortController().signal,
    );

    expect(submittedParameters).toEqual({
      aspect_ratio: "16:9",
      duration: 1,
      generate_audio: true,
      seed: 123,
    });
    expect(
      (await fixture.journal.read("operation-default-duration"))
        ?.providerParameters,
    ).toEqual(submittedParameters);
    engine.close();
  });

  test("serves initialize plus all five exact JSON-RPC methods across restart", async () => {
    const fixture = await createFixture();
    const engine = new NexusGenerationLro(fixture.journal);
    await engine.start(
      generationCall(fixture.firstOutput),
      request("operation-complete", "a".repeat(64)),
      () =>
        completedRoute({
          async submit() {
            return {
              status: "completed",
              taskId: "provider-task-complete",
            };
          },
        }),
      new AbortController().signal,
    );
    engine.close();
    const now = new Date().toISOString();
    await fixture.journal.create({
      createdAt: now,
      model: "fake/video-v1",
      operationId: "operation-cancel",
      prompt: "Cancel this accepted operation.",
      providerTaskId: "provider-task-cancel",
      requestDigest: "b".repeat(64),
      schema: videoJournalSchema,
      status: "running",
      taskId: "nexus_task_cancel_safe",
      updatedAt: now,
    });

    const credentials = new MemoryCredentialStore();
    await credentials.write({
      accountBinding: "a".repeat(64),
      authxIssuer: "http://127.0.0.1:8101",
      bindingId: "binding-fixed",
      gatewayBaseUrl:
        "http://127.0.0.1:4100/api/v1/gateway/providers/provider-fixed",
      inferenceKey: "nxs_test_inference_key_with_sufficient_length",
      nexusOrigin: "http://127.0.0.1:3000",
      providerConnectionId: "provider-fixed",
      refreshToken: "authx_rotating_refresh_with_sufficient_length",
      schema: "convax.nexus-application-credentials/1",
    });
    let cancels = 0;
    const route = completedRoute({
      async cancel(taskId) {
        cancels += 1;
        return { status: "cancelled", taskId };
      },
    });
    const fakeClient = {
      async generationRoutes(): Promise<NexusGenerationRoutes> {
        return {
          audio: {
            async complete() {
              return {
                bytes: Uint8Array.from([0x49, 0x44, 0x33, 4]),
                mimeType: "audio/mpeg" as const,
              };
            },
            isCurrent: () => true,
            maximumAgeMs: 60_000,
            models: [
              {
                id: "fake/audio-v1",
                name: "Fake Audio",
                outputModalities: ["audio", "speech"],
              },
            ],
          },
          image: {
            async complete() {
              return {};
            },
            isCurrent: () => true,
            maximumAgeMs: 60_000,
            models: [
              {
                id: "fake/image-v1",
                name: "Fake Image",
                outputModalities: ["image"],
              },
            ],
          },
          video: route,
        };
      },
      async videoRoute() {
        return route;
      },
    };
    const responses: Array<{
      error?: { code: number; message: string };
      id?: number;
      result?: unknown;
    }> = [];
    const harness = await rpcHarness(
      new NexusMcpServer({
        credentials,
        environment: fixture.environment,
        nexusClient: fakeClient as never,
        send: (value) => responses.push(value as never),
        videoJournal: new VideoOperationJournal(fixture.environment),
      }),
      responses,
    );

    const initialized = await harness.request(1, "initialize", {
      protocolVersion: "2025-03-26",
    });
    const capability = (
      initialized.result as {
        capabilities: {
          experimental: Record<string, Record<string, unknown>>;
        };
      }
    ).capabilities.experimental["convax/generation-lro"];
    expect(capability).toMatchObject({
      mode: "long-running-operation",
      schema: "convax.generation-lro/1",
    });
    expect(capability?.binding).toMatch(/^nexus\.[a-f0-9]{64}$/u);
    const initialBinding = capability?.binding as string;
    const listed = await harness.request(8, "tools/list", {});
    const listedTools = (listed.result as { tools: Array<Record<string, any>> })
      .tools;
    expect(
      listedTools.find(({ name }) => name === "audio.generate")?.inputSchema,
    ).toMatchObject({
      additionalProperties: true,
      properties: {
        instructions: { maxLength: 4_096, type: "string" },
        response_format: { enum: ["mp3", "opus", "aac", "flac", "wav", "pcm"] },
        speed: { maximum: 4, minimum: 0.25, type: "number" },
        voice: { type: "string" },
      },
    });
    expect(
      listedTools.find(({ name }) => name === "image.generate")?.inputSchema
        .additionalProperties,
    ).toBeTrue();
    expect(
      listedTools.find(({ name }) => name === "image.generate")?.inputSchema
        .properties,
    ).toMatchObject({
      aspect_ratio: { type: "string" },
      n: { maximum: 8, minimum: 1, type: "integer" },
      output_format: { enum: ["png", "jpeg", "webp"] },
      seed: { type: "integer" },
    });
    expect(
      listedTools.find(({ name }) => name === "video.generate")?.inputSchema
        .properties,
    ).toMatchObject({
      aspect_ratio: { type: "string" },
      duration: { maximum: 60, minimum: 1, type: "integer" },
      generate_audio: { type: "boolean" },
      seed: { type: "integer" },
    });
    expect(
      listedTools.find(({ name }) => name === "image.generate")?.inputSchema
        .properties.aspect_ratio.pattern,
    ).toBeUndefined();
    expect(
      listedTools.find(({ name }) => name === "video.generate")?.inputSchema
        .properties.size.pattern,
    ).toBeUndefined();
    expect(
      (
        await harness.request(9, "tools/call", {
          _meta: {
            convaxGeneration: {
              operationId: "operation-from-host-meta",
              recovery: "required",
              requestDigest: "e".repeat(64),
              schema: "convax.generation-operation/1",
            },
            progressToken: "convax-generation-progress-safe",
          },
          arguments: generationCall(fixture.firstOutput),
          name: "video.generate",
        })
      ).result,
    ).toMatchObject({
      content: [
        {
          text: "Convax video generation completed and is ready to recover.",
          type: "text",
        },
      ],
    });
    const metaRecord = await fixture.journal.read("operation-from-host-meta");
    expect(metaRecord).toMatchObject({
      operationId: "operation-from-host-meta",
      providerTaskId: "provider-task-complete",
      requestDigest: "e".repeat(64),
      status: "succeeded",
      providerParameters: {
        aspect_ratio: "16:9",
        duration: 5,
        generate_audio: true,
        seed: 123,
      },
    });
    expect(metaRecord?.taskId).not.toBe(metaRecord?.providerTaskId);
    expect(JSON.stringify(metaRecord)).not.toContain(fixture.firstOutput);
    expect(
      (responses as Array<Record<string, unknown>>).find(
        (entry) => entry.method === "notifications/convax/generation-lifecycle",
      ),
    ).toMatchObject({
      params: {
        event: "submitted",
        progressToken: "convax-generation-progress-safe",
        schema: "convax.generation-lifecycle/1",
        taskId: metaRecord!.taskId,
      },
    });

    const complete = await fixture.journal.read("operation-complete");
    expect(complete?.result).toBeDefined();
    const completeRequest = {
      operationId: "operation-complete",
      requestDigest: "a".repeat(64),
      schema: "convax.generation-lro-request/1",
      taskId: complete!.taskId,
    };
    expect(
      (
        await harness.request(
          2,
          "convax/generation/operations/get",
          completeRequest,
        )
      ).result,
    ).toEqual({
      resultDigest: complete!.result!.resultDigest,
      schema: "convax.generation-lro-snapshot/1",
      status: "succeeded",
      taskId: complete!.taskId,
    });
    expect(
      (
        await harness.request(
          3,
          "convax/generation/operations/wait",
          completeRequest,
        )
      ).result,
    ).toMatchObject({ status: "succeeded", taskId: complete!.taskId });

    const replayOne = path.join(fixture.root, "replay-one");
    const replayTwo = path.join(fixture.root, "replay-two");
    await Promise.all([fs.mkdir(replayOne), fs.mkdir(replayTwo)]);
    const resultRequest = {
      ...completeRequest,
      outputDirectory: replayOne,
      resultDigest: complete!.result!.resultDigest,
    };
    const firstResult = await harness.request(
      4,
      "convax/generation/operations/result",
      resultRequest,
    );
    const secondResult = await harness.request(
      5,
      "convax/generation/operations/result",
      { ...resultRequest, outputDirectory: replayTwo },
    );
    expect(firstResult.result).toEqual(secondResult.result);
    expect(firstResult.result).toMatchObject({
      resultDigest: complete!.result!.resultDigest,
      schema: "convax.generation-lro-result/1",
    });
    expect(
      await fs.readFile(path.join(replayOne, complete!.result!.fileName)),
    ).toEqual(Buffer.from(mp4));
    expect(
      await fs.readFile(path.join(replayTwo, complete!.result!.fileName)),
    ).toEqual(Buffer.from(mp4));

    expect(
      (
        await harness.request(6, "convax/generation/operations/cancel", {
          operationId: "operation-cancel",
          requestDigest: "b".repeat(64),
          schema: "convax.generation-lro-request/1",
          taskId: "nexus_task_cancel_safe",
        })
      ).result,
    ).toEqual({
      schema: "convax.generation-lro-snapshot/1",
      status: "cancelled",
      taskId: "nexus_task_cancel_safe",
    });
    expect(cancels).toBe(1);

    expect(
      (
        await harness.request(7, "convax/generation/operations/acknowledge", {
          ...completeRequest,
          resultDigest: complete!.result!.resultDigest,
        })
      ).result,
    ).toEqual({
      acknowledged: true,
      schema: "convax.generation-lro-acknowledgement/1",
    });
    expect(await fixture.journal.read("operation-complete")).toBeNull();
    await expect(
      fs.stat(
        path.join(fixture.journal.directory, complete!.result!.storedFile),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });

    await harness.close();
    const restartedResponses: Array<{
      error?: { code: number; message: string };
      id?: number;
      result?: unknown;
    }> = [];
    const restartedHarness = await rpcHarness(
      new NexusMcpServer({
        credentials,
        environment: fixture.environment,
        nexusClient: fakeClient as never,
        send: (value) => restartedResponses.push(value as never),
        videoJournal: new VideoOperationJournal(fixture.environment),
      }),
      restartedResponses,
    );
    const restartedInitialize = await restartedHarness.request(
      10,
      "initialize",
      { protocolVersion: "2025-03-26" },
    );
    expect(
      (
        restartedInitialize.result as {
          capabilities: {
            experimental: Record<string, { binding: string }>;
          };
        }
      ).capabilities.experimental["convax/generation-lro"]?.binding,
    ).toBe(initialBinding);
    await restartedHarness.close();
  });

  test("detaches caller deadlines, resumes after restart, and preserves one provider task", async () => {
    const fixture = await createFixture();
    let releasePoll!: () => void;
    const pollGate = new Promise<void>((resolve) => {
      releasePoll = resolve;
    });
    let submits = 0;
    const providerTasks = new Map<string, string>();
    const route = completedRoute({
      async get(taskId) {
        await pollGate;
        return { status: "completed", taskId };
      },
      async submit(_model, _prompt, operationId, requestDigest) {
        submits += 1;
        const key = `${operationId}:${requestDigest}`;
        const taskId = providerTasks.get(key) ?? "provider-task-idempotent";
        providerTasks.set(key, taskId);
        return { status: "queued", taskId };
      },
    });
    const first = new NexusGenerationLro(fixture.journal);
    const controller = new AbortController();
    const started = first.start(
      generationCall(fixture.firstOutput),
      request("operation-restart", "c".repeat(64)),
      () => route,
      controller.signal,
    );
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if ((await fixture.journal.read("operation-restart"))?.providerTaskId) {
        break;
      }
      await Bun.sleep(5);
    }
    controller.abort("host-deadline");
    await expect(started).rejects.toMatchObject({ name: "AbortError" });
    expect((await fixture.journal.read("operation-restart"))?.status).not.toBe(
      "cancelled",
    );
    first.close();

    releasePoll();
    const restarted = new NexusGenerationLro(
      new VideoOperationJournal(fixture.environment),
    );
    const completed = await restarted.wait(
      request("operation-restart", "c".repeat(64)),
      () => route,
      new AbortController().signal,
    );
    expect(completed).toMatchObject({
      schema: "convax.generation-lro-snapshot/1",
      status: "succeeded",
    });
    expect(submits).toBe(1);
    expect(new Set(providerTasks.values())).toEqual(
      new Set(["provider-task-idempotent"]),
    );
    restarted.close();
  });

  test("retries an ambiguous accepted submit with the same provider idempotency identity", async () => {
    const fixture = await createFixture();
    class FailingReceiptJournal extends VideoOperationJournal {
      failed = false;

      override async write(record: VideoJournalRecord) {
        if (!this.failed && record.providerTaskId) {
          this.failed = true;
          throw new Error("simulated crash before receipt persistence");
        }
        return super.write(record);
      }
    }
    const failingJournal = new FailingReceiptJournal(fixture.environment);
    let submits = 0;
    const taskByIdentity = new Map<string, string>();
    const route = completedRoute({
      async submit(_model, _prompt, operationId, requestDigest) {
        submits += 1;
        const identity = `${operationId}:${requestDigest}`;
        const taskId =
          taskByIdentity.get(identity) ?? "provider-task-same-receipt";
        taskByIdentity.set(identity, taskId);
        return { status: "queued", taskId };
      },
    });
    const first = new NexusGenerationLro(failingJournal);
    await expect(
      first.start(
        generationCall(fixture.firstOutput),
        request("operation-crash-window", "d".repeat(64)),
        () => route,
        new AbortController().signal,
      ),
    ).rejects.toThrow("simulated crash");
    first.close();

    const restarted = new NexusGenerationLro(
      new VideoOperationJournal(fixture.environment),
    );
    await restarted.start(
      generationCall(fixture.firstOutput),
      request("operation-crash-window", "d".repeat(64)),
      () => route,
      new AbortController().signal,
    );
    const record = await fixture.journal.read("operation-crash-window");
    expect(record?.providerTaskId).toBe("provider-task-same-receipt");
    expect(submits).toBe(2);
    expect(taskByIdentity.size).toBe(1);
    restarted.close();
  });
});

async function createFixture() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "convax-nexus-lro-contract-"),
  );
  roots.push(root);
  const directory = path.join(root, "lro");
  const firstOutput = path.join(root, "first-output");
  await Promise.all([
    fs.mkdir(directory, { mode: 0o700 }),
    fs.mkdir(firstOutput, { mode: 0o700 }),
  ]);
  const environment = { CONVAX_GENERATION_LRO_DIRECTORY: directory };
  return {
    environment,
    firstOutput,
    journal: new VideoOperationJournal(environment),
    root,
  };
}

function completedRoute(
  overrides: Partial<NexusVideoRoute> = {},
): NexusVideoRoute {
  return {
    async cancel(taskId) {
      return { status: "cancelled", taskId };
    },
    async content() {
      return { bytes: mp4, mimeType: "video/mp4" };
    },
    async get(taskId) {
      return { status: "completed", taskId };
    },
    isCurrent: () => true,
    maximumAgeMs: 60_000,
    models: [
      {
        id: "fake/video-v1",
        name: "Fake Video",
        outputModalities: ["video"],
      },
    ],
    async submit() {
      return { status: "queued", taskId: "provider-task-complete" };
    },
    ...overrides,
  };
}

function generationCall(outputDirectory: string) {
  return {
    aspect_ratio: "16:9",
    duration: 5,
    generate_audio: true,
    model: "fake/video-v1",
    operation_id: "provider-correlation-only",
    output: "video",
    output_directory: outputDirectory,
    prompt: "A deterministic paper boat.",
    references: [],
    schema: "convax.generation-call/1",
    seed: 123,
  };
}

function request(operationId: string, requestDigest: string) {
  return {
    operationId,
    requestDigest,
    schema: "convax.generation-lro-request/1",
  } as const;
}

async function rpcHarness(
  server: NexusMcpServer,
  responses: Array<{
    error?: { code: number; message: string };
    id?: number;
    result?: unknown;
  }>,
) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  const running = server.run(stream);
  return {
    async close() {
      await server.shutdown(1_000);
      await running;
    },
    async request(
      id: number,
      method: string,
      params?: Record<string, unknown>,
    ) {
      controller.enqueue(
        new TextEncoder().encode(
          `${JSON.stringify({
            id,
            jsonrpc: "2.0",
            method,
            ...(params === undefined ? {} : { params }),
          })}\n`,
        ),
      );
      for (let attempt = 0; attempt < 1_000; attempt += 1) {
        const response = responses.find((entry) => entry.id === id);
        if (response) {
          if (response.error) throw new Error(response.error.message);
          return response as { result: unknown };
        }
        await Bun.sleep(2);
      }
      throw new Error(`JSON-RPC request ${id} timed out`);
    },
  };
}
