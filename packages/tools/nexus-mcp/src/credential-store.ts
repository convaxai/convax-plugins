import { dlopen, FFIType, ptr, toArrayBuffer, type Pointer } from "bun:ffi";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  applicationCredentialsSchema,
  type NexusApplicationCredentials,
} from "./contracts.ts";

const productionKeychainService = "io.convax.nexus-service";
const keychainAccount = "application-access";
const maximumCredentialBytes = 32 * 1024;
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

function parseCredentials(serialized: string): NexusApplicationCredentials {
  if (Buffer.byteLength(serialized, "utf8") > maximumCredentialBytes) {
    throw new Error("Nexus Keychain item is too large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Nexus Keychain item is invalid");
  }
  return validateCredentials(parsed);
}

function isRetiredApplicationCredential(serialized: string): boolean {
  if (Buffer.byteLength(serialized, "utf8") > maximumCredentialBytes) {
    throw new Error("Nexus Keychain item is too large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Nexus Keychain item is invalid");
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
