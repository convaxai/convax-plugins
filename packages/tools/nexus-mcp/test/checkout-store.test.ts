import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NexusCheckoutStore } from "../src/checkout-store.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("NexusCheckoutStore", () => {
  test("persists a private retry key and reuses it for the same access and Plan", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-nexus-checkout-"),
    );
    roots.push(root);
    const store = new NexusCheckoutStore({ XDG_CONFIG_HOME: root });

    const first = await store.begin(
      "26010000-0000-4000-8000-000000000005",
      "pro",
    );
    const retry = await store.begin(
      "26010000-0000-4000-8000-000000000005",
      "pro",
    );

    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    expect((await fs.stat(store.path)).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(await store.read())).not.toContain("checkout_url");
  });
});
