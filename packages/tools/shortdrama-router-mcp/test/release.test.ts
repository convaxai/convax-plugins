import { describe, expect, test } from "bun:test"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"

import { parseProviderArgument } from "../src/index.ts"
import { thirdPartyNotices } from "../src/third-party-notices.ts"

const packageRoot = path.resolve(import.meta.dir, "..")
const releasePath = path.join(
  packageRoot,
  "dist",
  "darwin-arm64",
  "convax-shortdrama-router-mcp",
)
const buildEnvironment = {
  ...process.env,
  PATH: `${path.dirname(process.execPath)}:${process.env.PATH ?? ""}`,
}

describe("release companion", () => {
  test("requires one static provider selector", () => {
    expect(parseProviderArgument(["--provider=xiaoyunque"])).toBe("xiaoyunque")
    expect(parseProviderArgument(["--provider=libtv"])).toBe("libtv")
    expect(parseProviderArgument(["--provider=jimeng"])).toBe("jimeng")
    expect(() => parseProviderArgument([])).toThrow("Usage")
    expect(() => parseProviderArgument(["--provider=unknown"])).toThrow("Usage")
    expect(() => parseProviderArgument([
      "--provider=jimeng",
      "--provider=libtv",
    ])).toThrow("Usage")
  })

  test("builds an executable app-owned-Bun script with bundled notices", async () => {
    const build = Bun.spawn(
      [process.execPath, "run", "build:release:darwin-arm64"],
      {
        cwd: packageRoot,
        env: buildEnvironment,
        stderr: "pipe",
        stdout: "pipe",
      },
    )
    const exitCode = await build.exited
    const stderr = await new Response(build.stderr).text()
    expect(exitCode, stderr).toBe(0)

    const bytes = await readFile(releasePath, "utf8")
    expect(bytes.startsWith("#!/usr/bin/env convax-bun\n")).toBe(true)
    expect(bytes).toContain(
      "Copyright (c) 2026 shortdrama-router contributors",
    )
    expect((await stat(releasePath)).mode & 0o111).not.toBe(0)

    const notices = Bun.spawn(
      [process.execPath, releasePath, "--third-party-notices"],
      { cwd: packageRoot, stderr: "pipe", stdout: "pipe" },
    )
    const output = await new Response(notices.stdout).text()
    const noticeError = await new Response(notices.stderr).text()
    expect(await notices.exited, noticeError).toBe(0)
    expect(output).toBe(thirdPartyNotices)
  }, 30_000)
})
