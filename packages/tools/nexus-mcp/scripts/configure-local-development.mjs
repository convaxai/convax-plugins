import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const environment = process.env;
if (environment.CONVAX_NEXUS_LOCAL_DEVELOPMENT !== "1") {
  throw new Error("CONVAX_NEXUS_LOCAL_DEVELOPMENT must be exactly 1");
}
const configRoot = requiredAbsolute(
  environment.XDG_CONFIG_HOME,
  "XDG_CONFIG_HOME",
);
const profilePath = requiredAbsolute(
  environment.CONVAX_AUTHX_PUBLIC_CLIENT_PROFILE,
  "CONVAX_AUTHX_PUBLIC_CLIENT_PROFILE",
);
const nexusOrigin = loopbackOrigin(
  environment.CONVAX_NEXUS_ORIGIN,
  "CONVAX_NEXUS_ORIGIN",
);
const gatewayOrigin = loopbackOrigin(
  environment.CONVAX_NEXUS_GATEWAY_ORIGIN,
  "CONVAX_NEXUS_GATEWAY_ORIGIN",
);
const keychainService =
  environment.CONVAX_NEXUS_KEYCHAIN_SERVICE ??
  "io.convax.nexus-service.local-c0ffee1234abcdef";
if (!/^io\.convax\.nexus-service\.local-[a-f0-9]{16}$/u.test(keychainService)) {
  throw new Error("CONVAX_NEXUS_KEYCHAIN_SERVICE is invalid");
}
const profileMetadata = await fs.lstat(profilePath);
if (
  !profileMetadata.isFile() ||
  profileMetadata.isSymbolicLink() ||
  profileMetadata.nlink !== 1 ||
  (profileMetadata.mode & 0o077) !== 0 ||
  profileMetadata.size < 1 ||
  profileMetadata.size > 64 * 1024
) {
  throw new Error("Local AuthX profile must be a private regular file");
}
const profileBytes = await fs.readFile(profilePath);
const config = {
  authxPublicClientProfile: profilePath,
  authxPublicClientProfileSha256: createHash("sha256")
    .update(profileBytes)
    .digest("hex"),
  gatewayOrigin,
  keychainService,
  nexusOrigin,
  schema: "convax.nexus-local-development/1",
};
const directory = path.join(configRoot, "convax", "nexus-service");
const outputPath = path.join(directory, "local-development.json");
await fs.mkdir(directory, { mode: 0o700, recursive: true });
await fs.chmod(configRoot, 0o700);
await fs.chmod(path.join(configRoot, "convax"), 0o700);
await fs.chmod(directory, 0o700);
await fs.writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, {
  mode: 0o600,
});
await fs.chmod(outputPath, 0o600);
console.log(
  JSON.stringify(
    {
      authxPublicClientProfileSha256: config.authxPublicClientProfileSha256,
      gatewayOrigin,
      keychainService,
      nexusOrigin,
      outputPath,
      schema: config.schema,
    },
    null,
    2,
  ),
);

function requiredAbsolute(value, name) {
  if (!value || !path.isAbsolute(value) || value.includes("\0")) {
    throw new Error(`${name} must be an absolute path`);
  }
  return path.normalize(value);
}

function loopbackOrigin(value, name) {
  if (!value) throw new Error(`${name} is required`);
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
    throw new Error(`${name} must be an exact loopback HTTP origin`);
  }
  return url.origin;
}
