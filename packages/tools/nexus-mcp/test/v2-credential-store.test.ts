import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createCredentialStore,
  LocalDevelopmentCredentialStore,
  MacOsKeychainCredentialStore,
  MemoryCredentialStore,
} from "../src/credential-store.ts";
import type { NexusApplicationCredentials } from "../src/contracts.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("Nexus credential stores", () => {
  test("passes serialized credentials only through the Keychain data port", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-keychain-"),
    );
    roots.push(root);
    const calls: Array<{
      account: string;
      operation: "clear" | "read" | "write";
      service: string;
      value?: string;
    }> = [];
    let keychainValue: string | undefined;
    const store = new MacOsKeychainCredentialStore(
      { HOME: root, XDG_CONFIG_HOME: path.join(root, "config") },
      {
        async clear(account, service) {
          calls.push({ account, operation: "clear", service });
          keychainValue = undefined;
        },
        async read(account, service) {
          calls.push({ account, operation: "read", service });
          return keychainValue ?? null;
        },
        async write(account, service, value) {
          calls.push({ account, operation: "write", service, value });
          keychainValue = value;
        },
      },
      "darwin",
    );
    const credentials = fixtureCredentials();

    await store.write(credentials);
    expect(await store.read()).toEqual(credentials);
    const serializedMetadata = JSON.stringify(
      calls.map(({ account, operation, service }) => ({
        account,
        operation,
        service,
      })),
    );
    expect(serializedMetadata).not.toContain(credentials.refreshToken);
    expect(calls.every(({ service }) => service === "io.convax.nexus-service.v2")).toBeTrue();
    expect(calls[0]?.value).toContain(credentials.refreshToken);
    expect(calls[0]?.value).not.toContain("inferenceKey");

    await store.clear();
    expect(await store.read()).toBeNull();
  });

  test("deletes a legacy Hosted Auth grant without returning or migrating it", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-keychain-"),
    );
    roots.push(root);
    const config = path.join(root, "config");
    const legacyPath = path.join(
      config,
      "convax",
      "service-credentials",
      "nexus-service.json",
    );
    await fs.mkdir(path.dirname(legacyPath), { recursive: true });
    await fs.writeFile(
      legacyPath,
      JSON.stringify({
        nexusOrigin: "https://legacy-nexus.invalid",
        refreshToken: "legacy_refresh_token_that_must_never_be_sent",
        schema: "convax.nexus-refresh-grant/1",
        workspaceSlug: "convax",
      }),
      { mode: 0o600 },
    );
    const calls: Array<{ account: string; service: string }> = [];
    const store = new MacOsKeychainCredentialStore(
      { HOME: root, XDG_CONFIG_HOME: config },
      {
        async clear() {},
        async read(account, service) {
          calls.push({ account, service });
          return null;
        },
        async write() {},
      },
      "darwin",
    );

    expect(await store.read()).toBeNull();
    await expect(fs.stat(legacyPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.stringify(calls)).not.toContain(
      "legacy_refresh_token_that_must_never_be_sent",
    );
    expect(calls).toHaveLength(1);
  });

  test("deletes a retired Nexus Inference Key credential without migrating it", async () => {
    const retired = JSON.stringify({
      accountBinding: "a".repeat(64),
      authxIssuer: "http://localhost:3100",
      bindingId: "application-binding-fixed",
      gatewayBaseUrl:
        "http://localhost:4000/api/v1/gateway/providers/provider-fixed",
      inferenceKey: "nxs_retired_secret_that_must_not_be_migrated",
      nexusOrigin: "http://localhost:3000",
      providerConnectionId: "provider-fixed",
      refreshToken: "authx_retired_refresh_that_must_not_be_migrated",
      schema: "convax.nexus-application-credentials/1",
    });
    let cleared = 0;
    const store = new MacOsKeychainCredentialStore(
      {},
      {
        async clear() {
          cleared += 1;
        },
        async read() {
          return retired;
        },
        async write() {},
      },
      "darwin",
    );

    expect(await store.read()).toBeNull();
    expect(cleared).toBe(1);
  });

  test.skipIf(
    process.platform !== "darwin" ||
      process.env.CONVAX_NEXUS_TEST_REAL_KEYCHAIN !== "1",
  )(
    "round-trips a large isolated credential through the real macOS Keychain",
    async () => {
      const service = `io.convax.nexus-service.local-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const environment = {
        CONVAX_NEXUS_KEYCHAIN_SERVICE: service,
        CONVAX_NEXUS_LOCAL_DEVELOPMENT: "1",
      };
      const store = new MacOsKeychainCredentialStore(environment);
      const credentials = {
        ...fixtureCredentials(),
        refreshToken: `authx_test_${"r".repeat(4_096)}`,
      };
      await store.clear();
      try {
        await store.write(credentials);
        expect(await store.read()).toEqual(credentials);
      } finally {
        await store.clear();
      }
      expect(await store.read()).toBeNull();
    },
  );

  test("supports an explicit in-memory test store without changing production defaults", async () => {
    const store = new MemoryCredentialStore();
    const credentials = fixtureCredentials();
    expect(await store.read()).toBeNull();
    await store.write(credentials);
    expect(await store.read()).toEqual(credentials);
    await store.clear();
    expect(await store.read()).toBeNull();
  });

  test("uses a private file only for explicit local development", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-local-credentials-"),
    );
    roots.push(root);
    const environment = {
      CONVAX_NEXUS_LOCAL_DEVELOPMENT: "1",
      XDG_CONFIG_HOME: path.join(root, "config"),
    };
    const store = createCredentialStore(environment);
    expect(store).toBeInstanceOf(LocalDevelopmentCredentialStore);
    const credentials = fixtureCredentials();

    await store.write(credentials);
    expect(await store.read()).toEqual(credentials);
    const credentialPath = (store as LocalDevelopmentCredentialStore).path;
    expect((await fs.lstat(credentialPath)).mode & 0o777).toBe(0o600);
    expect(
      (await fs.lstat(path.dirname(credentialPath))).mode & 0o777,
    ).toBe(0o700);

    await store.clear();
    expect(await store.read()).toBeNull();
    await expect(fs.lstat(credentialPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("fails closed on unsafe local credential files", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-local-credentials-"),
    );
    roots.push(root);
    const environment = {
      CONVAX_NEXUS_LOCAL_DEVELOPMENT: "1",
      XDG_CONFIG_HOME: path.join(root, "config"),
    };
    const store = new LocalDevelopmentCredentialStore(environment);
    await fs.mkdir(path.dirname(store.path), { mode: 0o700, recursive: true });
    const target = path.join(root, "outside.json");
    await fs.writeFile(target, JSON.stringify(fixtureCredentials()), {
      mode: 0o600,
    });
    await fs.symlink(target, store.path);

    await expect(store.read()).rejects.toThrow(
      "Nexus local credentials must be a private regular file",
    );
    await expect(store.clear()).rejects.toThrow(
      "Nexus local credentials must be a private regular file",
    );
    expect(await fs.readFile(target, "utf8")).toContain(
      fixtureCredentials().refreshToken,
    );
  });

  test("keeps production credential selection on the macOS Keychain", () => {
    const store = createCredentialStore({});
    expect(store).toBeInstanceOf(MacOsKeychainCredentialStore);
    expect(
      () => new LocalDevelopmentCredentialStore({}),
    ).toThrow("limited to local development");
  });
});

function fixtureCredentials(): NexusApplicationCredentials {
  return {
    accountBinding: "a".repeat(64),
    authxIssuer: "http://localhost:3100",
    nexusOrigin: "http://localhost:3000",
    refreshToken: "authx_rotating_refresh_with_sufficient_length",
    schema: "convax.nexus-authx-refresh-credential/2",
  };
}
