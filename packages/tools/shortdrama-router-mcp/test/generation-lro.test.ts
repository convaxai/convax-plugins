import { afterEach, describe, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { VideoJob } from "shortdrama-router"

import { GenerationEngine } from "../src/generation.ts"
import { GenerationOperationJournal } from "../src/generation-journal.ts"
import { ShortDramaGenerationLro } from "../src/generation-lro.ts"
import { fakeRouter, job, providerModel } from "./fakes.ts"

const temporaryDirectories: string[] = []
const mp4Bytes = new Uint8Array([
  0,
  0,
  0,
  16,
  0x66,
  0x74,
  0x79,
  0x70,
  0x69,
  0x73,
  0x6f,
  0x6d,
])

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true })),
  )
})

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shortdrama-lro-"))
  temporaryDirectories.push(directory)
  return directory
}

describe("short-drama generation recovery", () => {
  test("reattaches a submitted video after companion restart without resubmitting", async () => {
    const root = await temporaryDirectory()
    const lroDirectory = path.join(root, "lro")
    const initialOutput = path.join(root, "initial-output")
    const replayOutput = path.join(root, "replay-output")
    await mkdir(lroDirectory, { mode: 0o700 })
    await chmod(lroDirectory, 0o700)
    await mkdir(initialOutput)
    await mkdir(replayOutput)

    let submissions = 0
    let observations = 0
    const router = fakeRouter({
      async createVideo() {
        submissions += 1
        return job("video", "queued") as VideoJob
      },
      async getVideo() {
        observations += 1
        return job("video", "completed", [
          { content_type: "video/mp4", url: "https://cdn.example/video" },
        ]) as VideoJob
      },
      async listProviderModels() {
        return [providerModel("xiaoyunque", "video", "xiaoyunque/seedance-2.5", {
          constraints: {
            duration: { kind: "range", max: 60, min: 1, step: 1 },
          },
          durations: null,
        })]
      },
    })
    let markSubmitted!: (taskId: string) => void
    const submitted = new Promise<string>((resolve) => {
      markSubmitted = resolve
    })
    const firstEngine = new GenerationEngine("xiaoyunque", router, {
      pollIntervalMs: 0,
      async sleep(_milliseconds, signal) {
        await new Promise<void>((_resolve, reject) => {
          const onAbort = () => reject(new DOMException("restart", "AbortError"))
          signal.addEventListener("abort", onAbort, { once: true })
          if (signal.aborted) onAbort()
        })
      },
    })
    const request = {
      operationId: "operation-restart-1",
      requestDigest: "a".repeat(64),
      schema: "convax.generation-lro-request/1" as const,
    }
    const call = {
      duration: 5,
      model: "xiaoyunque/seedance-2.5",
      operation_id: request.operationId,
      output: "video",
      output_directory: initialOutput,
      prompt: "A cat fishing beside a quiet pond",
      references: [],
      schema: "convax.generation-call/1",
    }
    const firstJournal = new GenerationOperationJournal(
      "xiaoyunque",
      lroDirectory,
    )
    const firstLro = new ShortDramaGenerationLro(
      "xiaoyunque",
      firstEngine,
      router,
      firstJournal,
    )
    const controller = new AbortController()
    const interrupted = firstLro.start(
      "video",
      call,
      request,
      controller.signal,
      markSubmitted,
    )
    const taskId = await submitted
    controller.abort("Convax restarted")

    await expect(interrupted).rejects.toMatchObject({ name: "AbortError" })
    expect(submissions).toBe(1)
    expect((await firstLro.get({ ...request, taskId }))).toMatchObject({
      status: "submitted",
      taskId,
    })

    const secondEngine = new GenerationEngine("xiaoyunque", router, {
      async download() {
        return {
          contentLength: mp4Bytes.byteLength,
          contentType: "video/mp4",
          stream: (async function* () {
            yield mp4Bytes
          })(),
        }
      },
      pollIntervalMs: 0,
      async sleep() {},
    })
    const secondLro = new ShortDramaGenerationLro(
      "xiaoyunque",
      secondEngine,
      router,
      new GenerationOperationJournal("xiaoyunque", lroDirectory),
    )
    const terminal = await secondLro.wait(
      { ...request, taskId },
      new AbortController().signal,
    )

    expect(terminal).toMatchObject({ status: "succeeded", taskId })
    expect(submissions).toBe(1)
    expect(observations).toBe(1)
    if (terminal.status !== "succeeded") throw new Error("expected success")
    const replayed = await secondLro.result({
      ...request,
      outputDirectory: replayOutput,
      resultDigest: terminal.resultDigest,
      taskId,
    })
    expect(replayed.resultDigest).toBe(terminal.resultDigest)
    const artifacts = replayed.result.structuredContent?.artifacts as Array<{
      path: string
    }>
    expect(artifacts).toHaveLength(1)
    expect([
      ...await readFile(path.join(replayOutput, artifacts[0]!.path)),
    ]).toEqual([...mp4Bytes])

    await secondLro.acknowledge({
      ...request,
      resultDigest: terminal.resultDigest,
      taskId,
    })
    expect(await secondLro.get(request)).toMatchObject({ status: "absent" })
  })
})
