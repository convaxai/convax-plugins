import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

test("native release build disables the nondeterministic Mach-O UUID", async () => {
  const source = await readFile(path.join(import.meta.dir, "..", "scripts", "build-release.ts"), "utf8")

  expect(source).toContain('"-Xlinker", "-no_uuid"')
  expect(source).not.toContain("process.pid")
  expect(source).toContain('const temporaryOutput = path.join(outputStagingDirectory, "convax-ffmpeg-mcp")')
})
