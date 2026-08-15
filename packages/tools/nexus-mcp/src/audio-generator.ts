import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rm } from "node:fs/promises";
import path from "node:path";

import type {
  NexusAudioMimeType,
  NexusAudioRoute,
} from "./application-client.ts";
import {
  asRecord,
  generationCallSchema,
  generationProviderParameters,
  type GenerationArtifact,
  type GenerationCall,
} from "./contracts.ts";

const maximumPromptBytes = 20_000;
const maximumTrackedOperations = 256;
const modelIdPattern = /^~?[A-Za-z0-9]+(?:[._/:-][A-Za-z0-9]+)*$/u;
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

interface TrackedOperation {
  fingerprint: string;
  result: Promise<readonly GenerationArtifact[]>;
}

export class NexusAudioGenerator {
  readonly #operations = new Map<string, TrackedOperation>();

  generate(
    value: unknown,
    resolveRoute: () => NexusAudioRoute,
    signal: AbortSignal,
  ): Promise<readonly GenerationArtifact[]> {
    const call = parseGenerationCall(value);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(call))
      .digest("hex");
    const existing = this.#operations.get(call.operation_id);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error(
          "Nexus generation operation id was reused with different input",
        );
      }
      return existing.result;
    }
    if (this.#operations.size >= maximumTrackedOperations) {
      throw new Error(
        "Nexus generation operation history is full; restart the companion before generating again",
      );
    }
    const result = this.#generate(call, resolveRoute, signal);
    this.#operations.set(call.operation_id, { fingerprint, result });
    return result;
  }

  async #generate(
    call: GenerationCall & { output: "audio" },
    resolveRoute: () => NexusAudioRoute,
    signal: AbortSignal,
  ): Promise<readonly GenerationArtifact[]> {
    if (signal.aborted) throw abortError();
    const outputDirectory = await validateOutputDirectory(
      call.output_directory,
    );
    if (signal.aborted) throw abortError();
    const route = resolveRoute();
    const model = route.models.find(({ id }) => id === call.model);
    if (!model)
      throw new Error("The selected Nexus audio model is unavailable");
    const audio = await route.complete(
      model,
      call.prompt,
      generationProviderParameters(call),
      call.operation_id,
      signal,
    );
    if (signal.aborted) throw abortError();
    const extension = audioExtension(audio.mimeType);
    const name = `nexus-${safeStem(call.operation_id)}.${extension}`;
    const outputPath = path.join(outputDirectory, name);
    const handle = await open(
      outputPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(audio.bytes);
      await handle.sync();
    } catch (error) {
      await rm(outputPath, { force: true }).catch(() => undefined);
      throw error;
    } finally {
      await handle.close();
    }
    return [{ mimeType: audio.mimeType, name, path: name }];
  }
}

function parseGenerationCall(
  value: unknown,
): GenerationCall & { output: "audio" } {
  const input = asRecord(value, "Nexus generation call");
  const providerParameters = generationProviderParameters(input);
  if (
    input.schema !== generationCallSchema ||
    input.output !== "audio" ||
    !Array.isArray(input.references) ||
    input.references.length !== 0
  ) {
    throw new Error("Nexus audio generation call is invalid");
  }
  const model = trimmedString(input.model, "Nexus audio model", 191);
  if (!modelIdPattern.test(model))
    throw new Error("Nexus audio model is invalid");
  const prompt = trimmedString(
    input.prompt,
    "Nexus audio prompt",
    20_000,
    true,
  );
  if (Buffer.byteLength(prompt, "utf8") > maximumPromptBytes) {
    throw new Error("Nexus audio prompt is too large");
  }
  const operationId = trimmedString(
    input.operation_id,
    "Nexus generation operation id",
    128,
  );
  if (!operationIdPattern.test(operationId)) {
    throw new Error("Nexus generation operation id is invalid");
  }
  return {
    ...providerParameters,
    model,
    operation_id: operationId,
    output: "audio",
    output_directory: trimmedString(
      input.output_directory,
      "Nexus generation output directory",
      4_096,
    ),
    prompt,
    references: [],
    schema: generationCallSchema,
  };
}

async function validateOutputDirectory(value: string) {
  if (!path.isAbsolute(value)) {
    throw new Error("Nexus generation output directory must be absolute");
  }
  const metadata = await lstat(value);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Nexus generation output directory is invalid");
  }
  return value;
}

function audioExtension(mimeType: NexusAudioMimeType) {
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") return "wav";
  if (mimeType === "audio/ogg" || mimeType === "audio/opus") return "opus";
  if (mimeType === "audio/aac") return "aac";
  if (mimeType === "audio/flac") return "flac";
  return "pcm";
}

function trimmedString(
  value: unknown,
  label: string,
  maximumLength: number,
  allowNewlines = false,
) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    value !== value.trim() ||
    (allowNewlines
      ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
      : /[\u0000-\u001f\u007f]/u.test(value))
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function safeStem(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/gu, "-").slice(0, 128);
}

function abortError() {
  return new DOMException("The operation was aborted", "AbortError");
}
