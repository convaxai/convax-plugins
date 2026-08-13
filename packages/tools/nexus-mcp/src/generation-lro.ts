import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, rm } from "node:fs/promises";
import path from "node:path";

import type { NexusVideoRoute } from "./application-client.ts";
import {
  asRecord,
  generationCallSchema,
  generationProviderParameters,
  generationLroAcknowledgementSchema,
  generationLroResultSchema,
  generationLroSnapshotSchema,
  type GenerationArtifact,
  type GenerationCall,
  type GenerationRecoveryRequest,
  type GenerationRecoverySnapshot,
  type ToolResult,
} from "./contracts.ts";
import {
  VideoOperationJournal,
  videoJournalSchema,
  type VideoJournalRecord,
} from "./video-journal.ts";

const maximumPromptBytes = 20_000;
const pollIntervalMs = 1_000;
const modelIdPattern = /^~?[A-Za-z0-9]+(?:[._/:-][A-Za-z0-9]+)*$/u;

type ResolveVideoRoute = () => NexusVideoRoute | Promise<NexusVideoRoute>;

export class NexusGenerationLro {
  readonly #workers = new Map<
    string,
    { controller: AbortController; promise: Promise<void> }
  >();

  constructor(readonly journal: VideoOperationJournal) {}

  async start(
    value: unknown,
    request: GenerationRecoveryRequest,
    resolveRoute: ResolveVideoRoute,
    signal: AbortSignal,
    submitted?: (taskId: string) => Promise<void>,
  ): Promise<ToolResult> {
    if (signal.aborted) throw abortError();
    const call = parseGenerationCall(value);
    let record = await this.journal.read(request.operationId);
    if (record && record.requestDigest !== request.requestDigest) {
      throw new Error("Nexus video operation identity conflicts");
    }
    if (!record) {
      const now = new Date().toISOString();
      record = await this.journal.create({
        createdAt: now,
        model: call.model,
        operationId: request.operationId,
        prompt: call.prompt,
        providerParameters: generationProviderParameters(call),
        requestDigest: request.requestDigest,
        schema: videoJournalSchema,
        status: "prepared",
        taskId: secureTaskHandle(),
        updatedAt: now,
      });
    } else if (
      record.model !== call.model ||
      record.prompt !== call.prompt ||
      JSON.stringify(record.providerParameters ?? {}) !==
        JSON.stringify(generationProviderParameters(call))
    ) {
      throw new Error("Nexus video operation input conflicts");
    }
    record = await this.#submitIfNeeded(record, resolveRoute, signal);
    if (record.providerTaskId) await submitted?.(record.taskId);
    this.#ensureWorker(record, resolveRoute);
    const terminal = await this.wait(request, resolveRoute, signal);
    if (terminal.status === "failed" || terminal.status === "cancelled") {
      return {
        content: [
          {
            text:
              terminal.status === "failed"
                ? terminal.error.message
                : "Convax video generation was cancelled.",
            type: "text",
          },
        ],
        isError: true,
      };
    }
    if (terminal.status !== "succeeded") {
      throw new Error("Nexus video generation detached before completion");
    }
    return {
      content: [
        {
          text: "Convax video generation completed and is ready to recover.",
          type: "text",
        },
      ],
    };
  }

  async get(
    request: GenerationRecoveryRequest,
    resolveRoute?: ResolveVideoRoute,
  ): Promise<GenerationRecoverySnapshot> {
    const record = await this.#record(request);
    if (!record) return snapshot("absent");
    if (resolveRoute) this.#ensureWorker(record, resolveRoute);
    return publicSnapshot(record);
  }

  async wait(
    request: GenerationRecoveryRequest,
    resolveRoute: ResolveVideoRoute,
    signal: AbortSignal,
  ): Promise<GenerationRecoverySnapshot> {
    if (signal.aborted) throw abortError();
    let record = await this.#record(request);
    if (!record) return snapshot("absent");
    this.#ensureWorker(record, resolveRoute);
    while (!terminal(record)) {
      await delay(250, signal);
      record = await this.#record(request);
      if (!record) return snapshot("absent");
    }
    return publicSnapshot(record);
  }

  async cancel(
    request: GenerationRecoveryRequest,
    resolveRoute: ResolveVideoRoute,
    signal: AbortSignal,
  ): Promise<GenerationRecoverySnapshot> {
    let record = await this.#record(request);
    if (!record) return snapshot("absent");
    if (terminal(record)) return publicSnapshot(record);
    this.#workers.get(record.operationId)?.controller.abort("remote-cancel");
    if (!record.providerTaskId) {
      return publicSnapshot(
        await this.#update(record, {
          status: "cancelled",
        }),
      );
    }
    const route = await resolveRoute();
    const task = await route.cancel(
      record.providerTaskId,
      record.operationId,
      signal,
    );
    record = await this.#update(record, {
      status: task.status === "cancelled" ? "cancelled" : "running",
    });
    return publicSnapshot(record);
  }

  async result(
    request: GenerationRecoveryRequest & { outputDirectory: string },
  ) {
    const record = await this.#record(request);
    if (
      !record ||
      record.status !== "succeeded" ||
      !record.result ||
      request.taskId !== record.taskId ||
      request.resultDigest !== record.result.resultDigest
    ) {
      throw new Error("Nexus video recovery result identity is invalid");
    }
    const outputDirectory = await validateOutputDirectory(
      request.outputDirectory,
    );
    const bytes = await this.journal.readResult(record);
    await materialize(
      outputDirectory,
      record.result.fileName,
      bytes,
      record.result.byteDigest,
    );
    return {
      result: recoveryToolResult(record.result.fileName),
      resultDigest: record.result.resultDigest,
      schema: generationLroResultSchema,
    };
  }

  async acknowledge(request: GenerationRecoveryRequest) {
    const record = await this.#record(request);
    if (!record) {
      return {
        acknowledged: true,
        schema: generationLroAcknowledgementSchema,
      };
    }
    if (!terminal(record)) {
      throw new Error("Nexus video operation is not terminal");
    }
    if (
      record.result &&
      request.resultDigest !== record.result.resultDigest
    ) {
      throw new Error("Nexus video acknowledgement digest is invalid");
    }
    await this.journal.remove(record);
    return {
      acknowledged: true,
      schema: generationLroAcknowledgementSchema,
    };
  }

  close() {
    for (const { controller } of this.#workers.values()) {
      controller.abort("companion-shutdown");
    }
  }

  async #submitIfNeeded(
    record: VideoJournalRecord,
    resolveRoute: ResolveVideoRoute,
    signal: AbortSignal,
  ) {
    if (record.providerTaskId || terminal(record)) return record;
    const route = await resolveRoute();
    const model = route.models.find(({ id }) => id === record.model);
    if (!model) {
      return this.#update(record, {
        error: {
          code: "model_unavailable",
          message: "The selected Nexus video model is unavailable.",
        },
        status: "failed",
      });
    }
    const task = await route.submit(
      model,
      record.prompt,
      record.providerParameters ?? {},
      record.operationId,
      record.requestDigest,
      signal,
    );
    const submittedStatus = taskStatus(task.status);
    return this.#update(record, {
      providerTaskId: task.taskId,
      status: submittedStatus === "succeeded" ? "running" : submittedStatus,
    });
  }

  #ensureWorker(
    record: VideoJournalRecord,
    resolveRoute: ResolveVideoRoute,
  ) {
    if (
      terminal(record) ||
      record.status === "prepared" ||
      this.#workers.has(record.operationId)
    ) {
      return;
    }
    const controller = new AbortController();
    const promise = this.#drive(
      record,
      resolveRoute,
      controller.signal,
    ).finally(() => {
      if (this.#workers.get(record.operationId)?.promise === promise) {
        this.#workers.delete(record.operationId);
      }
    });
    this.#workers.set(record.operationId, { controller, promise });
    void promise.catch(() => undefined);
  }

  async #drive(
    initial: VideoJournalRecord,
    resolveRoute: ResolveVideoRoute,
    signal: AbortSignal,
  ) {
    let record = initial;
    const providerTaskId = record.providerTaskId;
    if (!providerTaskId) return;
    while (!terminal(record)) {
      if (signal.aborted) return;
      try {
        const route = await resolveRoute();
        const task = await route.get(
          providerTaskId,
          record.operationId,
          signal,
        );
        const status = taskStatus(task.status);
        if (status === "succeeded" && !record.result) {
          const artifact = await route.content(
            providerTaskId,
            record.operationId,
            signal,
          );
          const stored = await this.journal.storeResult(
            record.operationId,
            record.requestDigest,
            artifact.bytes,
          );
          const fileName = `convax-${safeStem(record.operationId)}-${stored.byteDigest.slice(0, 12)}.mp4`;
          record = await this.#update(record, {
            result: {
              ...stored,
              fileName,
              resultDigest: recoveryResultDigest(fileName, stored),
            },
            status: "succeeded",
          });
        } else {
          record = await this.#update(record, {
            ...(task.error === undefined
              ? {}
              : {
                  error: {
                    code: "provider_failed",
                    message: safeFailureMessage(task.error),
                  },
                }),
            status,
          });
        }
      } catch (error) {
        if (signal.aborted) return;
        await delay(pollIntervalMs, signal).catch(() => undefined);
        continue;
      }
      if (!terminal(record)) {
        await delay(pollIntervalMs, signal).catch(() => undefined);
      }
    }
  }

  async #record(request: GenerationRecoveryRequest) {
    const record = await this.journal.read(request.operationId);
    if (!record) return null;
    if (
      record.requestDigest !== request.requestDigest ||
      (request.taskId !== undefined && request.taskId !== record.taskId) ||
      (request.resultDigest !== undefined &&
        request.resultDigest !== record.result?.resultDigest)
    ) {
      throw new Error("Nexus video recovery request identity is invalid");
    }
    return record;
  }

  async #update(
    record: VideoJournalRecord,
    update: Partial<VideoJournalRecord>,
  ) {
    const latest = await this.journal.read(record.operationId);
    if (!latest || latest.requestDigest !== record.requestDigest) {
      throw new Error("Nexus video operation identity conflicts");
    }
    if (
      latest.status === "cancelled" &&
      update.status !== undefined &&
      update.status !== "cancelled"
    ) {
      return latest;
    }
    const updated: VideoJournalRecord = {
      ...latest,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    await this.journal.write(updated);
    return updated;
  }
}

function parseGenerationCall(
  value: unknown,
): GenerationCall & { output: "video" } {
  const input = asRecord(value, "Nexus generation call");
  const providerParameters = generationProviderParameters(input);
  if (
    input.schema !== generationCallSchema ||
    input.output !== "video" ||
    !Array.isArray(input.references) ||
    input.references.length !== 0
  ) {
    throw new Error("Nexus video generation call is invalid");
  }
  const model = text(input.model, "Nexus video model", 191);
  if (!modelIdPattern.test(model)) {
    throw new Error("Nexus video model is invalid");
  }
  const prompt = text(input.prompt, "Nexus video prompt", 20_000, true);
  if (Buffer.byteLength(prompt, "utf8") > maximumPromptBytes) {
    throw new Error("Nexus video prompt is too large");
  }
  return {
    ...providerParameters,
    model,
    operation_id: text(
      input.operation_id,
      "Nexus generation operation id",
      128,
    ),
    output: "video",
    output_directory: text(
      input.output_directory,
      "Nexus generation output directory",
      4_096,
    ),
    prompt,
    references: [],
    schema: generationCallSchema,
  };
}

function publicSnapshot(
  record: VideoJournalRecord,
): GenerationRecoverySnapshot {
  if (record.status === "prepared") return snapshot("prepared");
  if (record.status === "submitted" || record.status === "running") {
    return {
      schema: generationLroSnapshotSchema,
      status: record.status,
      taskId: record.taskId,
    };
  }
  if (record.status === "succeeded" && record.result) {
    return {
      resultDigest: record.result.resultDigest,
      schema: generationLroSnapshotSchema,
      status: "succeeded",
      taskId: record.taskId,
    };
  }
  if (record.status === "failed") {
    return {
      error: record.error ?? {
        code: "provider_failed",
        message: "Nexus video generation failed.",
      },
      schema: generationLroSnapshotSchema,
      status: "failed",
      ...(record.providerTaskId === undefined ? {} : { taskId: record.taskId }),
    };
  }
  return {
    schema: generationLroSnapshotSchema,
    status: "cancelled",
    ...(record.providerTaskId === undefined ? {} : { taskId: record.taskId }),
  };
}

function snapshot(
  status: "absent" | "prepared" | "unknown",
): GenerationRecoverySnapshot {
  return { schema: generationLroSnapshotSchema, status };
}

function taskStatus(
  status:
    | "pending"
    | "queued"
    | "processing"
    | "in_progress"
    | "completed"
    | "failed"
    | "cancelled"
    | "expired",
) {
  if (status === "completed") return "succeeded" as const;
  if (status === "failed" || status === "expired") return "failed" as const;
  if (status === "cancelled") return "cancelled" as const;
  if (status === "pending" || status === "queued") return "submitted" as const;
  return "running" as const;
}

function terminal(record: VideoJournalRecord) {
  return (
    record.status === "failed" ||
    record.status === "cancelled" ||
    (record.status === "succeeded" && record.result !== undefined)
  );
}

function secureTaskHandle() {
  return `nexus_task_${randomBytes(24).toString("base64url")}`;
}

function recoveryToolResult(fileName: string): ToolResult {
  return {
    content: [
      {
        text: "Convax video generation completed.",
        type: "text",
      },
    ],
    structuredContent: {
      artifacts: [
        {
          mimeType: "video/mp4",
          name: fileName,
          path: fileName,
        } satisfies GenerationArtifact,
      ],
    },
  };
}

function recoveryResultDigest(
  fileName: string,
  stored: { byteDigest: string; size: number },
) {
  return createHash("sha256")
    .update(
      stableJson({
        artifacts: [
          {
            file: {
              relativePath: fileName,
              sha256: stored.byteDigest,
              size: stored.size,
            },
            mimeType: "video/mp4",
            name: fileName,
            path: fileName,
          },
        ],
        content: [
          {
            text: "Convax video generation completed.",
            type: "text",
          },
        ],
      }),
    )
    .digest("hex");
}

async function materialize(
  outputDirectory: string,
  fileName: string,
  bytes: Uint8Array,
  byteDigest: string,
) {
  const outputPath = path.join(outputDirectory, fileName);
  try {
    const existing = await readFile(outputPath);
    if (
      createHash("sha256").update(existing).digest("hex") !== byteDigest
    ) {
      throw new Error("Nexus video output conflicts");
    }
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const handle = await open(
    outputPath,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      (constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await rm(outputPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await handle.close();
  }
}

async function validateOutputDirectory(value: string) {
  if (
    !path.isAbsolute(value) ||
    value.includes("\0") ||
    value.length > 4_096
  ) {
    throw new Error("Nexus generation output directory is invalid");
  }
  const metadata = await lstat(value);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Nexus generation output directory is invalid");
  }
  return value;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    return `{${Object.keys(input)
      .filter((key) => input[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(input[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function safeStem(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/gu, "-").slice(0, 80);
}

function safeFailureMessage(value: string) {
  const message = value.replace(/\s+/gu, " ").trim();
  return message.length >= 1 &&
    message.length <= 512 &&
    !/(?:authorization|cookie|password|secret|api[-_ ]?key|token|bearer|https?:\/\/|(?:^|\s)\/)/iu.test(
      message,
    )
    ? message
    : "Nexus video generation failed.";
}

function text(
  value: unknown,
  label: string,
  maximum: number,
  allowWhitespace = false,
) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value.includes("\0") ||
    (!allowWhitespace && value !== value.trim())
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function delay(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError() {
  const error = new Error("Nexus generation request was cancelled");
  error.name = "AbortError";
  return error;
}
