import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rm } from "node:fs/promises";
import path from "node:path";

import {
  asRecord,
  generationCallSchema,
  type GenerationArtifact,
  type GenerationCall,
} from "./contracts.ts";
import type { NexusVideoRoute } from "./nexus-client.ts";

const maximumPromptBytes = 20_000;
const maximumTrackedOperations = 256;
const modelIdPattern = /^~?[A-Za-z0-9]+(?:[._/:-][A-Za-z0-9]+)*$/u;
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

interface TrackedOperation {
  fingerprint: string;
  result: Promise<readonly GenerationArtifact[]>;
}

export class NexusVideoGenerator {
  readonly #operations = new Map<string, TrackedOperation>();

  generate(
    value: unknown,
    resolveRoute: () => NexusVideoRoute,
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
    call: GenerationCall & { output: "video" },
    resolveRoute: () => NexusVideoRoute,
    signal: AbortSignal,
  ): Promise<readonly GenerationArtifact[]> {
    if (signal.aborted) throw abortError();
    const outputDirectory = await validateOutputDirectory(
      call.output_directory,
    );
    const route = resolveRoute();
    const model = route.models.find(({ id }) => id === call.model);
    if (!model) throw new Error("The selected Nexus video model is unavailable");
    const artifact = await route.complete(
      model,
      call.prompt,
      call.operation_id,
      signal,
    );
    if (signal.aborted) throw abortError();
    const name = `convax-${safeStem(call.operation_id)}.mp4`;
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
      await handle.writeFile(artifact.bytes);
      await handle.sync();
    } catch (error) {
      await rm(outputPath, { force: true }).catch(() => undefined);
      throw error;
    } finally {
      await handle.close();
    }
    return [{ mimeType: artifact.mimeType, name, path: name }];
  }
}

function parseGenerationCall(value: unknown): GenerationCall & { output: "video" } {
  const input = asRecord(value, "Nexus generation call");
  const keys = [
    "model",
    "operation_id",
    "output",
    "output_directory",
    "prompt",
    "references",
    "schema",
  ];
  if (
    Object.keys(input).length !== keys.length ||
    Object.keys(input).some((key) => !keys.includes(key))
  ) {
    throw new Error("Nexus generation call contains unsupported fields");
  }
  if (input.schema !== generationCallSchema || input.output !== "video") {
    throw new Error("Nexus generation call contract is unsupported");
  }
  if (!Array.isArray(input.references) || input.references.length !== 0) {
    throw new Error("Nexus video generation does not accept references yet");
  }
  const model = trimmedString(input.model, "Nexus video model", 191);
  if (!modelIdPattern.test(model)) {
    throw new Error("Nexus video model is invalid");
  }
  const prompt = trimmedString(
    input.prompt,
    "Nexus video prompt",
    20_000,
    true,
  );
  if (Buffer.byteLength(prompt, "utf8") > maximumPromptBytes) {
    throw new Error("Nexus video prompt is too large");
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
    model,
    operation_id: operationId,
    output: "video",
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

function trimmedString(
  value: unknown,
  label: string,
  maximumLength: number,
  allowWhitespace = false,
) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.includes("\0")
  ) {
    throw new Error(`${label} is invalid`);
  }
  if (!allowWhitespace && value !== value.trim()) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function safeStem(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/gu, "-").slice(0, 80);
}

function abortError() {
  const error = new Error("Nexus video generation was cancelled");
  error.name = "AbortError";
  return error;
}
