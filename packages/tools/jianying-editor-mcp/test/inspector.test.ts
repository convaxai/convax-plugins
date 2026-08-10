import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, test } from "bun:test"

import { JianyingDraftInspector, type CommandRunner } from "../src/inspector.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe("JianYing draft inspection", () => {
  test("reports the required platform and recovery action", async () => {
    await expect(new JianyingDraftInspector({ platform: "win32" }).inspect()).resolves.toEqual({
      processIds: [],
      reason: "JianYing import is supported only on macOS. Run Convax and JianYing Pro on the same Mac.",
      status: "unsupported",
    })
  })

  test("accepts one stable open lock under the configured draft root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "jianying-inspector-"))
    roots.push(root)
    const draft = path.join(root, "Demo")
    await fs.mkdir(draft)
    await fs.writeFile(path.join(draft, ".locked"), "")
    await fs.writeFile(path.join(draft, "draft_info.json"), "{}")
    const run: CommandRunner = async (executable) => executable === "/bin/ps"
      ? { exitCode: 0, stderr: "", stdout: " 42 /Applications/JianyingPro.app/Contents/MacOS/VideoFusion-macOS\n" }
      : { exitCode: 0, stderr: "", stdout: `p42\0n${path.join(draft, ".locked")}\0` }

    const result = await new JianyingDraftInspector({
      platform: "darwin",
      roots: [root],
      run,
      sleep: async () => undefined,
    }).inspect()

    expect(result).toEqual({
      draft: { name: "Demo", path: draft, pid: 42 },
      processIds: [42],
      status: "active",
    })
  })

  test("does not guess when two samples disagree", async () => {
    let calls = 0
    const run: CommandRunner = async (executable) => {
      if (executable === "/bin/ps") {
        calls += 1
        return {
          exitCode: 0,
          stderr: "",
          stdout: calls === 1 ? "" : " 42 VideoFusion-macOS\n",
        }
      }
      return { exitCode: 0, stderr: "", stdout: "" }
    }
    const result = await new JianyingDraftInspector({
      platform: "darwin",
      roots: [],
      run,
      sleep: async () => undefined,
    }).inspect()
    expect(result).toMatchObject({ processIds: [42], status: "ambiguous" })
  })

  test("ignores the same-named Framework helper and inspects only the app main process", async () => {
    const inspectedPids: string[] = []
    const run: CommandRunner = async (executable, args) => {
      if (executable === "/bin/ps") {
        return {
          exitCode: 0,
          stderr: "",
          stdout: [
            " 42 /Applications/VideoFusion-macOS.app/Contents/MacOS/VideoFusion-macOS",
            " 43 /Applications/VideoFusion-macOS.app/Contents/Frameworks/VideoFusion-macOS.app/Contents/MacOS/VideoFusion-macOS",
          ].join("\n"),
        }
      }
      inspectedPids.push(args.at(-1)!)
      return { exitCode: 0, stderr: "", stdout: "" }
    }

    const result = await new JianyingDraftInspector({
      platform: "darwin",
      roots: [],
      run,
      sleep: async () => undefined,
    }).inspect()

    expect(result).toEqual({ processIds: [42], status: "no_active_draft" })
    expect(inspectedPids).toEqual(["42", "42"])
  })
})
