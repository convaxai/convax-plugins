import { createHash, randomBytes, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const operationStoreSchema =
  "convax.nexus-application-operation-keys/1" as const;
const maximumEntries = 64;

interface StoredOperationKey {
  idempotencyKey: string;
  updatedAt: string;
}

interface StoredOperations {
  entries: Record<string, StoredOperationKey>;
  schema: typeof operationStoreSchema;
}

export class ApplicationOperationStore {
  readonly path: string;

  constructor(
    environment: Readonly<Record<string, string | undefined>> = process.env,
  ) {
    const configured = environment.XDG_CONFIG_HOME;
    const root =
      configured && path.isAbsolute(configured)
        ? configured
        : path.join(environment.HOME || os.homedir(), ".config");
    this.path = path.join(
      root,
      "convax",
      "service-credentials",
      "nexus-service-application-operations.json",
    );
  }

  async getOrCreate(operation: string, authority: string): Promise<string> {
    const slot = operationSlot(operation, authority);
    const stored = await this.#read();
    const existing = stored.entries[slot];
    if (existing) return existing.idempotencyKey;
    const entry = {
      idempotencyKey: randomUUID(),
      updatedAt: new Date().toISOString(),
    };
    await this.#write({
      entries: boundedEntries({ ...stored.entries, [slot]: entry }),
      schema: operationStoreSchema,
    });
    return entry.idempotencyKey;
  }

  async replace(operation: string, authority: string): Promise<string> {
    const slot = operationSlot(operation, authority);
    const stored = await this.#read();
    const entry = {
      idempotencyKey: randomUUID(),
      updatedAt: new Date().toISOString(),
    };
    await this.#write({
      entries: boundedEntries({ ...stored.entries, [slot]: entry }),
      schema: operationStoreSchema,
    });
    return entry.idempotencyKey;
  }

  async #read(): Promise<StoredOperations> {
    try {
      const stat = await fs.stat(this.path);
      if (!stat.isFile() || (stat.mode & 0o077) !== 0) {
        throw new Error("Nexus operation-key file permissions are not private");
      }
      const serialized = await fs.readFile(this.path, "utf8");
      if (Buffer.byteLength(serialized, "utf8") > 64 * 1024) {
        throw new Error("Nexus operation-key file is too large");
      }
      return validate(JSON.parse(serialized) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { entries: {}, schema: operationStoreSchema };
      }
      throw error;
    }
  }

  async #write(value: StoredOperations): Promise<void> {
    const stored = validate(value);
    const directory = path.dirname(this.path);
    await fs.mkdir(directory, { mode: 0o700, recursive: true });
    await fs.chmod(directory, 0o700);
    const temporary = path.join(
      directory,
      `.nexus-application-operations-${randomBytes(8).toString("hex")}.tmp`,
    );
    try {
      await fs.writeFile(temporary, `${JSON.stringify(stored)}\n`, {
        encoding: "utf8",
        flag:
          fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
        mode: 0o600,
      });
      await fs.rename(temporary, this.path);
      await fs.chmod(this.path, 0o600);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}

function operationSlot(operation: string, authority: string) {
  if (
    !/^[a-z][a-z0-9-]{1,31}$/u.test(operation) ||
    authority.length < 1 ||
    authority.length > 2_048 ||
    authority.includes("\0")
  ) {
    throw new Error("Nexus operation-key authority is invalid");
  }
  return `${operation}:${createHash("sha256").update(authority).digest("hex")}`;
}

function boundedEntries(entries: Record<string, StoredOperationKey>) {
  return Object.fromEntries(
    Object.entries(entries)
      .sort(
        ([leftKey, left], [rightKey, right]) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          leftKey.localeCompare(rightKey),
      )
      .slice(0, maximumEntries),
  );
}

function validate(value: unknown): StoredOperations {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Nexus operation-key file is invalid");
  }
  const input = value as Record<string, unknown>;
  if (
    input.schema !== operationStoreSchema ||
    !input.entries ||
    typeof input.entries !== "object" ||
    Array.isArray(input.entries) ||
    Object.keys(input.entries).length > maximumEntries
  ) {
    throw new Error("Nexus operation-key file is invalid");
  }
  const entries: Record<string, StoredOperationKey> = {};
  for (const [slot, value] of Object.entries(
    input.entries as Record<string, unknown>,
  )) {
    if (
      !/^[a-z][a-z0-9-]{1,31}:[a-f0-9]{64}$/u.test(slot) ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      throw new Error("Nexus operation-key entry is invalid");
    }
    const entry = value as Record<string, unknown>;
    if (
      typeof entry.idempotencyKey !== "string" ||
      !/^[0-9a-f-]{36}$/u.test(entry.idempotencyKey) ||
      typeof entry.updatedAt !== "string" ||
      !Number.isFinite(new Date(entry.updatedAt).getTime())
    ) {
      throw new Error("Nexus operation-key entry is invalid");
    }
    entries[slot] = {
      idempotencyKey: entry.idempotencyKey,
      updatedAt: new Date(entry.updatedAt).toISOString(),
    };
  }
  return { entries, schema: operationStoreSchema };
}
