import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createCredentialStore,
  LocalDevelopmentCredentialStore,
  MemoryCredentialStore,
  UserDataCredentialStore,
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
  test("stores production credentials in private Convax user data", async () => {
    const root = await temporaryRoot("convax-nexus-user-data-");
    const store = new UserDataCredentialStore(
      { HOME: root, XDG_CONFIG_HOME: path.join(root, "config") },
      "darwin",
      root,
    );
    const credentials = fixtureCredentials();

    expect(store.path).toBe(
      path.join(
        root,
        "Library",
        "Application Support",
        "Convax",
        "nexus-service",
        "authx-refresh-credential.json",
      ),
    );
    expect(await store.read()).toBeNull();
    await store.write(credentials);
    expect(await store.read()).toEqual(credentials);
    expect((await fs.lstat(store.path)).mode & 0o777).toBe(0o600);
    expect((await fs.lstat(path.dirname(store.path))).mode & 0o777).toBe(
      0o700,
    );
    expect(await fs.readFile(store.path, "utf8")).toContain(
      credentials.refreshToken,
    );

    const reloaded = new UserDataCredentialStore(
      { HOME: root, XDG_CONFIG_HOME: path.join(root, "config") },
      "darwin",
      root,
    );
    expect(await reloaded.read()).toEqual(credentials);
    await reloaded.clear();
    expect(await reloaded.read()).toBeNull();
  });

  test("deletes a legacy Hosted Auth grant without returning or migrating it", async () => {
    const root = await temporaryRoot("convax-nexus-legacy-credential-");
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
    const store = new UserDataCredentialStore(
      { HOME: root, XDG_CONFIG_HOME: config },
      "darwin",
      root,
    );

    expect(await store.read()).toBeNull();
    await expect(fs.stat(legacyPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("deletes a retired Nexus Inference Key file without migrating it", async () => {
    const root = await temporaryRoot("convax-nexus-retired-credential-");
    const store = new UserDataCredentialStore({ HOME: root }, "darwin", root);
    await fs.mkdir(path.dirname(store.path), { mode: 0o700, recursive: true });
    await fs.writeFile(
      store.path,
      JSON.stringify({
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
      }),
      { mode: 0o600 },
    );

    expect(await store.read()).toBeNull();
    await expect(fs.stat(store.path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("supports an explicit in-memory test store without changing production defaults", async () => {
    const store = new MemoryCredentialStore();
    const credentials = fixtureCredentials();
    expect(await store.read()).toBeNull();
    await store.write(credentials);
    expect(await store.read()).toEqual(credentials);
    await store.clear();
    expect(await store.read()).toBeNull();
  });

  test("uses the configured private file for explicit local development", async () => {
    const root = await temporaryRoot("convax-nexus-local-credentials-");
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
    expect((await fs.lstat(path.dirname(credentialPath))).mode & 0o777).toBe(
      0o700,
    );

    await store.clear();
    expect(await store.read()).toBeNull();
    await expect(fs.lstat(credentialPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("fails closed on unsafe credential files and directories", async () => {
    const root = await temporaryRoot("convax-nexus-unsafe-credentials-");
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

    const userData = new UserDataCredentialStore(
      { HOME: root },
      "darwin",
      root,
    );
    const outsideDirectory = path.join(root, "outside-directory");
    await fs.mkdir(outsideDirectory, { mode: 0o700 });
    await fs.mkdir(path.dirname(path.dirname(userData.path)), {
      recursive: true,
    });
    await fs.symlink(outsideDirectory, path.dirname(userData.path));
    await expect(userData.write(fixtureCredentials())).rejects.toThrow(
      "Nexus user data credentials directory is unsafe",
    );
    expect(await fs.readdir(outsideDirectory)).toEqual([]);
  });

  test("selects user-data storage for production", async () => {
    if (process.platform !== "darwin") return;
    const root = await temporaryRoot("convax-nexus-production-store-");
    const store = createCredentialStore({ HOME: root });
    expect(store).toBeInstanceOf(UserDataCredentialStore);
    expect(() => new LocalDevelopmentCredentialStore({})).toThrow(
      "requires local development mode",
    );
  });
});

async function temporaryRoot(prefix: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

function fixtureCredentials(): NexusApplicationCredentials {
  return {
    accountBinding: "a".repeat(64),
    authxIssuer: "http://localhost:3100",
    nexusOrigin: "http://localhost:3000",
    refreshToken: "authx_rotating_refresh_with_sufficient_length",
    schema: "convax.nexus-authx-refresh-credential/2",
  };
}
