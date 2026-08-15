import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveNexusLocalDevelopmentEnvironment } from "../src/local-development-config.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("Nexus local development configuration", () => {
  test("loads only a private digest-bound profile and loopback origins through XDG_CONFIG_HOME", async () => {
    const fixture = await localFixture();
    const environment = resolveNexusLocalDevelopmentEnvironment({
      HOME: fixture.root,
      XDG_CONFIG_HOME: fixture.configRoot,
    });

    expect(environment).toMatchObject({
      CONVAX_AUTHX_PUBLIC_CLIENT_PROFILE: fixture.profilePath,
      CONVAX_NEXUS_GATEWAY_ORIGIN: "http://127.0.0.1:18202",
      CONVAX_NEXUS_KEYCHAIN_SERVICE:
        "io.convax.nexus-service.local-c0ffee1234abcdef",
      CONVAX_NEXUS_LOCAL_DEVELOPMENT: "1",
      CONVAX_NEXUS_ORIGIN: "http://127.0.0.1:18201",
      XDG_CONFIG_HOME: fixture.configRoot,
    });
    expect(JSON.stringify(environment)).not.toContain("workspace");
    expect(JSON.stringify(environment)).not.toContain("providerConnection");
    expect(JSON.stringify(environment)).not.toContain("credential");
  });

  test("does not discover local development configuration through HOME", async () => {
    const fixture = await localFixture();
    await fs.rename(
      fixture.configRoot,
      path.join(fixture.root, ".config"),
    );
    const input = Object.freeze({ HOME: fixture.root });

    expect(resolveNexusLocalDevelopmentEnvironment(input)).toBe(input);
  });

  test("fails closed on profile drift, public permissions, unknown fields, and non-loopback origins", async () => {
    const drift = await localFixture();
    await fs.writeFile(drift.profilePath, "{}\n", { mode: 0o600 });
    expect(() =>
      resolveNexusLocalDevelopmentEnvironment({
        XDG_CONFIG_HOME: drift.configRoot,
      }),
    ).toThrow("digest");

    const permissions = await localFixture();
    await fs.chmod(permissions.configPath, 0o644);
    expect(() =>
      resolveNexusLocalDevelopmentEnvironment({
        XDG_CONFIG_HOME: permissions.configRoot,
      }),
    ).toThrow("private");

    const unknown = await localFixture();
    const unknownConfig = JSON.parse(
      await fs.readFile(unknown.configPath, "utf8"),
    );
    unknownConfig.workspaceId = "forbidden";
    await fs.writeFile(
      unknown.configPath,
      `${JSON.stringify(unknownConfig)}\n`,
      { mode: 0o600 },
    );
    expect(() =>
      resolveNexusLocalDevelopmentEnvironment({
        XDG_CONFIG_HOME: unknown.configRoot,
      }),
    ).toThrow("unsupported");

    const remote = await localFixture();
    const remoteConfig = JSON.parse(
      await fs.readFile(remote.configPath, "utf8"),
    );
    remoteConfig.nexusOrigin = "https://nexus.example.test";
    await fs.writeFile(remote.configPath, `${JSON.stringify(remoteConfig)}\n`, {
      mode: 0o600,
    });
    expect(() =>
      resolveNexusLocalDevelopmentEnvironment({
        XDG_CONFIG_HOME: remote.configRoot,
      }),
    ).toThrow("loopback");
  });
});

async function localFixture() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "convax-nexus-local-config-"),
  );
  roots.push(root);
  const configRoot = path.join(root, "config");
  const profilePath = path.join(root, "profile.json");
  const profileBytes = Buffer.from('{"schema":"public-profile"}\n');
  await fs.writeFile(profilePath, profileBytes, { mode: 0o600 });
  const directory = path.join(configRoot, "convax", "nexus-service");
  await fs.mkdir(directory, { mode: 0o700, recursive: true });
  const configPath = path.join(directory, "local-development.json");
  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      authxPublicClientProfile: profilePath,
      authxPublicClientProfileSha256: createHash("sha256")
        .update(profileBytes)
        .digest("hex"),
      gatewayOrigin: "http://127.0.0.1:18202",
      keychainService: "io.convax.nexus-service.local-c0ffee1234abcdef",
      nexusOrigin: "http://127.0.0.1:18201",
      schema: "convax.nexus-local-development/1",
    })}\n`,
    { mode: 0o600 },
  );
  return { configPath, configRoot, profilePath, root };
}
