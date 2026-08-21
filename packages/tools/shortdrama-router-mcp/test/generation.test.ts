import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { ImageCreateRequest, ImageJob, VideoCreateRequest, VideoJob } from "shortdrama-router"

import {
  GenerationEngine,
  LocalMediaReferenceError,
} from "../src/generation.ts"
import { fakeRouter, job, providerModel } from "./fakes.ts"

const temporaryDirectories: string[] = []
const pngBytes = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  1,
  2,
  3,
])
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
  const directory = await mkdtemp(path.join(os.tmpdir(), "shortdrama-generation-"))
  temporaryDirectories.push(directory)
  return directory
}

function imageCall(
  outputDirectory: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    model: "jimeng/image-a",
    operation_id: "operation-1",
    output: "image",
    output_directory: outputDirectory,
    prompt: "A quiet cinematic street",
    references: [],
    schema: "convax.generation-call/1",
    ...overrides,
  }
}

function unreadClosableStream(onClose: () => void): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<Uint8Array>> {
          throw new Error("header validation must not read the response body")
        },
        async return(): Promise<IteratorResult<Uint8Array>> {
          onClose()
          return { done: true, value: undefined }
        },
      }
    },
  }
}

describe("generation engine", () => {
  test("normalizes a XiaoYunque Canvas image operation to one result", async () => {
    const directory = await temporaryDirectory()
    let submitted: ImageCreateRequest | undefined
    let downloads = 0
    const router = fakeRouter({
      async createImage(request) {
        submitted = request
        return job("image", "completed", [1, 2, 3, 4].map((index) => ({
          content_type: "image/png",
          url: `https://cdn.example/result-${index}`,
        }))) as ImageJob
      },
      async listProviderModels() {
        return [providerModel(
          "xiaoyunque",
          "image",
          "xiaoyunque/seedream-5.0-pro",
        )]
      },
    })
    const engine = new GenerationEngine("xiaoyunque", router, {
      async download() {
        downloads += 1
        return {
          contentLength: pngBytes.byteLength,
          contentType: "image/png",
          stream: (async function* () {
            yield pngBytes
          })(),
        }
      },
    })

    const artifacts = await engine.generate("image", imageCall(directory, {
      model: "xiaoyunque/seedream-5.0-pro",
    }), new AbortController().signal)

    expect(submitted?.n).toBe(1)
    expect(artifacts).toHaveLength(1)
    expect(downloads).toBe(1)
  })

  test("submits a valid XiaoYunque video request exactly once", async () => {
    const directory = await temporaryDirectory()
    let submitted: VideoCreateRequest | undefined
    let submissions = 0
    const router = fakeRouter({
      async createVideo(request) {
        submissions += 1
        submitted = request
        return job("video", "completed", [
          { content_type: "video/mp4", url: "https://cdn.example/video" },
        ]) as VideoJob
      },
      async listProviderModels() {
        return [providerModel(
          "xiaoyunque",
          "video",
          "xiaoyunque/seedance-2.5",
          {
            aspect_ratios: ["16:9"],
            constraints: {
              duration: { kind: "range", max: 60, min: 1, step: 1 },
            },
            durations: null,
          },
        )]
      },
    })
    const engine = new GenerationEngine("xiaoyunque", router, {
      async download() {
        return {
          contentLength: mp4Bytes.byteLength,
          contentType: "video/mp4",
          stream: (async function* () {
            yield mp4Bytes
          })(),
        }
      },
    })

    const artifacts = await engine.generate("video", {
      ...imageCall(directory),
      aspect_ratio: "16:9",
      duration: 5,
      model: "xiaoyunque/seedance-2.5",
      output: "video",
    }, new AbortController().signal)

    expect(submissions).toBe(1)
    expect(submitted).toMatchObject({
      aspect_ratio: "16:9",
      duration: 5,
      idempotency_key: "operation-1",
      model: "xiaoyunque/seedance-2.5",
      provider: "xiaoyunque",
    })
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]?.mimeType).toBe("video/mp4")
  })

  test("keeps an accepted job alive across repeated bounded observation failures", async () => {
    const directory = await temporaryDirectory()
    let observations = 0
    let submissions = 0
    let idempotencyKey: string | undefined
    const router = fakeRouter({
      async createImage(request) {
        submissions += 1
        idempotencyKey = request.idempotency_key
        return job("image", "queued") as ImageJob
      },
      async getImage() {
        observations += 1
        if (observations <= 4) throw new Error("temporary private upstream error")
        return job("image", "completed", [
          { content_type: "image/png", url: "https://cdn.example/result" },
        ]) as ImageJob
      },
      async listProviderModels() {
        return [providerModel("jimeng", "image", "jimeng/image-a", {
          aspect_ratios: ["1:1"],
        })]
      },
    })
    const engine = new GenerationEngine("jimeng", router, {
      async download() {
        return {
          contentLength: pngBytes.byteLength,
          contentType: "image/png",
          stream: (async function* () {
            yield pngBytes
          })(),
        }
      },
      pollIntervalMs: 0,
      requestTimeoutMs: 100,
      async sleep() {},
    })

    const artifacts = await engine.generate(
      "image",
      imageCall(directory, { aspect_ratio: "1:1" }),
      new AbortController().signal,
    )

    expect(submissions).toBe(1)
    expect(idempotencyKey).toBe("operation-1")
    expect(observations).toBe(5)
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]!.path).toBe(artifacts[0]!.name)
    expect(path.isAbsolute(artifacts[0]!.path)).toBe(false)
    expect([
      ...await readFile(path.join(directory, artifacts[0]!.path)),
    ]).toEqual([...pngBytes])
  })

  test("does not turn another live submitter into submission_unknown", async () => {
    const directory = await temporaryDirectory()
    let creates = 0
    let gets = 0
    const router = fakeRouter({
      async createImage() {
        creates += 1
        return job("image", creates === 1 ? "submitting" : "queued") as ImageJob
      },
      async getImage() {
        gets += 1
        return job("image", "completed", [
          { content_type: "image/png", url: "https://cdn.example/result" },
        ]) as ImageJob
      },
      async listProviderModels() {
        return [providerModel("jimeng", "image", "jimeng/image-a")]
      },
    })
    const engine = new GenerationEngine("jimeng", router, {
      async download() {
        return {
          contentLength: pngBytes.byteLength,
          contentType: "image/png",
          stream: (async function* () {
            yield pngBytes
          })(),
        }
      },
      now: () => Date.parse("2026-08-18T00:00:01.000Z"),
      pollIntervalMs: 0,
      async sleep() {},
      submittingStaleAfterMs: 60_000,
    })

    await expect(engine.generate(
      "image",
      imageCall(directory),
      new AbortController().signal,
    )).resolves.toHaveLength(1)
    expect(creates).toBe(2)
    expect(gets).toBe(1)
  })

  test("marks only a stale ownerless submitting claim unknown", async () => {
    const directory = await temporaryDirectory()
    let creates = 0
    let gets = 0
    const router = fakeRouter({
      async createImage() {
        creates += 1
        return job("image", "submitting") as ImageJob
      },
      async getImage() {
        gets += 1
        return job("image", "submission_unknown") as ImageJob
      },
      async listProviderModels() {
        return [providerModel("jimeng", "image", "jimeng/image-a")]
      },
    })
    const engine = new GenerationEngine("jimeng", router, {
      now: () => Date.parse("2026-08-18T00:01:00.000Z"),
      pollIntervalMs: 0,
      async sleep() {},
      submittingStaleAfterMs: 1_000,
    })

    await expect(engine.generate(
      "image",
      imageCall(directory),
      new AbortController().signal,
    )).rejects.toMatchObject({ status: "submission_unknown" })
    expect(creates).toBe(1)
    expect(gets).toBe(1)
  })

  test("cancels a non-cooperative accepted-job observation", async () => {
    const directory = await temporaryDirectory()
    const controller = new AbortController()
    let submissions = 0
    let markObservationStarted!: () => void
    const observationStarted = new Promise<void>((resolve) => {
      markObservationStarted = resolve
    })
    const router = fakeRouter({
      async createImage() {
        submissions += 1
        return job("image", "in_progress") as ImageJob
      },
      async getImage() {
        markObservationStarted()
        return new Promise<ImageJob>(() => {})
      },
      async listProviderModels() {
        return [providerModel("jimeng", "image", "jimeng/image-a")]
      },
    })
    const engine = new GenerationEngine("jimeng", router, {
      pollIntervalMs: 0,
      requestTimeoutMs: 100,
      async sleep(_milliseconds, signal) {
        if (signal.aborted) {
          throw new DOMException("cancelled", "AbortError")
        }
      },
    })

    const pending = engine.generate(
      "image",
      imageCall(directory),
      controller.signal,
    )
    await observationStarted
    controller.abort("caller cancelled")

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(submissions).toBe(1)
  })

  test("one cancelled waiter does not cancel a shared operation", async () => {
    const directory = await temporaryDirectory()
    const firstController = new AbortController()
    const secondController = new AbortController()
    let submissions = 0
    let catalogCalls = 0
    let resolveSubmission!: (value: ImageJob) => void
    let markSubmissionStarted!: () => void
    const submissionStarted = new Promise<void>((resolve) => {
      markSubmissionStarted = resolve
    })
    let markSecondCatalogStarted!: () => void
    const secondCatalogStarted = new Promise<void>((resolve) => {
      markSecondCatalogStarted = resolve
    })
    let releaseSecondCatalog!: () => void
    const secondCatalogGate = new Promise<void>((resolve) => {
      releaseSecondCatalog = resolve
    })
    let underlyingAborted = false
    const router = fakeRouter({
      async createImage(_input, signal) {
        submissions += 1
        markSubmissionStarted()
        return new Promise<ImageJob>((resolve, reject) => {
          resolveSubmission = resolve
          signal?.addEventListener("abort", () => {
            underlyingAborted = true
            reject(new DOMException("cancelled", "AbortError"))
          }, { once: true })
        })
      },
      async listProviderModels() {
        catalogCalls += 1
        if (catalogCalls === 2) {
          markSecondCatalogStarted()
          await secondCatalogGate
        }
        return [providerModel("jimeng", "image", "jimeng/image-a")]
      },
    })
    const engine = new GenerationEngine("jimeng", router, {
      async download() {
        return {
          contentLength: pngBytes.byteLength,
          contentType: "image/png",
          stream: (async function* () {
            yield pngBytes
          })(),
        }
      },
      requestTimeoutMs: 1_000,
    })

    const first = engine.generate(
      "image",
      imageCall(directory),
      firstController.signal,
    )
    await submissionStarted
    const second = engine.generate(
      "image",
      imageCall(directory),
      secondController.signal,
    )
    await secondCatalogStarted
    firstController.abort("first waiter cancelled")

    await expect(first).rejects.toMatchObject({ name: "AbortError" })
    expect(underlyingAborted).toBe(false)
    releaseSecondCatalog()
    resolveSubmission(job("image", "completed", [
      { content_type: "image/png", url: "https://cdn.example/shared" },
    ]) as ImageJob)
    const artifacts = await second
    expect(artifacts).toHaveLength(1)
    expect(submissions).toBe(1)
    expect(underlyingAborted).toBe(false)
  })

  test("validates optional parameters against the selected model", async () => {
    const directory = await temporaryDirectory()
    let submitted = false
    const router = fakeRouter({
      async createImage() {
        submitted = true
        return job("image", "queued") as ImageJob
      },
      async listProviderModels() {
        return [
          providerModel("jimeng", "image", "jimeng/image-a", {
            aspect_ratios: ["1:1"],
          }),
          providerModel("jimeng", "image", "jimeng/image-b", {
            aspect_ratios: ["16:9"],
          }),
        ]
      },
    })
    const engine = new GenerationEngine("jimeng", router)

    await expect(engine.generate(
      "image",
      imageCall(directory, { aspect_ratio: "16:9" }),
      new AbortController().signal,
    )).rejects.toThrow("selected model")
    expect(submitted).toBe(false)
  })

  test("validates duration against a normalized range", async () => {
    const directory = await temporaryDirectory()
    let submitted = false
    const router = fakeRouter({
      async createVideo() {
        submitted = true
        return job("video", "queued") as ImageJob
      },
      async listProviderModels() {
        return [providerModel("jimeng", "video", "jimeng/video-model", {
          constraints: {
            duration: { kind: "range", max: 10, min: 2, step: 2 },
          },
          durations: null,
        })]
      },
    })
    const engine = new GenerationEngine("jimeng", router)

    await expect(engine.generate("video", {
      ...imageCall(directory, {
        duration: 5,
        model: "jimeng/video-model",
        output: "video",
      }),
    }, new AbortController().signal)).rejects.toThrow("selected model")
    expect(submitted).toBe(false)
  })

  test("a direct call cannot bypass malformed catalog fail-closed behavior", async () => {
    const directory = await temporaryDirectory()
    let submitted = false
    const router = fakeRouter({
      async createImage() {
        submitted = true
        return job("image", "queued") as ImageJob
      },
      async listProviderModels() {
        return [providerModel("jimeng", "image", "jimeng/image-a", {
          aspect_ratios: ["bad\nratio"],
        })]
      },
    })
    const engine = new GenerationEngine("jimeng", router)

    await expect(engine.generate(
      "image",
      imageCall(directory),
      new AbortController().signal,
    )).rejects.toThrow("capability")
    expect(submitted).toBe(false)
  })

  test("rejects local Canvas references before submitting", async () => {
    const directory = await temporaryDirectory()
    let submitted = false
    const router = fakeRouter({
      async createImage() {
        submitted = true
        return job("image", "queued") as ImageJob
      },
      async listProviderModels() {
        return [providerModel("jimeng", "image", "jimeng/image-a")]
      },
    })
    const engine = new GenerationEngine("jimeng", router)
    const operation = engine.generate(
      "image",
      imageCall(directory, {
        references: [{ kind: "file", path: "/private/source.png" }],
      }),
      new AbortController().signal,
    )

    await expect(operation).rejects.toBeInstanceOf(LocalMediaReferenceError)
    expect(submitted).toBe(false)
  })

  test("removes earlier artifacts when a later video output download fails", async () => {
    const directory = await temporaryDirectory()
    let downloads = 0
    const router = fakeRouter({
      async createVideo() {
        return job("video", "completed", [
          { content_type: "video/mp4", url: "https://cdn.example/one" },
          { content_type: "video/mp4", url: "https://cdn.example/two" },
        ]) as VideoJob
      },
      async listProviderModels() {
        return [providerModel("jimeng", "video", "jimeng/video-a")]
      },
    })
    const engine = new GenerationEngine("jimeng", router, {
      async download() {
        downloads += 1
        if (downloads === 2) throw new Error("download failed")
        return {
          contentLength: mp4Bytes.byteLength,
          contentType: "video/mp4",
          stream: (async function* () {
            yield mp4Bytes
          })(),
        }
      },
    })

    await expect(engine.generate(
      "video",
      imageCall(directory, { model: "jimeng/video-a", output: "video" }),
      new AbortController().signal,
    )).rejects.toThrow()
    expect(await readdir(directory)).toEqual([])
  })

  test("rejects a media type whose bytes have the wrong signature", async () => {
    const directory = await temporaryDirectory()
    const router = fakeRouter({
      async createImage() {
        return job("image", "completed", [
          { content_type: "image/png", url: "https://cdn.example/not-png" },
        ]) as ImageJob
      },
      async listProviderModels() {
        return [providerModel("jimeng", "image", "jimeng/image-a")]
      },
    })
    const engine = new GenerationEngine("jimeng", router, {
      async download() {
        return {
          contentLength: 8,
          contentType: "image/png",
          stream: (async function* () {
            yield new Uint8Array(8).fill(0x41)
          })(),
        }
      },
    })

    await expect(engine.generate(
      "image",
      imageCall(directory),
      new AbortController().signal,
    )).rejects.toThrow("signature")
    expect(await readdir(directory)).toEqual([])
  })

  test("does not publish an unknown or missing media type as a bin file", async () => {
    const directory = await temporaryDirectory()
    const router = fakeRouter({
      async createImage() {
        return job("image", "completed", [
          { url: "https://cdn.example/unknown" },
        ]) as ImageJob
      },
      async listProviderModels() {
        return [providerModel("jimeng", "image", "jimeng/image-a")]
      },
    })
    const engine = new GenerationEngine("jimeng", router, {
      async download() {
        return {
          contentLength: pngBytes.byteLength,
          contentType: "application/octet-stream",
          stream: (async function* () {
            yield pngBytes
          })(),
        }
      },
    })

    await expect(engine.generate(
      "image",
      imageCall(directory),
      new AbortController().signal,
    )).rejects.toThrow("media type is missing")
    expect(await readdir(directory)).toEqual([])
  })

  test("closes an oversized response body before rejecting its headers", async () => {
    const directory = await temporaryDirectory()
    let closes = 0
    const router = fakeRouter({
      async createImage() {
        return job("image", "completed", [
          { content_type: "image/png", url: "https://cdn.example/oversized" },
        ]) as ImageJob
      },
      async listProviderModels() {
        return [providerModel("jimeng", "image", "jimeng/image-a")]
      },
    })
    const engine = new GenerationEngine("jimeng", router, {
      async download() {
        return {
          contentLength: 1024 * 1024 * 1024 + 1,
          contentType: "image/png",
          stream: unreadClosableStream(() => {
            closes += 1
          }),
        }
      },
    })

    await expect(engine.generate(
      "image",
      imageCall(directory),
      new AbortController().signal,
    )).rejects.toThrow("too large")
    expect(closes).toBe(1)
    expect(await readdir(directory)).toEqual([])
  })

  test("closes a response body whose declared and response MIME conflict", async () => {
    const directory = await temporaryDirectory()
    let closes = 0
    const router = fakeRouter({
      async createImage() {
        return job("image", "completed", [
          { content_type: "image/png", url: "https://cdn.example/conflict" },
        ]) as ImageJob
      },
      async listProviderModels() {
        return [providerModel("jimeng", "image", "jimeng/image-a")]
      },
    })
    const engine = new GenerationEngine("jimeng", router, {
      async download() {
        return {
          contentLength: null,
          contentType: "image/jpeg",
          stream: unreadClosableStream(() => {
            closes += 1
          }),
        }
      },
    })

    await expect(engine.generate(
      "image",
      imageCall(directory),
      new AbortController().signal,
    )).rejects.toThrow("media types conflict")
    expect(closes).toBe(1)
    expect(await readdir(directory)).toEqual([])
  })

  test("times out a non-cooperative artifact opener", async () => {
    const directory = await temporaryDirectory()
    const router = fakeRouter({
      async createImage() {
        return job("image", "completed", [
          { content_type: "image/png", url: "https://cdn.example/stalled" },
        ]) as ImageJob
      },
      async listProviderModels() {
        return [providerModel("jimeng", "image", "jimeng/image-a")]
      },
    })
    const engine = new GenerationEngine("jimeng", router, {
      async download() {
        return new Promise(() => {})
      },
      requestTimeoutMs: 5,
    })

    await expect(engine.generate(
      "image",
      imageCall(directory),
      new AbortController().signal,
    )).rejects.toMatchObject({ name: "BoundedCallTimeoutError" })
    expect(await readdir(directory)).toEqual([])
  })

  test("cancels a non-cooperative artifact stream and removes its partial file", async () => {
    const directory = await temporaryDirectory()
    const controller = new AbortController()
    let markNextStarted!: () => void
    const nextStarted = new Promise<void>((resolve) => {
      markNextStarted = resolve
    })
    const router = fakeRouter({
      async createImage() {
        return job("image", "completed", [
          { content_type: "image/png", url: "https://cdn.example/stalled-stream" },
        ]) as ImageJob
      },
      async listProviderModels() {
        return [providerModel("jimeng", "image", "jimeng/image-a")]
      },
    })
    const engine = new GenerationEngine("jimeng", router, {
      async download() {
        return {
          contentLength: null,
          contentType: "image/png",
          stream: {
            [Symbol.asyncIterator]() {
              return {
                next() {
                  markNextStarted()
                  return new Promise<IteratorResult<Uint8Array>>(() => {})
                },
              }
            },
          },
        }
      },
      requestTimeoutMs: 1_000,
    })

    const pending = engine.generate("image", imageCall(directory), controller.signal)
    await nextStarted
    controller.abort("caller cancelled")

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(await readdir(directory)).toEqual([])
  })
})
