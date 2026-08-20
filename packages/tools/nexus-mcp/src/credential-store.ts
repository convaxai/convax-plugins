import { randomBytes } from "node:crypto";
import { constants as fsConstants, type Stats } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  applicationCredentialsSchema,
  type NexusApplicationCredentials,
} from "./contracts.ts";

const maximumCredentialBytes = 32 * 1024;
const credentialFileName = "authx-refresh-credential.json";

export interface NexusCredentialStore {
  clear(): Promise<void>;
  read(): Promise<NexusApplicationCredentials | null>;
  write(credentials: NexusApplicationCredentials): Promise<void>;
}

class PrivateFileCredentialStore implements NexusCredentialStore {
  readonly path: string;

  constructor(
    private readonly directory: string,
    private readonly environment: Readonly<
      Record<string, string | undefined>
    >,
    private readonly label: string,
    private readonly privateDirectories: readonly string[],
  ) {
    this.path = path.join(directory, credentialFileName);
  }

  async read(): Promise<NexusApplicationCredentials | null> {
    await clearLegacyRefreshGrant(this.environment);
    const directoryExists = await inspectPrivateDirectory(
      this.directory,
      this.label,
    );
    if (!directoryExists) return null;

    let metadata: Stats;
    try {
      metadata = await fs.lstat(this.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error(`${this.label} could not be inspected`);
    }
    assertPrivateCredentialFile(metadata, this.label);
    const serialized = await fs.readFile(this.path);
    const after = await fs.lstat(this.path);
    if (
      after.dev !== metadata.dev ||
      after.ino !== metadata.ino ||
      after.size !== metadata.size ||
      after.mtimeMs !== metadata.mtimeMs ||
      after.ctimeMs !== metadata.ctimeMs ||
      after.nlink !== 1
    ) {
      throw new Error(`${this.label} changed while reading`);
    }
    if (serialized.byteLength > maximumCredentialBytes) {
      throw new Error(`${this.label} are too large`);
    }
    let value: string;
    try {
      value = new TextDecoder("utf-8", { fatal: true }).decode(serialized);
    } catch {
      throw new Error(`${this.label} are invalid`);
    }
    if (isRetiredApplicationCredential(value, this.label)) {
      await this.clear();
      return null;
    }
    return parseCredentials(value, this.label);
  }

  async write(credentials: NexusApplicationCredentials): Promise<void> {
    const serialized = `${serializeCredentials(credentials)}\n`;
    await ensurePrivateDirectories(this.privateDirectories, this.label);
    const temporary = path.join(
      this.directory,
      `.authx-refresh-credential-${randomBytes(12).toString("hex")}.tmp`,
    );
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      handle = await fs.open(
        temporary,
        fsConstants.O_CREAT |
          fsConstants.O_EXCL |
          fsConstants.O_NOFOLLOW |
          fsConstants.O_WRONLY,
        0o600,
      );
      await handle.writeFile(serialized, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fs.rename(temporary, this.path);
      const metadata = await fs.lstat(this.path);
      assertPrivateCredentialFile(metadata, this.label);
      await syncDirectory(this.directory);
    } catch {
      throw new Error(`${this.label} could not be stored`);
    } finally {
      await handle?.close().catch(() => undefined);
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  async clear(): Promise<void> {
    await clearLegacyRefreshGrant(this.environment);
    const directoryExists = await inspectPrivateDirectory(
      this.directory,
      this.label,
    );
    if (!directoryExists) return;
    try {
      const metadata = await fs.lstat(this.path);
      assertPrivateCredentialFile(metadata, this.label);
      await fs.rm(this.path);
      await syncDirectory(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

export class UserDataCredentialStore extends PrivateFileCredentialStore {
  constructor(
    environment: Readonly<Record<string, string | undefined>> = process.env,
    platform: NodeJS.Platform = process.platform,
    fallbackHome: string = os.homedir(),
  ) {
    if (platform !== "darwin") {
      throw new Error("The Nexus production credential store requires macOS");
    }
    const directory = path.join(
      homeDirectory(environment, fallbackHome),
      "Library",
      "Application Support",
      "Convax",
      "nexus-service",
    );
    super(directory, environment, "Nexus user data credentials", [directory]);
  }
}

export class LocalDevelopmentCredentialStore extends PrivateFileCredentialStore {
  constructor(
    environment: Readonly<Record<string, string | undefined>> = process.env,
  ) {
    if (environment.CONVAX_NEXUS_LOCAL_DEVELOPMENT !== "1") {
      throw new Error(
        "The Nexus local credential store requires local development mode",
      );
    }
    const root = configRoot(environment);
    const convaxDirectory = path.join(root, "convax");
    const directory = path.join(convaxDirectory, "nexus-service");
    super(directory, environment, "Nexus local credentials", [
      convaxDirectory,
      directory,
    ]);
  }
}

export class MemoryCredentialStore implements NexusCredentialStore {
  #serialized: string | undefined;

  async read(): Promise<NexusApplicationCredentials | null> {
    return this.#serialized === undefined
      ? null
      : parseCredentials(this.#serialized);
  }

  async write(credentials: NexusApplicationCredentials): Promise<void> {
    this.#serialized = serializeCredentials(credentials);
  }

  async clear(): Promise<void> {
    this.#serialized = undefined;
  }
}

function serializeCredentials(credentials: NexusApplicationCredentials) {
  const parsed = validateCredentials(credentials);
  const serialized = JSON.stringify(parsed);
  if (Buffer.byteLength(serialized, "utf8") > maximumCredentialBytes) {
    throw new Error("Nexus credentials are too large");
  }
  return serialized;
}

function parseCredentials(
  serialized: string,
  label = "Nexus credentials",
): NexusApplicationCredentials {
  if (Buffer.byteLength(serialized, "utf8") > maximumCredentialBytes) {
    throw new Error(`${label} are too large`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error(`${label} are invalid`);
  }
  return validateCredentials(parsed);
}

function isRetiredApplicationCredential(
  serialized: string,
  label = "Nexus credentials",
): boolean {
  if (Buffer.byteLength(serialized, "utf8") > maximumCredentialBytes) {
    throw new Error(`${label} are too large`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error(`${label} are invalid`);
  }
  return (
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    (parsed as Record<string, unknown>).schema ===
      "convax.nexus-application-credentials/1"
  );
}

function validateCredentials(value: unknown): NexusApplicationCredentials {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Nexus credentials are invalid");
  }
  const input = value as Record<string, unknown>;
  const keys = [
    "accountBinding",
    "authxIssuer",
    "nexusOrigin",
    "refreshToken",
    "schema",
  ];
  if (
    Object.keys(input).length !== keys.length ||
    Object.keys(input).some((key) => !keys.includes(key)) ||
    input.schema !== applicationCredentialsSchema
  ) {
    throw new Error("Nexus credentials are invalid");
  }
  return {
    accountBinding: digest(input.accountBinding, "Nexus account binding"),
    authxIssuer: exactOrigin(input.authxIssuer, "AuthX issuer"),
    nexusOrigin: exactOrigin(input.nexusOrigin, "Nexus origin"),
    refreshToken: credential(input.refreshToken, "AuthX refresh credential"),
    schema: applicationCredentialsSchema,
  };
}

async function clearLegacyRefreshGrant(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const configured = environment.XDG_CONFIG_HOME;
  const root =
    configured && path.isAbsolute(configured)
      ? configured
      : path.join(environment.HOME || os.homedir(), ".config");
  const legacyPath = path.join(
    root,
    "convax",
    "service-credentials",
    "nexus-service.json",
  );
  let serialized: string;
  try {
    serialized = await fs.readFile(legacyPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error("Legacy Nexus credential could not be inspected");
  }
  if (Buffer.byteLength(serialized, "utf8") > maximumCredentialBytes) {
    throw new Error("Legacy Nexus credential is too large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Legacy Nexus credential is invalid");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !["convax.nexus-refresh-grant/1", "convax.nexus-session/1"].includes(
      String((parsed as Record<string, unknown>).schema),
    )
  ) {
    throw new Error("Legacy Nexus credential is invalid");
  }
  await fs.rm(legacyPath, { force: true });
}

function configRoot(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const configured = environment.XDG_CONFIG_HOME;
  if (configured !== undefined) {
    if (!path.isAbsolute(configured)) {
      throw new Error("XDG_CONFIG_HOME must be absolute");
    }
    return path.normalize(configured);
  }
  return path.join(homeDirectory(environment, os.homedir()), ".config");
}

function homeDirectory(
  environment: Readonly<Record<string, string | undefined>>,
  fallback: string,
) {
  const home = environment.HOME || fallback;
  if (!path.isAbsolute(home) || home.includes("\0")) {
    throw new Error("Nexus user home must be absolute");
  }
  return path.normalize(home);
}

async function ensurePrivateDirectories(
  directories: readonly string[],
  label: string,
) {
  for (const directory of directories) {
    await fs.mkdir(directory, { mode: 0o700, recursive: true });
    const metadata = await fs.lstat(directory);
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      metadata.nlink < 1
    ) {
      throw new Error(`${label} directory is unsafe`);
    }
    await fs.chmod(directory, 0o700);
  }
}

async function inspectPrivateDirectory(directory: string, label: string) {
  let metadata: Stats;
  try {
    metadata = await fs.lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new Error(`${label} directory could not be inspected`);
  }
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    metadata.nlink < 1 ||
    (metadata.mode & 0o077) !== 0
  ) {
    throw new Error(`${label} directory is unsafe`);
  }
  return true;
}

async function syncDirectory(directory: string) {
  const handle = await fs.open(directory, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function assertPrivateCredentialFile(metadata: Stats, label: string) {
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.nlink !== 1 ||
    (metadata.mode & 0o077) !== 0 ||
    metadata.size < 1 ||
    metadata.size > maximumCredentialBytes
  ) {
    throw new Error(`${label} must be a private regular file`);
  }
}

function credential(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    value.length < 20 ||
    value.length > 8_192 ||
    /[\u0000-\u001F\u007F]/u.test(value)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function digest(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function exactOrigin(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} is invalid`);
  const url = new URL(value);
  if (
    url.href !== `${url.origin}/` ||
    url.username ||
    url.password ||
    !(
      url.protocol === "https:" ||
      ["http://127.0.0.1", "http://localhost"].includes(
        `${url.protocol}//${url.hostname}`,
      )
    )
  ) {
    throw new Error(`${label} is invalid`);
  }
  return url.origin;
}

export function createProductionCredentialStore(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return new UserDataCredentialStore(environment);
}

export function createCredentialStore(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return environment.CONVAX_NEXUS_LOCAL_DEVELOPMENT === "1"
    ? new LocalDevelopmentCredentialStore(environment)
    : createProductionCredentialStore(environment);
}
