import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  type CommandRunner,
  MediaToolchainError,
  PathMediaPreparer,
} from "../src/media.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { force: true, recursive: true })))
})

async function fixture(name: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "chatcut-media-test-"))
  temporaryDirectories.push(directory)
  const mediaPath = path.join(directory, name)
  await writeFile(mediaPath, new Uint8Array([1, 2, 3, 4]))
  return { directory, mediaPath }
}

describe("media preparation", () => {
  test("reads bounded PNG dimensions without requiring the external media toolchain", async () => {
    const { directory, mediaPath } = await fixture("source.png")
    const png = new Uint8Array(24)
    png.set([137, 80, 78, 71, 13, 10, 26, 10])
    new DataView(png.buffer).setUint32(16, 1_280, false)
    new DataView(png.buffer).setUint32(20, 720, false)
    await writeFile(mediaPath, png)
    const preparer = new PathMediaPreparer(async () => {
      throw new Error("image preparation must not start an external command")
    }, () => undefined)

    const result = await preparer.prepare({
      kind: "file",
      mime_type: "image/png",
      name: "source.png",
      node_id: "node-one",
      path: mediaPath,
      role: "reference_image",
    }, directory, 1, new AbortController().signal)

    expect(result).toMatchObject({
      assetType: "image",
      contentType: "image/png",
      height: 720,
      width: 1_280,
    })
  })

  test("normalizes video to 30 fps H.264/AAC without exposing commands", async () => {
    const { directory, mediaPath } = await fixture("source.mov")
    const invocations: Array<{ arguments_: readonly string[]; command: string }> = []
    let probes = 0
    const run: CommandRunner = async (command, arguments_) => {
      invocations.push({ arguments_, command })
      if (command.endsWith("ffprobe")) {
        probes += 1
        return JSON.stringify({
          format: { duration: "2.5" },
          streams: [
            { codec_type: "video", height: 720, width: 1280 },
            { channels: 2, codec_type: "audio" },
          ],
        })
      }
      await writeFile(arguments_.at(-1)!, new Uint8Array([1, 2, 3, 4, 5]))
      return ""
    }
    const preparer = new PathMediaPreparer(run, (command) => `/tools/${command}`)

    const result = await preparer.prepare({
      kind: "file",
      mime_type: "video/quicktime",
      name: "source.mov",
      node_id: "node-one",
      path: mediaPath,
      role: "reference_video",
    }, directory, 1, new AbortController().signal)

    expect(probes).toBe(2)
    expect(result).toMatchObject({
      assetType: "video",
      contentType: "video/mp4",
      durationInSeconds: 2.5,
      filename: "source.mp4",
      hasAudioTrack: true,
      height: 720,
      size: 5,
      width: 1280,
    })
    const ffmpeg = invocations.find(({ command }) => command.endsWith("ffmpeg"))!
    expect(ffmpeg.arguments_).toContain("fps=30")
    expect(ffmpeg.arguments_).toContain("libx264")
    expect(ffmpeg.arguments_).toContain("aac")
    expect(ffmpeg.arguments_).not.toContain("-filter_complex")
  })

  test("normalizes audio to Ogg Opus", async () => {
    const { directory, mediaPath } = await fixture("voice.wav")
    let ffmpegArguments: readonly string[] = []
    const run: CommandRunner = async (command, arguments_) => {
      if (command.endsWith("ffprobe")) {
        return JSON.stringify({
          format: { duration: "1" },
          streams: [{ channels: 1, codec_type: "audio" }],
        })
      }
      ffmpegArguments = arguments_
      await writeFile(arguments_.at(-1)!, new Uint8Array([1, 2, 3]))
      return ""
    }
    const preparer = new PathMediaPreparer(run, (command) => `/tools/${command}`)

    const result = await preparer.prepare({
      kind: "file",
      mime_type: "audio/wav",
      name: "voice.wav",
      node_id: "node-one",
      path: mediaPath,
      role: "audio",
    }, directory, 1, new AbortController().signal)

    expect(result).toMatchObject({
      assetType: "audio",
      contentType: "audio/ogg",
      filename: "voice.ogg",
      size: 3,
    })
    expect(ffmpegArguments).toContain("libopus")
    expect(ffmpegArguments).toContain("ogg")
  })

  test("reports a bounded setup error when PATH tools are unavailable", async () => {
    const { directory, mediaPath } = await fixture("source.mp4")
    const preparer = new PathMediaPreparer(async () => "", () => undefined)
    let caught: unknown
    try {
      await preparer.prepare({
        kind: "file",
        mime_type: "video/mp4",
        name: "source.mp4",
        node_id: "node-one",
        path: mediaPath,
        role: "reference_video",
      }, directory, 1, new AbortController().signal)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(MediaToolchainError)
    expect((caught as MediaToolchainError).publicMessage).not.toContain(mediaPath)
  })
})
