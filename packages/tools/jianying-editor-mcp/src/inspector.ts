import { execFile as execFileCallback } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { DraftObservation } from "./contracts.ts"

const executableName = "VideoFusion-macOS"
const contentNames = ["draft_info.json", "draft_content.json"] as const

export interface CommandResult {
  exitCode: number
  stderr: string
  stdout: string
}

export type CommandRunner = (
  executable: string,
  args: readonly string[],
  timeoutMs: number,
  signal?: AbortSignal,
) => Promise<CommandResult>

export function runCommand(
  executable: string,
  args: readonly string[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFileCallback(
      executable,
      [...args],
      { encoding: "utf8", maxBuffer: 1024 * 1024, signal, timeout: timeoutMs },
      (error, stdout, stderr) => {
        const exitCode = error && "code" in error && typeof error.code === "number" ? error.code : error ? 1 : 0
        if (signal?.aborted) return reject(abortReason(signal))
        resolve({ exitCode, stderr, stdout })
      },
    )
  })
}

function abortReason(signal: AbortSignal) {
  return signal.reason instanceof Error ? signal.reason : new DOMException("Operation cancelled", "AbortError")
}

function processIds(stdout: string) {
  const ids: number[] = []
  for (const line of stdout.split(/\r?\n/u)) {
    const match = /^\s*(\d+)\s+(.+?)\s*$/u.exec(line)
    const command = match?.[2]
    if (
      !command ||
      path.basename(command) !== executableName ||
      command.includes("/Contents/Frameworks/")
    ) {
      continue
    }
    const pid = Number(match[1])
    if (Number.isSafeInteger(pid) && pid > 0) ids.push(pid)
  }
  return [...new Set(ids)].sort((left, right) => left - right)
}

function defaultDraftRoots() {
  const home = os.homedir()
  return [
    path.join(home, "Movies", "JianyingPro", "User Data", "Projects", "com.lveditor.draft"),
    path.join(
      home,
      "Library",
      "Containers",
      "com.lemon.lvpro",
      "Data",
      "Movies",
      "JianyingPro",
      "User Data",
      "Projects",
      "com.lveditor.draft",
    ),
  ]
}

function contained(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)
}

function lsofNames(stdout: string) {
  return stdout.split(/\0|\r?\n/u).filter((field) => field.startsWith("n")).map((field) => field.slice(1))
}

async function draftFromLock(
  lockPath: string,
  pid: number,
  roots: readonly string[],
): Promise<DraftObservation["draft"] | undefined> {
  if (path.basename(lockPath) !== ".locked") return undefined
  const draftPath = path.dirname(lockPath)
  if (!roots.some((root) => contained(root, draftPath))) return undefined
  const stat = await fs.lstat(lockPath).catch(() => null)
  if (!stat?.isFile()) return undefined
  const contentFound = await Promise.all(
    contentNames.map((name) => fs.lstat(path.join(draftPath, name)).then((value) => value.isFile(), () => false)),
  )
  if (!contentFound.some(Boolean)) return undefined
  return { name: path.basename(draftPath), path: draftPath, pid }
}

export class JianyingDraftInspector {
  constructor(
    private readonly options: {
      platform?: NodeJS.Platform
      roots?: readonly string[]
      run?: CommandRunner
      sleep?: (milliseconds: number) => Promise<void>
    } = {},
  ) {}

  async inspect(signal?: AbortSignal): Promise<DraftObservation> {
    if ((this.options.platform ?? process.platform) !== "darwin") {
      return {
        processIds: [],
        reason: "JianYing import is supported only on macOS. Run Convax and JianYing Pro on the same Mac.",
        status: "unsupported",
      }
    }
    const first = await this.sample(signal)
    await (this.options.sleep ?? ((milliseconds) => Bun.sleep(milliseconds)))(100)
    if (signal?.aborted) throw abortReason(signal)
    const second = await this.sample(signal)
    if (
      first.status === second.status &&
      first.processIds.join(",") === second.processIds.join(",") &&
      first.draft?.path === second.draft?.path &&
      first.draft?.pid === second.draft?.pid
    ) {
      return second
    }
    return {
      processIds: second.processIds,
      reason: "JianYing draft state changed while it was inspected. Keep one draft open, wait for it to settle, then inspect again.",
      status: "ambiguous",
    }
  }

  private async sample(signal?: AbortSignal): Promise<DraftObservation> {
    const run = this.options.run ?? runCommand
    const ps = await run("/bin/ps", ["-axo", "pid=,comm="], 3_000, signal)
    if (ps.exitCode !== 0) {
      return {
        processIds: [],
        reason: "Could not inspect the JianYing process safely. Confirm JianYing Pro is installed and restart it before retrying.",
        status: "ambiguous",
      }
    }
    const ids = processIds(ps.stdout)
    if (ids.length === 0) return { processIds: [], status: "not_running" }
    const drafts = []
    for (const pid of ids) {
      const opened = await run("/usr/sbin/lsof", ["-F0n", "-p", String(pid)], 3_000, signal)
      if (opened.exitCode !== 0) {
        return {
          processIds: ids,
          reason: "Could not inspect JianYing's open draft safely. Keep one draft open and restart JianYing before retrying.",
          status: "ambiguous",
        }
      }
      for (const name of lsofNames(opened.stdout)) {
        const draft = await draftFromLock(name, pid, this.options.roots ?? defaultDraftRoots())
        if (draft) drafts.push(draft)
      }
    }
    const unique = [...new Map(drafts.map((draft) => [draft.path, draft])).values()]
    if (unique.length === 0) return { processIds: ids, status: "no_active_draft" }
    const draft = unique[0]
    if (unique.length === 1 && draft) return { draft, processIds: ids, status: "active" }
    return {
      processIds: ids,
      reason: "More than one JianYing draft appears active. Close the extra draft windows and inspect again.",
      status: "ambiguous",
    }
  }
}
