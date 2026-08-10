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
import type { NexusImageRoute } from "./nexus-client.ts";

const maximumPromptBytes = 20_000;
const maximumImageBytes = 12 * 1024 * 1024;
const maximumTotalImageBytes = 32 * 1024 * 1024;
const maximumImages = 8;
const maximumTrackedOperations = 256;
const modelIdPattern = /^~?[A-Za-z0-9]+(?:[._/:-][A-Za-z0-9]+)*$/u;
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

interface TrackedOperation {
  fingerprint: string;
  result: Promise<readonly GenerationArtifact[]>;
}

interface DecodedImage {
  bytes: Uint8Array;
  extension: "jpg" | "png" | "webp";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

export class NexusImageGenerator {
  readonly #operations = new Map<string, TrackedOperation>();

  generate(
    value: unknown,
    resolveRoute: () => NexusImageRoute,
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
    call: GenerationCall,
    resolveRoute: () => NexusImageRoute,
    signal: AbortSignal,
  ): Promise<readonly GenerationArtifact[]> {
    if (signal.aborted) throw abortError();
    const outputDirectory = await validateOutputDirectory(
      call.output_directory,
    );
    if (signal.aborted) throw abortError();
    const route = resolveRoute();
    const model = route.models.find(({ id }) => id === call.model);
    if (!model) {
      throw new Error("The selected Nexus image model is unavailable");
    }
    const response = await route.complete(
      model,
      call.prompt,
      call.operation_id,
      signal,
    );
    if (signal.aborted) throw abortError();
    const images = parseImages(response);
    const artifacts: GenerationArtifact[] = [];
    const createdPaths: string[] = [];
    try {
      for (let index = 0; index < images.length; index += 1) {
        if (signal.aborted) throw abortError();
        const image = images[index]!;
        const name = `nexus-${safeStem(call.operation_id)}-${index + 1}.${image.extension}`;
        const outputPath = path.join(outputDirectory, name);
        const handle = await open(
          outputPath,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600,
        );
        createdPaths.push(outputPath);
        try {
          await handle.writeFile(image.bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
        // Convax owns output_directory and admits only portable paths relative
        // to it. Keep the native path private to this writer and return the
        // generated file name through the MCP result contract.
        artifacts.push({ mimeType: image.mimeType, name, path: name });
      }
      return artifacts;
    } catch (error) {
      await Promise.all(
        createdPaths.map((outputPath) =>
          rm(outputPath, { force: true }).catch(() => undefined),
        ),
      );
      throw error;
    }
  }
}

function parseGenerationCall(value: unknown): GenerationCall {
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
  if (input.schema !== generationCallSchema || input.output !== "image") {
    throw new Error("Nexus generation call contract is unsupported");
  }
  if (!Array.isArray(input.references) || input.references.length !== 0) {
    throw new Error("Nexus image generation does not accept references yet");
  }
  const model = trimmedString(input.model, "Nexus image model", 191);
  if (!modelIdPattern.test(model))
    throw new Error("Nexus image model is invalid");
  const prompt = trimmedString(
    input.prompt,
    "Nexus image prompt",
    20_000,
    true,
  );
  if (Buffer.byteLength(prompt, "utf8") > maximumPromptBytes) {
    throw new Error("Nexus image prompt is too large");
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
    output: "image",
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
  if (!path.isAbsolute(value))
    throw new Error("Nexus generation output directory must be absolute");
  const metadata = await lstat(value);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Nexus generation output directory is invalid");
  }
  return value;
}

function parseImages(value: unknown): readonly DecodedImage[] {
  const response = asRecord(value, "Nexus image response");
  if (
    !Array.isArray(response.data) ||
    response.data.length === 0 ||
    response.data.length > maximumImages
  ) {
    throw new Error("Nexus image response data is invalid");
  }
  const images = response.data.map((value, index) => {
    const image = asRecord(value, `Nexus generated image ${index}`);
    const mediaType =
      image.media_type === undefined ? "image/png" : image.media_type;
    return decodeImageBase64(image.b64_json, mediaType);
  });
  const total = images.reduce((sum, image) => sum + image.bytes.byteLength, 0);
  if (total > maximumTotalImageBytes)
    throw new Error("Nexus image response is too large");
  return images;
}

function decodeImageBase64(value: unknown, mediaTypeValue: unknown): DecodedImage {
  if (
    typeof value !== "string" ||
    value.length > maximumImageBytes * 2 ||
    typeof mediaTypeValue !== "string" ||
    !["image/jpeg", "image/png", "image/webp"].includes(mediaTypeValue)
  ) {
    throw new Error("Nexus generated image encoding is invalid");
  }
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value))
    throw new Error("Nexus generated image encoding is invalid");
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value)
    throw new Error("Nexus generated image encoding is invalid");
  const bytes = Uint8Array.from(decoded);
  if (bytes.length === 0 || bytes.length > maximumImageBytes) {
    throw new Error("Nexus generated image is too large");
  }
  const mimeType = mediaTypeValue as DecodedImage["mimeType"];
  if (!matchesImageSignature(bytes, mimeType)) {
    throw new Error(
      "Nexus generated image bytes do not match their media type",
    );
  }
  return {
    bytes,
    extension:
      mimeType === "image/jpeg"
        ? "jpg"
        : mimeType === "image/png"
          ? "png"
          : "webp",
    mimeType,
  };
}

function matchesImageSignature(
  bytes: Uint8Array,
  mimeType: DecodedImage["mimeType"],
) {
  if (mimeType === "image/jpeg")
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  if (mimeType === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    return (
      bytes.length >= signature.length &&
      signature.every((value, index) => bytes[index] === value)
    );
  }
  return (
    bytes.length >= 12 &&
    new TextDecoder("ascii").decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder("ascii").decode(bytes.subarray(8, 12)) === "WEBP"
  );
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

function safeStem(operationId: string) {
  const stem = operationId
    .toLowerCase()
    .replaceAll(/[^a-z0-9_-]/gu, "-")
    .replaceAll(/-+/gu, "-")
    .slice(0, 32);
  return stem || "image";
}

function abortError() {
  return new DOMException("Nexus image generation was cancelled", "AbortError");
}
