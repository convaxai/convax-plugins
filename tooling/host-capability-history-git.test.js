import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  verifyPendingHostCapabilityHistory,
} from "./host-capability-history.mjs"

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

async function writeEmptyPolicy(root) {
  await Promise.all([
    fs.mkdir(path.join(root, "registry"), { recursive: true }),
    fs.mkdir(path.join(root, "docs", "host-capability-requests"), {
      recursive: true,
    }),
  ])
  await Promise.all([
    fs.writeFile(
      path.join(root, "registry", "host-capability-policy.json"),
      `${JSON.stringify({
        schema: "convax.host-capability-policy/1",
        requests: [],
      }, null, 2)}\n`,
    ),
    fs.writeFile(
      path.join(root, "docs", "host-capability-requests", ".gitkeep"),
      "",
    ),
  ])
}

async function commitAll(root, message) {
  git(root, "add", "-A")
  git(root, "commit", "-m", message)
  return git(root, "rev-parse", "HEAD")
}

async function withRepository(run) {
  const fixture = await fs.mkdtemp(
    path.join(os.tmpdir(), "convax-host-governance-git-"),
  )
  try {
    git(fixture, "init", "-b", "main")
    git(fixture, "config", "user.name", "Governance Test")
    git(fixture, "config", "user.email", "governance@example.invalid")
    await run(fixture)
  } finally {
    await fs.rm(fixture, { recursive: true, force: true })
  }
}

describe("protected Host capability history Git boundary", () => {
  test("accepts a missing-policy cutover base and later ancestor commits", async () => {
    await withRepository(async (fixture) => {
      await fs.writeFile(path.join(fixture, "README.md"), "cutover\n")
      const cutoverBase = await commitAll(fixture, "cutover base")
      await writeEmptyPolicy(fixture)
      await commitAll(fixture, "introduce governance")
      await fs.writeFile(path.join(fixture, "README.md"), "cutover\nnext\n")
      await commitAll(fixture, "ordinary descendant")

      await expect(
        verifyPendingHostCapabilityHistory(fixture, cutoverBase),
      ).resolves.toEqual(
        expect.objectContaining({
          baseCommit: cutoverBase,
          retainedRequests: 0,
        }),
      )
    })
  })

  test("rejects an invalid or non-ancestor protected base", async () => {
    await withRepository(async (fixture) => {
      await writeEmptyPolicy(fixture)
      const protectedBase = await commitAll(fixture, "protected base")
      git(fixture, "checkout", "--orphan", "rewritten")
      git(fixture, "rm", "-rf", ".")
      await writeEmptyPolicy(fixture)
      await commitAll(fixture, "force-pushed history")

      await expect(
        verifyPendingHostCapabilityHistory(fixture, protectedBase),
      ).rejects.toThrow()
      await expect(
        verifyPendingHostCapabilityHistory(fixture, "not-a-commit"),
      ).rejects.toThrow("must be one exact commit SHA")
    })
  })

  test("rejects deleting a protected request, policy binding, and declaration", async () => {
    await withRepository(async (fixture) => {
      const requestId = "sdk-owned-pet-surface-client"
      const requestDocument =
        `docs/host-capability-requests/${requestId}.md`
      const sourceRoot = path.resolve(import.meta.dir, "..")
      const source = await fs.readFile(
        path.join(sourceRoot, requestDocument),
        "utf8",
      )
      const currentPolicy = JSON.parse(
        await fs.readFile(
          path.join(sourceRoot, "registry", "host-capability-policy.json"),
          "utf8",
        ),
      )
      const request = currentPolicy.requests.find(
        (item) => item.id === requestId,
      )
      const packagePath = path.join(
        fixture,
        "packages",
        "plugins",
        "convax-pet",
        "package.json",
      )
      await Promise.all([
        fs.mkdir(path.dirname(path.join(fixture, requestDocument)), {
          recursive: true,
        }),
        fs.mkdir(path.dirname(packagePath), { recursive: true }),
        fs.mkdir(path.join(fixture, "registry"), { recursive: true }),
      ])
      await Promise.all([
        fs.writeFile(path.join(fixture, requestDocument), source),
        fs.writeFile(
          path.join(fixture, "registry", "host-capability-policy.json"),
          `${JSON.stringify({
            schema: currentPolicy.schema,
            requests: [request],
          }, null, 2)}\n`,
        ),
        fs.writeFile(
          packagePath,
          `${JSON.stringify({
            name: "@microvoid/convax-pet",
            version: request.affected[0].version,
            "convax.hostCapabilityRequests": [requestId],
          }, null, 2)}\n`,
        ),
      ])
      const protectedBase = await commitAll(fixture, "pending request")

      await Promise.all([
        fs.rm(path.join(fixture, requestDocument)),
        writeEmptyPolicy(fixture),
        fs.writeFile(
          packagePath,
          `${JSON.stringify({
            name: "@microvoid/convax-pet",
            version: request.affected[0].version,
          }, null, 2)}\n`,
        ),
      ])
      await commitAll(fixture, "delete every request trace")

      await expect(
        verifyPendingHostCapabilityHistory(fixture, protectedBase),
      ).rejects.toThrow(
        `pending Host capability request ${requestId} cannot be removed`,
      )
    })
  })

  test("does not misclassify a new Plugin using existing APIs as a Host change request", async () => {
    await withRepository(async (fixture) => {
      await writeEmptyPolicy(fixture)
      const protectedBase = await commitAll(fixture, "protected base")
      const packagePath = path.join(
        fixture,
        "packages",
        "plugins",
        "renamed-copy",
        "package.json",
      )
      await fs.mkdir(path.dirname(packagePath), { recursive: true })
      await fs.writeFile(
        packagePath,
        `${JSON.stringify({
          name: "@microvoid/renamed-copy",
          version: "1.0.0",
        }, null, 2)}\n`,
      )
      await commitAll(fixture, "copy Plugin to a new identity")

      await expect(
        verifyPendingHostCapabilityHistory(fixture, protectedBase),
      ).resolves.toEqual(
        expect.objectContaining({
          baseCommit: protectedBase,
          retainedRequests: 0,
        }),
      )
    })
  })
})
