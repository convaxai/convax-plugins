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
import type { NexusClient } from "./nexus-client.ts";

const maximumPromptBytes = 20_000;
const maximumImageBytes = 12 * 1024 * 1024;
const maximumTotalImageBytes = 32 * 1024 * 1024;
const maximumImages = 8;
const maximumTrackedOperations = 256;
const modelIdPattern = /^~?[A-Za-z0-9]+(?:[._/:-][A-Za-z0-9]+)*$/u;

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

  constructor(private readonly client: NexusClient) {}

  generate(
    value: unknown,
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
    const result = this.#generate(call, signal);
    this.#operations.set(call.operation_id, { fingerprint, result });
    return result;
  }

  async #generate(
    call: GenerationCall,
    signal: AbortSignal,
  ): Promise<readonly GenerationArtifact[]> {
    if (signal.aborted) throw abortError();
    const available = await this.client.imageModels(signal);
    if (!available.some(({ id }) => id === call.model)) {
      throw new Error("The selected Nexus image model is unavailable");
    }
    const outputDirectory = await validateOutputDirectory(
      call.output_directory,
    );
    const response = await this.client.imageCompletion(
      call.model,
      call.prompt,
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
  const prompt = trimmedString(input.prompt, "Nexus image prompt", 20_000, true);
  if (Buffer.byteLength(prompt, "utf8") > maximumPromptBytes) {
    throw new Error("Nexus image prompt is too large");
  }
  return {
    model,
    operation_id: trimmedString(
      input.operation_id,
      "Nexus generation operation id",
      256,
    ),
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
    !Array.isArray(response.choices) ||
    response.choices.length === 0 ||
    response.choices.length > 16
  ) {
    throw new Error("Nexus image response choices are invalid");
  }
  const images: DecodedImage[] = [];
  for (let choiceIndex = 0; choiceIndex < response.choices.length; choiceIndex += 1) {
    const choice = asRecord(
      response.choices[choiceIndex],
      `Nexus image response choice ${choiceIndex}`,
    );
    const message = asRecord(
      choice.message,
      `Nexus image response choice ${choiceIndex} message`,
    );
    if (message.images === undefined) continue;
    if (!Array.isArray(message.images) || message.images.length > maximumImages) {
      throw new Error("Nexus image response image list is invalid");
    }
    for (const image of message.images) {
      if (images.length >= maximumImages)
        throw new Error("Nexus image response contains too many images");
      const entry = asRecord(image, "Nexus generated image");
      const imageUrl = asRecord(entry.image_url, "Nexus generated image URL");
      images.push(decodeImageDataUrl(imageUrl.url));
    }
  }
  if (images.length === 0)
    throw new Error("Nexus completed without an image artifact");
  const total = images.reduce((sum, image) => sum + image.bytes.byteLength, 0);
  if (total > maximumTotalImageBytes)
    throw new Error("Nexus image response is too large");
  return images;
}

function decodeImageDataUrl(value: unknown): DecodedImage {
  if (typeof value !== "string" || value.length > maximumImageBytes * 2) {
    throw new Error("Nexus generated image URL is invalid");
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(
    value,
  );
  if (!match?.[1] || !match[2])
    throw new Error("Nexus generated image must be an embedded supported image");
  if (match[2].length % 4 !== 0)
    throw new Error("Nexus generated image encoding is invalid");
  const decoded = Buffer.from(match[2], "base64");
  if (decoded.toString("base64") !== match[2])
    throw new Error("Nexus generated image encoding is invalid");
  const bytes = Uint8Array.from(decoded);
  if (bytes.length === 0 || bytes.length > maximumImageBytes) {
    throw new Error("Nexus generated image is too large");
  }
  const mimeType = match[1] as DecodedImage["mimeType"];
  if (!matchesImageSignature(bytes, mimeType)) {
    throw new Error("Nexus generated image bytes do not match their media type");
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
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
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
