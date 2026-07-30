import fs from "node:fs/promises"
import path from "node:path"

import { describe, expect, test } from "bun:test"

const packageRoot = path.resolve(import.meta.dir, "..", "package")
const workspaceRoot = path.resolve(import.meta.dir, "..")

async function read(relativePath: string) {
  return fs.readFile(path.join(packageRoot, ...relativePath.split("/")), "utf8")
}

describe("ChatCut Skill package", () => {
  test("publishes the connected-media import workflow and authorization boundary", async () => {
    const skill = await read("SKILL.md")
    const openAiMetadata = await read("agents/openai.yaml")
    const metadata = JSON.parse(await fs.readFile(path.join(workspaceRoot, "convax-package.json"), "utf8"))
    const packageJson = JSON.parse(await fs.readFile(path.join(workspaceRoot, "package.json"), "utf8"))

    expect(skill).toContain("## Import connected Canvas media")
    expect(skill).toContain("must never trigger this workflow automatically")
    expect(skill).toContain("batches of at most four")
    expect(skill).toContain("convax_plugin_chatcut_import_connected_media")
    expect(skill).toContain("exactly once")
    expect(skill).toContain("ownerNodeId")
    expect(skill).toContain("host-provided opaque `inputKey`")
    expect(skill).toContain("`references[].nodeId`")
    expect(skill).toContain("copy each host-provided `inputKey`")
    expect(skill).toContain("do not interpret it as a")
    expect(skill).toContain("references that are still")
    expect(skill).toContain('action: "create_session"')
    expect(skill).toContain("remote `token`")
    expect(skill).toContain("session_token")
    expect(skill).toContain("Never quote it in prose")
    expect(skill).toContain("edit_item")
    expect(skill).toContain("read_project")
    expect(skill).not.toContain("ask the user to upload it through the ChatCut editor")
    expect(openAiMetadata).toContain("$chatcut")
    expect(openAiMetadata).toContain("connected Canvas media")
    expect(metadata).toMatchObject({
      id: "chatcut",
      ownerPluginId: "chatcut",
      version: "0.3.2",
    })
    expect(packageJson.version).toBe("0.3.2")
  })
})
