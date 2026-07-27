import fs from "node:fs/promises"
import path from "node:path"

import { describe, expect, test } from "bun:test"

const root = path.resolve(import.meta.dir, "..")

describe("JianYing Skill package", () => {
  test("keeps Canvas authority in the host and native behavior in the companion", async () => {
    const skill = await fs.readFile(path.join(root, "package", "SKILL.md"), "utf8")
    const metadata = JSON.parse(await fs.readFile(path.join(root, "convax-package.json"), "utf8"))

    expect(metadata).toMatchObject({
      id: "jianying-editor",
      ownerPluginId: "jianying-editor",
      version: "2.0.0",
    })
    expect(skill).toContain("direct incoming")
    expect(skill).toContain("draft.status")
    expect(skill).toContain("draft_token")
    expect(skill).toContain("single-use")
    expect(skill).toContain("fails closed")
    expect(skill).toContain("do not retry")
    expect(skill).toContain("Do not inspect native paths, edit JianYing draft JSON")
  })
})
