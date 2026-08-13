import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import {
  isGenerationProviderParameters,
  type GenerationProviderParameters,
} from "./contracts.ts";

export const videoJournalSchema = "convax.nexus-video-operation/2" as const;
const maximumVideoJournalRecordBytes = 4 * 1024 * 1024;

export type VideoJournalStatus =
  "prepared" | "submitted" | "running" | "succeeded" | "failed" | "cancelled";

export interface VideoJournalRecord {
  createdAt: string;
  error?: { code: string; message: string };
  model: string;
  operationId: string;
  prompt: string;
  providerParameters?: GenerationProviderParameters;
  providerTaskId?: string;
  requestDigest: string;
  result?: {
    byteDigest: string;
    fileName: string;
    resultDigest: string;
    size: number;
    storedFile: string;
  };
  schema: typeof videoJournalSchema;
  status: VideoJournalStatus;
  taskId: string;
  updatedAt: string;
}

export class VideoOperationJournal {
  readonly directory: string;

  constructor(
    environment: Readonly<Record<string, string | undefined>> = process.env,
  ) {
    const configured = environment.CONVAX_GENERATION_LRO_DIRECTORY;
    if (!configured || !path.isAbsolute(configured)) {
      throw new Error(
        "CONVAX_GENERATION_LRO_DIRECTORY is required for generation recovery",
      );
    }
    this.directory = path.normalize(configured);
  }

  async authority(): Promise<string> {
    const metadata = await fs.lstat(this.directory);
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      (metadata.mode & 0o077) !== 0
    ) {
      throw new Error("Convax generation LRO directory is not private");
    }
    return fs.realpath(this.directory);
  }

  async create(record: VideoJournalRecord): Promise<VideoJournalRecord> {
    await this.authority();
    validateRecord(record);
    const existing = await this.read(record.operationId);
    if (existing) {
      if (existing.requestDigest !== record.requestDigest) {
        throw new Error("Nexus video operation identity conflicts");
      }
      return existing;
    }
    await this.#write(record, true);
    return record;
  }

  async read(operationId: string): Promise<VideoJournalRecord | null> {
    const file = this.#recordPath(operationId);
    try {
      const stat = await fs.lstat(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        (stat.mode & 0o077) !== 0
      ) {
        throw new Error("Nexus video journal permissions are not private");
      }
      const serialized = await fs.readFile(file, "utf8");
      if (
        Buffer.byteLength(serialized, "utf8") > maximumVideoJournalRecordBytes
      ) {
        throw new Error("Nexus video journal record is too large");
      }
      const parsed = JSON.parse(serialized) as unknown;
      validateRecord(parsed);
      if (parsed.operationId !== operationId) {
        throw new Error("Nexus video journal identity is invalid");
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async write(record: VideoJournalRecord): Promise<void> {
    validateRecord(record);
    const existing = await this.read(record.operationId);
    if (!existing || existing.requestDigest !== record.requestDigest) {
      throw new Error("Nexus video operation identity conflicts");
    }
    await this.#write(record, false);
  }

  async storeResult(
    operationId: string,
    requestDigest: string,
    bytes: Uint8Array,
  ) {
    if (bytes.byteLength < 12 || bytes.byteLength > 256 * 1024 * 1024) {
      throw new Error("Nexus video result bytes are invalid");
    }
    const byteDigest = createHash("sha256").update(bytes).digest("hex");
    const storedFile = `${operationKey(operationId)}-${byteDigest.slice(0, 16)}.mp4`;
    const target = path.join(this.directory, storedFile);
    try {
      const existing = await fs.readFile(target);
      if (
        existing.byteLength !== bytes.byteLength ||
        createHash("sha256").update(existing).digest("hex") !== byteDigest
      ) {
        throw new Error("Nexus video journal result conflicts");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const handle = await fs.open(
        target,
        fsConstants.O_WRONLY |
          fsConstants.O_CREAT |
          fsConstants.O_EXCL |
          (fsConstants.O_NOFOLLOW ?? 0),
        0o600,
      );
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } catch (error) {
        await fs.rm(target, { force: true }).catch(() => undefined);
        throw error;
      } finally {
        await handle.close();
      }
    }
    const current = await this.read(operationId);
    if (!current || current.requestDigest !== requestDigest) {
      throw new Error("Nexus video operation identity conflicts");
    }
    return { byteDigest, size: bytes.byteLength, storedFile };
  }

  async readResult(record: VideoJournalRecord): Promise<Uint8Array> {
    if (!record.result) throw new Error("Nexus video result is unavailable");
    const target = path.join(this.directory, record.result.storedFile);
    const metadata = await fs.lstat(target);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      (metadata.mode & 0o077) !== 0 ||
      metadata.size !== record.result.size
    ) {
      throw new Error("Nexus video journal result is invalid");
    }
    const bytes = new Uint8Array(await fs.readFile(target));
    if (
      createHash("sha256").update(bytes).digest("hex") !==
      record.result.byteDigest
    ) {
      throw new Error("Nexus video journal result digest changed");
    }
    return bytes;
  }

  async remove(record: VideoJournalRecord): Promise<void> {
    const resultPath = record.result
      ? path.join(this.directory, record.result.storedFile)
      : undefined;
    if (resultPath) await fs.rm(resultPath, { force: true });
    await fs.rm(this.#recordPath(record.operationId), { force: true });
  }

  async #write(record: VideoJournalRecord, exclusive: boolean) {
    await this.authority();
    const target = this.#recordPath(record.operationId);
    const temporary = path.join(
      this.directory,
      `.video-operation-${randomBytes(8).toString("hex")}.tmp`,
    );
    const serialized = `${JSON.stringify(record)}\n`;
    if (
      Buffer.byteLength(serialized, "utf8") > maximumVideoJournalRecordBytes
    ) {
      throw new Error("Nexus video journal record is too large");
    }
    try {
      await fs.writeFile(temporary, serialized, {
        encoding: "utf8",
        flag: fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
        mode: 0o600,
      });
      if (exclusive) {
        try {
          await fs.link(temporary, target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          const existing = await this.read(record.operationId);
          if (!existing || existing.requestDigest !== record.requestDigest) {
            throw new Error("Nexus video operation identity conflicts");
          }
          return;
        }
        await fs.rm(temporary, { force: true });
      } else {
        await fs.rename(temporary, target);
      }
      await fs.chmod(target, 0o600);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  #recordPath(operationId: string) {
    return path.join(this.directory, `${operationKey(operationId)}.json`);
  }
}

function operationKey(operationId: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(operationId)) {
    throw new Error("Nexus video operation id is invalid");
  }
  return Buffer.from(operationId).toString("base64url");
}

function validateRecord(value: unknown): asserts value is VideoJournalRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Nexus video journal record is invalid");
  }
  const input = value as Partial<VideoJournalRecord>;
  if (
    input.schema !== videoJournalSchema ||
    typeof input.operationId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(input.operationId) ||
    typeof input.requestDigest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(input.requestDigest) ||
    ![
      "prepared",
      "submitted",
      "running",
      "succeeded",
      "failed",
      "cancelled",
    ].includes(String(input.status)) ||
    !validDate(input.createdAt) ||
    !validDate(input.updatedAt) ||
    !bounded(input.model, 191) ||
    !bounded(input.prompt, 20_000, true) ||
    (input.providerParameters !== undefined &&
      !isGenerationProviderParameters(input.providerParameters)) ||
    !bounded(input.taskId, 128) ||
    !optionalBounded(input.providerTaskId, 512) ||
    !optionalError(input.error) ||
    !optionalResult(input.result)
  ) {
    throw new Error("Nexus video journal record is invalid");
  }
  if (
    (input.status === "submitted" ||
      input.status === "running" ||
      input.status === "succeeded") &&
    input.providerTaskId === undefined
  ) {
    throw new Error("Nexus video journal receipt is missing");
  }
  if (input.status === "succeeded" && input.result === undefined) {
    throw new Error("Nexus video journal result is incomplete");
  }
}

function validDate(value: unknown) {
  return (
    typeof value === "string" &&
    Number.isFinite(new Date(value).getTime()) &&
    new Date(value).toISOString() === value
  );
}

function bounded(value: unknown, maximum: number, allowWhitespace = false) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    !value.includes("\0") &&
    (allowWhitespace || value === value.trim())
  );
}

function optionalBounded(value: unknown, maximum: number) {
  return value === undefined || bounded(value, maximum);
}

function optionalError(value: unknown) {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const error = value as Record<string, unknown>;
  return (
    Object.keys(error).length === 2 &&
    typeof error.code === "string" &&
    /^[a-z][a-z0-9._-]{0,63}$/u.test(error.code) &&
    bounded(error.message, 512, true)
  );
}

function optionalResult(value: unknown) {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (
    Object.keys(result).length === 5 &&
    typeof result.byteDigest === "string" &&
    /^[a-f0-9]{64}$/u.test(result.byteDigest) &&
    bounded(result.fileName, 191) &&
    typeof result.resultDigest === "string" &&
    /^[a-f0-9]{64}$/u.test(result.resultDigest) &&
    Number.isSafeInteger(result.size) &&
    Number(result.size) >= 12 &&
    Number(result.size) <= 256 * 1024 * 1024 &&
    bounded(result.storedFile, 255) &&
    !String(result.storedFile).includes("/") &&
    !String(result.storedFile).includes("\\")
  );
}
