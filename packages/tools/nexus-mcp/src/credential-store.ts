import { dlopen, FFIType, ptr, toArrayBuffer, type Pointer } from "bun:ffi";
import { randomBytes } from "node:crypto";
import { constants as fsConstants, type Stats } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  applicationCredentialsSchema,
  type NexusApplicationCredentials,
} from "./contracts.ts";

// v2 starts from a clean ACL after the pre-release companion used an unstable
// linker-generated code identity. Release builds now carry one explicit,
// version-independent designated requirement so later updates keep access.
const productionKeychainService = "io.convax.nexus-service.v2";
const keychainAccount = "application-access";
const maximumCredentialBytes = 32 * 1024;
const localCredentialFileName = "authx-refresh-credential.json";
const errSecDuplicateItem = -25_299;
const errSecItemNotFound = -25_300;
const securityFrameworkPath =
  "/System/Library/Frameworks/Security.framework/Security";
const coreFoundationFrameworkPath =
  "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";

export interface NexusCredentialStore {
  clear(): Promise<void>;
  read(): Promise<NexusApplicationCredentials | null>;
  write(credentials: NexusApplicationCredentials): Promise<void>;
}

export class MacOsKeychainCredentialStore implements NexusCredentialStore {
  readonly #keychainService: string;

  constructor(
    private readonly environment: Readonly<
      Record<string, string | undefined>
    > = process.env,
    private readonly keychain: MacOsKeychainPort = nativeMacOsKeychain,
    platform: NodeJS.Platform = process.platform,
  ) {
    if (platform !== "darwin") {
      throw new Error("The Nexus production credential store requires macOS");
    }
    this.#keychainService = keychainService(environment);
  }

  async read(): Promise<NexusApplicationCredentials | null> {
    await clearLegacyRefreshGrant(this.environment);
    const serialized = await this.keychain.read(
      keychainAccount,
      this.#keychainService,
    );
    if (serialized === null) return null;
    if (isRetiredApplicationCredential(serialized)) {
      await this.keychain.clear(keychainAccount, this.#keychainService);
      return null;
    }
    return parseCredentials(serialized);
  }

  async write(credentials: NexusApplicationCredentials): Promise<void> {
    const serialized = serializeCredentials(credentials);
    await this.keychain.write(
      keychainAccount,
      this.#keychainService,
      serialized,
    );
  }

  async clear(): Promise<void> {
    await clearLegacyRefreshGrant(this.environment);
    await this.keychain.clear(keychainAccount, this.#keychainService);
  }
}

function keychainService(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const configured = environment.CONVAX_NEXUS_KEYCHAIN_SERVICE;
  if (configured === undefined) return productionKeychainService;
  if (
    environment.CONVAX_NEXUS_LOCAL_DEVELOPMENT !== "1" ||
    !/^io\.convax\.nexus-service\.local-[a-f0-9]{16}$/u.test(configured)
  ) {
    throw new Error("Nexus Keychain service override is invalid");
  }
  return configured;
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

export class LocalDevelopmentCredentialStore
  implements NexusCredentialStore
{
  readonly path: string;
  readonly #directory: string;
  readonly #environment: Readonly<Record<string, string | undefined>>;

  constructor(
    environment: Readonly<Record<string, string | undefined>> = process.env,
  ) {
    if (environment.CONVAX_NEXUS_LOCAL_DEVELOPMENT !== "1") {
      throw new Error(
        "The Nexus file credential store is limited to local development",
      );
    }
    this.#environment = environment;
    const root = configRoot(environment);
    this.#directory = path.join(root, "convax", "nexus-service");
    this.path = path.join(this.#directory, localCredentialFileName);
  }

  async read(): Promise<NexusApplicationCredentials | null> {
    await clearLegacyRefreshGrant(this.#environment);
    let metadata: Stats;
    try {
      metadata = await fs.lstat(this.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("Nexus local credentials could not be inspected");
    }
    assertPrivateCredentialFile(metadata);
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
      throw new Error("Nexus local credentials changed while reading");
    }
    if (serialized.byteLength > maximumCredentialBytes) {
      throw new Error("Nexus local credentials are too large");
    }
    let value: string;
    try {
      value = new TextDecoder("utf-8", { fatal: true }).decode(serialized);
    } catch {
      throw new Error("Nexus local credentials are invalid");
    }
    if (isRetiredApplicationCredential(value, "Nexus local credentials")) {
      await this.clear();
      return null;
    }
    return parseCredentials(value, "Nexus local credentials");
  }

  async write(credentials: NexusApplicationCredentials): Promise<void> {
    const serialized = `${serializeCredentials(credentials)}\n`;
    await ensurePrivateLocalDirectory(this.#environment);
    const temporary = path.join(
      this.#directory,
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
      assertPrivateCredentialFile(metadata);
    } catch {
      throw new Error("Nexus local credentials could not be stored");
    } finally {
      await handle?.close().catch(() => undefined);
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  async clear(): Promise<void> {
    try {
      const metadata = await fs.lstat(this.path);
      assertPrivateCredentialFile(metadata);
      await fs.rm(this.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

export interface MacOsKeychainPort {
  clear(account: string, service: string): Promise<void>;
  read(account: string, service: string): Promise<string | null>;
  write(account: string, service: string, value: string): Promise<void>;
}

let nativeFrameworks: ReturnType<typeof loadNativeFrameworks> | undefined;

const nativeMacOsKeychain: MacOsKeychainPort = {
  async clear(account, service) {
    const item = findItemReference(account, service);
    if (item === null) return;
    const { coreFoundation, security } = frameworks();
    try {
      const status = security.symbols.SecKeychainItemDelete(item);
      if (status !== 0) {
        throw new Error("Nexus credentials could not be removed from Keychain");
      }
    } finally {
      coreFoundation.symbols.CFRelease(item);
    }
  },
  async read(account, service) {
    const accountBytes = Buffer.from(account, "utf8");
    const serviceBytes = Buffer.from(service, "utf8");
    const length = new Uint32Array(1);
    const data = new BigUint64Array(1);
    const { security } = frameworks();
    const status = security.symbols.SecKeychainFindGenericPassword(
      null,
      serviceBytes.length,
      ptr(serviceBytes),
      accountBytes.length,
      ptr(accountBytes),
      ptr(length),
      ptr(data),
      null,
    );
    if (status === errSecItemNotFound) return null;
    const byteLength = length[0] ?? 0;
    const dataAddress = data[0] ?? 0n;
    if (
      status !== 0 ||
      byteLength === 0 ||
      byteLength > maximumCredentialBytes ||
      dataAddress === 0n
    ) {
      throw new Error("Nexus credentials could not be read from Keychain");
    }
    const dataPointer = Number(dataAddress) as Pointer;
    try {
      const copied = Uint8Array.from(
        new Uint8Array(toArrayBuffer(dataPointer, 0, byteLength)),
      );
      return Buffer.from(copied).toString("utf8");
    } finally {
      const released = security.symbols.SecKeychainItemFreeContent(
        null,
        dataPointer,
      );
      if (released !== 0) {
        throw new Error("Nexus credentials could not be read from Keychain");
      }
    }
  },
  async write(account, service, value) {
    const accountBytes = Buffer.from(account, "utf8");
    const serviceBytes = Buffer.from(service, "utf8");
    const valueBytes = Buffer.from(value, "utf8");
    const { coreFoundation, security } = frameworks();
    const status = security.symbols.SecKeychainAddGenericPassword(
      null,
      serviceBytes.length,
      ptr(serviceBytes),
      accountBytes.length,
      ptr(accountBytes),
      valueBytes.length,
      ptr(valueBytes),
      null,
    );
    if (status === 0) return;
    if (status !== errSecDuplicateItem) {
      throw new Error("Nexus credentials could not be stored in Keychain");
    }
    const item = findItemReference(account, service);
    if (item === null) {
      throw new Error("Nexus credentials could not be stored in Keychain");
    }
    try {
      const updated = security.symbols.SecKeychainItemModifyAttributesAndData(
        item,
        null,
        valueBytes.length,
        ptr(valueBytes),
      );
      if (updated !== 0) {
        throw new Error("Nexus credentials could not be stored in Keychain");
      }
    } finally {
      coreFoundation.symbols.CFRelease(item);
    }
  },
};

function findItemReference(account: string, service: string): Pointer | null {
  const accountBytes = Buffer.from(account, "utf8");
  const serviceBytes = Buffer.from(service, "utf8");
  const item = new BigUint64Array(1);
  const { security } = frameworks();
  const status = security.symbols.SecKeychainFindGenericPassword(
    null,
    serviceBytes.length,
    ptr(serviceBytes),
    accountBytes.length,
    ptr(accountBytes),
    null,
    null,
    ptr(item),
  );
  if (status === errSecItemNotFound) return null;
  if (status !== 0 || item[0] === 0n) {
    throw new Error("Nexus credentials could not be accessed in Keychain");
  }
  return Number(item[0]) as Pointer;
}

function frameworks() {
  nativeFrameworks ??= loadNativeFrameworks();
  return nativeFrameworks;
}

function loadNativeFrameworks() {
  const security = dlopen(securityFrameworkPath, {
    SecKeychainAddGenericPassword: {
      args: [
        FFIType.ptr,
        FFIType.u32,
        FFIType.ptr,
        FFIType.u32,
        FFIType.ptr,
        FFIType.u32,
        FFIType.ptr,
        FFIType.ptr,
      ],
      returns: FFIType.i32,
    },
    SecKeychainFindGenericPassword: {
      args: [
        FFIType.ptr,
        FFIType.u32,
        FFIType.ptr,
        FFIType.u32,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
      ],
      returns: FFIType.i32,
    },
    SecKeychainItemDelete: {
      args: [FFIType.ptr],
      returns: FFIType.i32,
    },
    SecKeychainItemFreeContent: {
      args: [FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
    SecKeychainItemModifyAttributesAndData: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.ptr],
      returns: FFIType.i32,
    },
  });
  const coreFoundation = dlopen(coreFoundationFrameworkPath, {
    CFRelease: {
      args: [FFIType.ptr],
      returns: FFIType.void,
    },
  });
  return { coreFoundation, security };
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
  label = "Nexus Keychain item",
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
  label = "Nexus Keychain item",
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
  return path.join(environment.HOME || os.homedir(), ".config");
}

async function ensurePrivateLocalDirectory(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const root = configRoot(environment);
  const convaxDirectory = path.join(root, "convax");
  const nexusDirectory = path.join(convaxDirectory, "nexus-service");
  for (const directory of [convaxDirectory, nexusDirectory]) {
    await fs.mkdir(directory, { mode: 0o700, recursive: true });
    const metadata = await fs.lstat(directory);
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      metadata.nlink < 1
    ) {
      throw new Error("Nexus local credential directory is unsafe");
    }
    await fs.chmod(directory, 0o700);
  }
}

function assertPrivateCredentialFile(metadata: Stats) {
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.nlink !== 1 ||
    (metadata.mode & 0o077) !== 0 ||
    metadata.size < 1 ||
    metadata.size > maximumCredentialBytes
  ) {
    throw new Error("Nexus local credentials must be a private regular file");
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
  return new MacOsKeychainCredentialStore(environment);
}

export function createCredentialStore(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return environment.CONVAX_NEXUS_LOCAL_DEVELOPMENT === "1"
    ? new LocalDevelopmentCredentialStore(environment)
    : createProductionCredentialStore(environment);
}
