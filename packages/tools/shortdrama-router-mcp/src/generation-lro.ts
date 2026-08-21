import { createHash, randomBytes } from "node:crypto"
import path from "node:path"

import { RouterError } from "shortdrama-router"

import {
  abortError,
  asRecord,
  generationLroSnapshotSchema,
  isAbortError,
  type GenerationKind,
  type GenerationRecoveryRequest,
  type GenerationRecoverySnapshot,
  type ProviderId,
  type RouterPort,
  type ToolResult,
} from "./contracts.ts"
import {
  GenerationSubmissionError,
  OperationConflictError,
  TerminalGenerationError,
  type GenerationEngine,
} from "./generation.ts"
import {
  generationJournalSchema,
  generationToolResult,
  GenerationOperationJournal,
  recoveryAcknowledgement,
  recoveryResultEnvelope,
  type GenerationJournalRecord,
} from "./generation-journal.ts"

const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u
const digestPattern = /^[a-f0-9]{64}$/u

export class ShortDramaGenerationLro {
  constructor(
    readonly provider: ProviderId,
    readonly engine: GenerationEngine,
    readonly router: RouterPort,
    readonly journal: GenerationOperationJournal,
  ) {}

  binding() {
    return this.journal.binding()
  }

  async start(
    kind: GenerationKind,
    value: unknown,
    request: GenerationRecoveryRequest,
    signal: AbortSignal,
    submitted?: (taskId: string) => void,
  ): Promise<ToolResult> {
    if (signal.aborted) throw abortError()
    const { call, fingerprint } = normalizedCall(value, kind, request.operationId)
    let record = await this.journal.read(request.operationId)
    if (!record) {
      const now = new Date().toISOString()
      record = await this.journal.create({
        call,
        callFingerprint: fingerprint,
        createdAt: now,
        kind,
        operationId: request.operationId,
        provider: this.provider,
        requestDigest: request.requestDigest,
        schema: generationJournalSchema,
        status: "prepared",
        taskId: secureTaskId(),
        updatedAt: now,
      })
    } else {
      this.#assertRequest(record, request)
      if (record.callFingerprint !== fingerprint || record.kind !== kind) {
        throw new OperationConflictError(
          "Generation operation id was reused with different input",
        )
      }
    }
    const terminal = await this.#drive(record, signal, submitted)
    if (terminal.status === "failed" || terminal.status === "cancelled") {
      return {
        content: [
          {
            text: terminal.status === "cancelled"
              ? "Generation was cancelled by the provider."
              : terminal.error.message,
            type: "text",
          },
        ],
        isError: true,
      }
    }
    if (terminal.status !== "succeeded") {
      throw new Error("Generation detached before reaching a terminal state")
    }
    return {
      content: [
        {
          text: "Generation completed and is ready to recover.",
          type: "text",
        },
      ],
    }
  }

  async get(request: GenerationRecoveryRequest) {
    const record = await this.#record(request)
    return record ? publicSnapshot(record) : snapshot("absent")
  }

  async wait(request: GenerationRecoveryRequest, signal: AbortSignal) {
    if (signal.aborted) throw abortError()
    const record = await this.#record(request)
    if (!record) return snapshot("absent")
    if (terminal(record)) return publicSnapshot(record)
    return this.#drive(record, signal)
  }

  async cancel(request: GenerationRecoveryRequest, signal: AbortSignal) {
    let record = await this.#record(request)
    if (!record) return snapshot("absent")
    if (terminal(record)) return publicSnapshot(record)
    if (!record.jobId) {
      record = await this.#update(record, { status: "unknown" })
      return publicSnapshot(record)
    }
    try {
      const job = record.kind === "audio"
        ? await this.router.cancelAudio(record.jobId, signal)
        : record.kind === "image"
          ? await this.router.cancelImage(record.jobId, signal)
          : await this.router.cancelVideo(record.jobId, signal)
      if (job.status === "cancelled") {
        record = await this.#update(record, { status: "cancelled" })
      }
    } catch (error) {
      if (signal.aborted || isAbortError(error)) throw abortError()
      if (
        error instanceof RouterError
        && (error.code === "cancellation_unsupported"
          || error.code === "job_not_cancellable")
      ) {
        return publicSnapshot(record)
      }
      throw error
    }
    return publicSnapshot(record)
  }

  async result(
    request: GenerationRecoveryRequest & { outputDirectory: string },
  ) {
    const record = await this.#record(request)
    if (
      !record
      || record.status !== "succeeded"
      || !record.result
      || request.taskId !== record.taskId
      || request.resultDigest !== record.result.resultDigest
    ) {
      throw new Error("Generation recovery result identity is invalid")
    }
    const result = await this.journal.materialize(
      record,
      request.outputDirectory,
    )
    return recoveryResultEnvelope(result, record.result.resultDigest)
  }

  async acknowledge(request: GenerationRecoveryRequest) {
    const record = await this.#record(request)
    if (!record) return recoveryAcknowledgement()
    if (!terminal(record)) {
      throw new Error("Generation recovery operation is not terminal")
    }
    if (
      record.result
      && request.resultDigest !== record.result.resultDigest
    ) {
      throw new Error("Generation recovery acknowledgement digest is invalid")
    }
    await this.journal.remove(record)
    return recoveryAcknowledgement()
  }

  async #drive(
    initial: GenerationJournalRecord,
    signal: AbortSignal,
    submitted?: (taskId: string) => void,
  ): Promise<GenerationRecoverySnapshot> {
    let record = initial
    if (terminal(record)) return publicSnapshot(record)
    const outputDirectory = this.journal.artifactDirectory(record.operationId)
    try {
      const artifacts = record.jobId
        ? await this.engine.resume(
            record.kind,
            record.jobId,
            outputDirectory,
            record.operationId,
            signal,
          )
        : await this.engine.generate(
            record.kind,
            {
              ...record.call,
              output_directory: outputDirectory,
            },
            signal,
            {
              onSubmitted: async (job) => {
                record = await this.#update(record, {
                  jobId: job.id,
                  status: job.status === "in_progress" ? "running" : "submitted",
                })
                submitted?.(record.taskId)
              },
            },
          )
      if (!record.jobId) {
        throw new Error("Generation completed without a durable task receipt")
      }
      const result = await this.journal.captureResult(record, artifacts)
      record = await this.#update(record, { result, status: "succeeded" })
      return publicSnapshot(record)
    } catch (error) {
      if (signal.aborted || isAbortError(error)) throw abortError()
      if (error instanceof TerminalGenerationError) {
        record = await this.#update(record, {
          ...(error.status === "failed"
            ? {
                error: {
                  code: "provider_failed",
                  message: "The service reported that generation failed.",
                },
              }
            : {}),
          status: error.status === "cancelled"
            ? "cancelled"
            : error.status === "submission_unknown"
              ? "unknown"
              : "failed",
        })
        return publicSnapshot(record)
      }
      if (
        error instanceof GenerationSubmissionError
        || error instanceof OperationConflictError
      ) {
        record = await this.#update(record, {
          error: {
            code: error instanceof OperationConflictError
              ? "operation_conflict"
              : "submission_failed",
            message: error instanceof OperationConflictError
              ? "The generation operation identity conflicts with stored input."
              : "The service did not confirm that generation was accepted.",
          },
          status: "failed",
        })
        return publicSnapshot(record)
      }
      record = await this.#update(record, {
        error: {
          code: "generation_failed",
          message: "The service could not complete generation.",
        },
        status: "failed",
      })
      return publicSnapshot(record)
    }
  }

  async #record(request: GenerationRecoveryRequest) {
    const record = await this.journal.read(request.operationId)
    if (!record) return null
    this.#assertRequest(record, request)
    return record
  }

  #assertRequest(
    record: GenerationJournalRecord,
    request: GenerationRecoveryRequest,
  ) {
    if (
      record.requestDigest !== request.requestDigest
      || (request.taskId !== undefined && request.taskId !== record.taskId)
      || (
        request.resultDigest !== undefined
        && request.resultDigest !== record.result?.resultDigest
      )
    ) {
      throw new Error("Generation recovery request identity is invalid")
    }
  }

  async #update(
    record: GenerationJournalRecord,
    update: Partial<GenerationJournalRecord>,
  ) {
    const latest = await this.journal.read(record.operationId)
    if (
      !latest
      || latest.requestDigest !== record.requestDigest
      || latest.callFingerprint !== record.callFingerprint
    ) {
      throw new Error("Generation recovery operation identity conflicts")
    }
    if (terminal(latest)) return latest
    const updated: GenerationJournalRecord = {
      ...latest,
      ...update,
      updatedAt: new Date().toISOString(),
    }
    await this.journal.write(updated)
    return updated
  }
}

function normalizedCall(
  value: unknown,
  kind: GenerationKind,
  operationId: string,
) {
  const input = asRecord(value, "generation call")
  if (
    !operationIdPattern.test(operationId)
    || input.operation_id !== operationId
    || input.output !== kind
    || typeof input.output_directory !== "string"
    || !path.isAbsolute(input.output_directory)
    || input.output_directory.includes("\0")
    || !Array.isArray(input.references)
    || input.references.length !== 0
  ) {
    throw new Error("Generation recovery call is invalid")
  }
  const call = structuredClone(input)
  delete call.output_directory
  const serialized = stableJson(call)
  if (Buffer.byteLength(serialized, "utf8") > 128 * 1024) {
    throw new Error("Generation recovery call is too large")
  }
  return {
    call,
    fingerprint: createHash("sha256").update(serialized).digest("hex"),
  }
}

function publicSnapshot(
  record: GenerationJournalRecord,
): GenerationRecoverySnapshot {
  if (record.status === "prepared") return snapshot("prepared")
  if (record.status === "unknown") return snapshot("unknown")
  if (record.status === "submitted" || record.status === "running") {
    return {
      schema: generationLroSnapshotSchema,
      status: record.status,
      taskId: record.taskId,
    }
  }
  if (record.status === "succeeded" && record.result) {
    return {
      resultDigest: record.result.resultDigest,
      schema: generationLroSnapshotSchema,
      status: "succeeded",
      taskId: record.taskId,
    }
  }
  if (record.status === "failed") {
    return {
      error: record.error ?? {
        code: "generation_failed",
        message: "The service could not complete generation.",
      },
      schema: generationLroSnapshotSchema,
      status: "failed",
      ...(record.jobId === undefined ? {} : { taskId: record.taskId }),
    }
  }
  return {
    schema: generationLroSnapshotSchema,
    status: "cancelled",
    ...(record.jobId === undefined ? {} : { taskId: record.taskId }),
  }
}

function snapshot(
  status: "absent" | "prepared" | "unknown",
): GenerationRecoverySnapshot {
  return { schema: generationLroSnapshotSchema, status }
}

function terminal(record: GenerationJournalRecord) {
  return record.status === "failed"
    || record.status === "cancelled"
    || record.status === "unknown"
    || (record.status === "succeeded" && record.result !== undefined)
}

function secureTaskId() {
  return `shortdrama_task_${randomBytes(24).toString("base64url")}`
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>
    return `{${Object.keys(input)
      .filter((key) => input[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(input[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

export function parseRecoveryRequest(
  value: unknown,
  acceptsOutputDirectory: boolean,
): GenerationRecoveryRequest {
  const input = asRecord(value, "generation recovery params")
  const allowed = new Set([
    "operationId",
    "outputDirectory",
    "requestDigest",
    "resultDigest",
    "schema",
    "taskId",
  ])
  if (
    Object.keys(input).some((key) => !allowed.has(key))
    || input.schema !== "convax.generation-lro-request/1"
    || typeof input.operationId !== "string"
    || !operationIdPattern.test(input.operationId)
    || typeof input.requestDigest !== "string"
    || !digestPattern.test(input.requestDigest)
    || (input.taskId !== undefined
      && (typeof input.taskId !== "string"
        || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u.test(input.taskId)))
    || (input.resultDigest !== undefined
      && (typeof input.resultDigest !== "string"
        || !digestPattern.test(input.resultDigest)))
    || (input.outputDirectory !== undefined
      && (!acceptsOutputDirectory
        || typeof input.outputDirectory !== "string"
        || !path.isAbsolute(input.outputDirectory)
        || input.outputDirectory.includes("\0")
        || input.outputDirectory.length > 4_096))
    || (acceptsOutputDirectory && typeof input.outputDirectory !== "string")
  ) {
    throw new Error("Generation recovery params are invalid")
  }
  return {
    operationId: input.operationId,
    ...(input.outputDirectory === undefined
      ? {}
      : { outputDirectory: input.outputDirectory }),
    requestDigest: input.requestDigest,
    schema: "convax.generation-lro-request/1",
    ...(input.resultDigest === undefined
      ? {}
      : { resultDigest: input.resultDigest }),
    ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
  }
}

export function parseGenerationOperationMeta(value: unknown) {
  const meta = asRecord(value, "generation call metadata")
  const operation = asRecord(
    meta.convaxGeneration,
    "Convax generation operation metadata",
  )
  if (
    Object.keys(meta).some(
      (key) => !["convaxGeneration", "progressToken"].includes(key),
    )
    || Object.keys(operation).length !== 4
    || operation.schema !== "convax.generation-operation/1"
    || operation.recovery !== "required"
    || typeof operation.operationId !== "string"
    || !operationIdPattern.test(operation.operationId)
    || typeof operation.requestDigest !== "string"
    || !digestPattern.test(operation.requestDigest)
    || (meta.progressToken !== undefined
      && (typeof meta.progressToken !== "string"
        || meta.progressToken.length < 1
        || meta.progressToken.length > 512
        || meta.progressToken.includes("\0")))
  ) {
    throw new Error("Convax generation operation metadata is invalid")
  }
  return {
    ...(meta.progressToken === undefined
      ? {}
      : { progressToken: meta.progressToken }),
    request: {
      operationId: operation.operationId,
      requestDigest: operation.requestDigest,
      schema: "convax.generation-lro-request/1",
    } satisfies GenerationRecoveryRequest,
  }
}
