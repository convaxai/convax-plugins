import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
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
    expect(serializedMetadata).not.toContain(credentials.inferenceKey);
    expect(calls[0]?.value).toContain(credentials.refreshToken);
    expect(calls[0]?.value).toContain(credentials.inferenceKey);

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

  test.skipIf(process.platform !== "darwin")(
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
        inferenceKey: `nxs_test_${"i".repeat(4_096)}`,
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
});

function fixtureCredentials(): NexusApplicationCredentials {
  return {
    accountBinding: "a".repeat(64),
    authxIssuer: "http://localhost:3100",
    bindingId: "application-binding-fixed",
    gatewayBaseUrl:
      "http://localhost:4000/api/v1/gateway/providers/provider-fixed",
    inferenceKey: "nxs_test_inference_key_with_sufficient_length",
    nexusOrigin: "http://localhost:3000",
    providerConnectionId: "provider-fixed",
    refreshToken: "authx_rotating_refresh_with_sufficient_length",
    schema: "convax.nexus-application-credentials/1",
  };
}
