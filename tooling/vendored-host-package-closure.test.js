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
      "vendor/host-packages/plugin-sdk/node_modules/@convax/bounded-value",
      "bounded-value",
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
          repository: "convaxai/convax-plugins",
        },
        catalog: expect.objectContaining({
          schema: "convax.plugin-api-catalog/3",
          version: "3.0.0",
        }),
      }),
    )
    expect(closure.packages.map(({ name, version }) => `${name}@${version}`))
      .toEqual([
        "@convax/bounded-value@0.1.0",
        "@convax/marketplace@0.2.1",
        "@convax/marketplace-kit@0.2.2",
        "@convax/plugin-api@3.0.0",
        "@convax/plugin-sdk@0.2.0",
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

  test("rejects missing bounded-value main output", async () => {
    const fixture = await createFixture()
    try {
      await fs.rm(
        path.join(
          fixture,
          "vendor",
          "host-packages",
          "bounded-value",
          "dist",
          "index.js",
        ),
      )
      await expect(
        createVendoredHostPackageClosure(fixture, { commit }),
      ).rejects.toThrow(
        "vendor/host-packages/bounded-value package.json main target ./dist/index.js is missing",
      )
    } finally {
      await fs.rm(fixture, { force: true, recursive: true })
    }
  })

  test("rejects missing types, exports, and bin targets", async () => {
    for (const mutation of [
      {
        directory: "bounded-value",
        label:
          "vendor/host-packages/bounded-value package.json types target ./dist/missing.d.ts is missing",
        mutate(manifest) {
          manifest.types = "./dist/missing.d.ts"
        },
      },
      {
        directory: "bounded-value",
        label:
          'vendor/host-packages/bounded-value package.json exports["."]["import"] target ./dist/missing.js is missing',
        mutate(manifest) {
          manifest.exports["."].import = "./dist/missing.js"
        },
      },
      {
        directory: "plugin-api",
        label:
          'vendor/host-packages/plugin-api package.json bin["convax-plugin-api"] target ./dist/missing.js is missing',
        mutate(manifest) {
          manifest.bin["convax-plugin-api"] = "./dist/missing.js"
        },
      },
    ]) {
      const fixture = await createFixture()
      try {
        const manifestPath = path.join(
          fixture,
          "vendor",
          "host-packages",
          mutation.directory,
          "package.json",
        )
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
        mutation.mutate(manifest)
        await fs.writeFile(
          manifestPath,
          `${JSON.stringify(manifest, null, 2)}\n`,
        )
        await expect(
          createVendoredHostPackageClosure(fixture, { commit }),
        ).rejects.toThrow(mutation.label)
      } finally {
        await fs.rm(fixture, { force: true, recursive: true })
      }
    }
  })
})
