import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const localDevelopmentConfigSchema =
  "convax.nexus-local-development/1" as const;
const maximumConfigBytes = 64 * 1024;

export function resolveNexusLocalDevelopmentEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Readonly<Record<string, string | undefined>> {
  if (hasExplicitLocalConfiguration(environment)) return environment;
  const configRoot = configuredRoot(environment);
  const configPath = path.join(
    configRoot,
    "convax",
    "nexus-service",
    "local-development.json",
  );
  let metadata: fs.Stats;
  try {
    metadata = fs.lstatSync(configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return environment;
    throw new Error(
      "Nexus local development configuration could not be inspected",
    );
  }
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.nlink !== 1 ||
    (metadata.mode & 0o077) !== 0 ||
    metadata.size < 1 ||
    metadata.size > maximumConfigBytes
  ) {
    throw new Error(
      "Nexus local development configuration must be a private regular file",
    );
  }
  const serialized = fs.readFileSync(configPath);
  const after = fs.lstatSync(configPath);
  if (
    after.dev !== metadata.dev ||
    after.ino !== metadata.ino ||
    after.size !== metadata.size ||
    after.mtimeMs !== metadata.mtimeMs ||
    after.ctimeMs !== metadata.ctimeMs ||
    after.nlink !== 1
  ) {
    throw new Error(
      "Nexus local development configuration changed while reading",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized.toString("utf8"));
  } catch {
    throw new Error("Nexus local development configuration is invalid");
  }
  const config = parseLocalDevelopmentConfig(parsed);
  const profileMetadata = fs.lstatSync(config.authxPublicClientProfile);
  if (
    !profileMetadata.isFile() ||
    profileMetadata.isSymbolicLink() ||
    profileMetadata.nlink !== 1 ||
    (profileMetadata.mode & 0o077) !== 0 ||
    profileMetadata.size < 1 ||
    profileMetadata.size > maximumConfigBytes
  ) {
    throw new Error("Nexus local AuthX profile must be a private regular file");
  }
  const profileBytes = fs.readFileSync(config.authxPublicClientProfile);
  if (
    createHash("sha256").update(profileBytes).digest("hex") !==
    config.authxPublicClientProfileSha256
  ) {
    throw new Error("Nexus local AuthX profile digest does not match");
  }
  return Object.freeze({
    ...environment,
    CONVAX_AUTHX_PUBLIC_CLIENT_PROFILE: config.authxPublicClientProfile,
    CONVAX_NEXUS_GATEWAY_ORIGIN: config.gatewayOrigin,
    CONVAX_NEXUS_KEYCHAIN_SERVICE: config.keychainService,
    CONVAX_NEXUS_LOCAL_DEVELOPMENT: "1",
    CONVAX_NEXUS_ORIGIN: config.nexusOrigin,
  });
}

function configuredRoot(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const configured = environment.XDG_CONFIG_HOME;
  if (configured !== undefined) {
    if (!path.isAbsolute(configured)) {
      throw new Error("XDG_CONFIG_HOME must be absolute");
    }
    return configured;
  }
  return path.join(environment.HOME || os.homedir(), ".config");
}

function hasExplicitLocalConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
) {
  return [
    "CONVAX_AUTHX_PUBLIC_CLIENT_PROFILE",
    "CONVAX_NEXUS_GATEWAY_ORIGIN",
    "CONVAX_NEXUS_LOCAL_DEVELOPMENT",
    "CONVAX_NEXUS_ORIGIN",
  ].some((name) => environment[name] !== undefined);
}

function parseLocalDevelopmentConfig(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Nexus local development configuration is invalid");
  }
  exactKeys(value, [
    "authxPublicClientProfile",
    "authxPublicClientProfileSha256",
    "gatewayOrigin",
    "keychainService",
    "nexusOrigin",
    "schema",
  ]);
  if (
    value.schema !== localDevelopmentConfigSchema ||
    typeof value.authxPublicClientProfile !== "string" ||
    !path.isAbsolute(value.authxPublicClientProfile) ||
    typeof value.authxPublicClientProfileSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.authxPublicClientProfileSha256) ||
    typeof value.gatewayOrigin !== "string" ||
    typeof value.keychainService !== "string" ||
    !/^io\.convax\.nexus-service\.local-[a-f0-9]{16}$/u.test(
      value.keychainService,
    ) ||
    typeof value.nexusOrigin !== "string"
  ) {
    throw new Error("Nexus local development configuration is invalid");
  }
  return {
    authxPublicClientProfile: value.authxPublicClientProfile,
    authxPublicClientProfileSha256: value.authxPublicClientProfileSha256,
    gatewayOrigin: loopbackOrigin(value.gatewayOrigin, "Nexus Gateway origin"),
    keychainService: value.keychainService,
    nexusOrigin: loopbackOrigin(value.nexusOrigin, "Nexus origin"),
    schema: localDevelopmentConfigSchema,
  };
}

function loopbackOrigin(value: string, label: string) {
  const url = new URL(value);
  if (
    url.href !== `${url.origin}/` ||
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} must be an exact loopback HTTP origin`);
  }
  return url.origin;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(
      "Nexus local development configuration has unsupported or missing fields",
    );
  }
}
