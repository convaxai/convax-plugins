import { describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import { root } from "./lib.mjs"
import { createVendoredHostPackageClosure } from "./vendored-host-package-closure.mjs"

const commit = "0123456789abcdef0123456789abcdef01234567"

async function createFixture() {
  const fixture = await fs.mkdtemp(
    path.join(os.tmpdir(), "convax-vendored-host-"),
  )
  await Promise.all([
    fs.copyFile(path.join(root, "package.json"), path.join(fixture, "package.json")),
    fs.copyFile(path.join(root, "bun.lock"), path.join(fixture, "bun.lock")),
    fs.cp(
      path.join(root, "vendor"),
      path.join(fixture, "vendor"),
      {
        filter: (source) => path.basename(source) !== "node_modules",
        recursive: true,
      },
    ),
  ])
  const bindings = [
    ["node_modules/@convax/marketplace-kit", "marketplace-kit"],
    ["node_modules/@convax/plugin-api", "plugin-api"],
    ["node_modules/@convax/plugin-sdk", "plugin-sdk"],
    ["node_modules/@convax/plugin-ui", "plugin-ui"],
    [
      "vendor/host-packages/marketplace-kit/node_modules/@convax/marketplace",
      "marketplace",
    ],
    [
      "vendor/host-packages/marketplace-kit/node_modules/@convax/plugin-api",
      "plugin-api",
    ],
    [
      "vendor/host-packages/marketplace-kit/node_modules/@convax/plugin-sdk",
      "plugin-sdk",
    ],
    [
      "vendor/host-packages/plugin-sdk/node_modules/@convax/plugin-api",
      "plugin-api",
    ],
  ]
  for (const [installedPath, directory] of bindings) {
    const absolutePath = path.join(fixture, installedPath)
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.symlink(
      path.relative(
        path.dirname(absolutePath),
        path.join(fixture, "vendor", "host-packages", directory),
      ),
      absolutePath,
    )
  }
  return fixture
}

describe("vendored Host package publication closure", () => {
  test("binds the frozen workspace graph, installed paths, Catalog, and bytes", async () => {
    const closure = await createVendoredHostPackageClosure(root, { commit })
    expect(closure).toEqual(
      expect.objectContaining({
        schema: "convax.vendored-host-package-closure/1",
        source: {
          commit,
          kind: "workspace",
          repository: "microvoid/convax-plugins",
        },
        catalog: expect.objectContaining({
          schema: "convax.plugin-api-catalog/3",
          version: "2.0.0",
        }),
      }),
    )
    expect(closure.packages.map(({ name, version }) => `${name}@${version}`))
      .toEqual([
        "@convax/marketplace@0.2.1",
        "@convax/marketplace-kit@0.2.1",
        "@convax/plugin-api@2.0.0",
        "@convax/plugin-sdk@0.1.1",
        "@convax/plugin-ui@0.1.0",
      ])
    for (const item of closure.packages) {
      expect(item.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(item.files).toBeGreaterThan(0)
      expect(item.bytes).toBeGreaterThan(0)
    }
  })

  test("rejects lock drift and symlinks in admitted package bytes", async () => {
    const fixture = await createFixture()
    try {
      await expect(
        createVendoredHostPackageClosure(fixture, { commit }),
      ).resolves.toMatchObject({
        schema: "convax.vendored-host-package-closure/1",
      })

      const lockPath = path.join(fixture, "bun.lock")
      const lock = await fs.readFile(lockPath, "utf8")
      await fs.writeFile(
        lockPath,
        lock.replace(
          "@convax/plugin-sdk@workspace:vendor/host-packages/plugin-sdk",
          "@convax/plugin-sdk@workspace:vendor/host-packages/plugin-api",
        ),
      )
      await expect(
        createVendoredHostPackageClosure(fixture, { commit }),
      ).rejects.toThrow("must resolve @convax/plugin-sdk")

      await fs.writeFile(lockPath, lock)
      const target = path.join(
        fixture,
        "vendor",
        "host-packages",
        "plugin-sdk",
        "dist",
        "index.js",
      )
      const linked = `${target}.linked`
      await fs.rename(target, linked)
      await fs.symlink(path.basename(linked), target)
      await expect(
        createVendoredHostPackageClosure(fixture, { commit }),
      ).rejects.toThrow("must not be a symbolic link")
    } finally {
      await fs.rm(fixture, { force: true, recursive: true })
    }
  })
})
