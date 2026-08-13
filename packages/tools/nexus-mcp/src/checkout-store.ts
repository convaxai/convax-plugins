import { randomBytes, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface NexusCheckoutAttempt {
  bindingId: string;
  checkoutId?: string;
  idempotencyKey: string;
  planKey: string;
  schema: "convax.nexus-application-checkout-attempt/1";
  startedAt: string;
  status?: string;
}

function checkoutPath(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const configured = environment.XDG_CONFIG_HOME;
  const root =
    configured && path.isAbsolute(configured)
      ? configured
      : path.join(environment.HOME || os.homedir(), ".config");
  return path.join(
    root,
    "convax",
    "service-credentials",
    "nexus-service-checkout.json",
  );
}

function valid(value: unknown): value is NexusCheckoutAttempt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Partial<NexusCheckoutAttempt>;
  return (
    input.schema === "convax.nexus-application-checkout-attempt/1" &&
    typeof input.bindingId === "string" &&
    input.bindingId.length >= 8 &&
    input.bindingId.length <= 191 &&
    typeof input.planKey === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.planKey) &&
    typeof input.idempotencyKey === "string" &&
    /^[A-Za-z0-9_-]{8,191}$/u.test(input.idempotencyKey) &&
    typeof input.startedAt === "string" &&
    Number.isFinite(new Date(input.startedAt).getTime()) &&
    (input.checkoutId === undefined ||
      (typeof input.checkoutId === "string" &&
        input.checkoutId.length >= 8 &&
        input.checkoutId.length <= 191)) &&
    (input.status === undefined ||
      (typeof input.status === "string" && input.status.length <= 32))
  );
}

export class NexusCheckoutStore {
  readonly path: string;

  constructor(
    environment: Readonly<Record<string, string | undefined>> = process.env,
  ) {
    this.path = checkoutPath(environment);
  }

  async read(): Promise<NexusCheckoutAttempt | null> {
    try {
      const stat = await fs.stat(this.path);
      if (!stat.isFile() || (stat.mode & 0o077) !== 0)
        throw new Error("Nexus Checkout file permissions are not private");
      const value = JSON.parse(await fs.readFile(this.path, "utf8")) as unknown;
      if (!valid(value)) throw new Error("Nexus Checkout file is invalid");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async begin(
    bindingId: string,
    planKey: string,
  ): Promise<NexusCheckoutAttempt> {
    const existing = await this.read();
    if (
      existing?.bindingId === bindingId &&
      existing.planKey === planKey &&
      existing.status !== "FAILED" &&
      existing.status !== "EXPIRED"
    ) {
      return existing;
    }
    const attempt: NexusCheckoutAttempt = {
      bindingId,
      idempotencyKey: randomUUID(),
      planKey,
      schema: "convax.nexus-application-checkout-attempt/1",
      startedAt: new Date().toISOString(),
    };
    await this.write(attempt);
    return attempt;
  }

  async write(attempt: NexusCheckoutAttempt): Promise<void> {
    if (!valid(attempt)) throw new Error("Nexus Checkout attempt is invalid");
    const directory = path.dirname(this.path);
    await fs.mkdir(directory, { mode: 0o700, recursive: true });
    await fs.chmod(directory, 0o700);
    const temporary = path.join(
      directory,
      `.nexus-checkout-${randomBytes(8).toString("hex")}.tmp`,
    );
    try {
      await fs.writeFile(temporary, `${JSON.stringify(attempt)}\n`, {
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

  async clear(): Promise<void> {
    await fs.rm(this.path, { force: true });
  }
}
