import { spawn } from "node:child_process"
import { open, lstat } from "node:fs/promises"
import path from "node:path"
import type { MediaAssetType, MediaReference } from "./contracts.ts"

const maximumInputBytes = 2 * 1024 * 1024 * 1024
const maximumToolOutputBytes = 1024 * 1024

export interface PreparedMedia {
  assetType: MediaAssetType
  contentType: string
  durationInSeconds?: number
  filename: string
  hasAudioTrack?: boolean
  height?: number
  path: string
  size: number
  width?: number
}

export interface MediaPreparer {
  prepare(
    reference: MediaReference,
    workDirectory: string,
    index: number,
    signal: AbortSignal,
  ): Promise<PreparedMedia>
}

interface ProbeStream {
  channels?: number
  codec_type?: string
  height?: number
  width?: number
}

interface ProbeResult {
  format?: { duration?: string }
  streams?: ProbeStream[]
}

export class MediaToolchainError extends Error {
  readonly publicMessage =
    "ChatCut video and audio import requires working ffmpeg and ffprobe commands on PATH."

  constructor() {
    super("ChatCut media preparation toolchain is unavailable")
    this.name = "MediaToolchainError"
  }
}

export class MediaPreparationError extends Error {
  readonly publicMessage = "A connected media file could not be prepared for ChatCut."

  constructor() {
    super("ChatCut media preparation failed")
    this.name = "MediaPreparationError"
  }
}

export type CommandRunner = (
  command: string,
  arguments_: readonly string[],
  signal: AbortSignal,
) => Promise<string>

export type ToolResolver = (command: "ffmpeg" | "ffprobe") => string | undefined

function abortError() {
  return new DOMException("Media preparation was cancelled", "AbortError")
}

async function defaultCommandRunner(
  command: string,
  arguments_: readonly string[],
  signal: AbortSignal,
): Promise<string> {
  if (signal.aborted) throw abortError()
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, [...arguments_], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    const stdout: Buffer[] = []
    let outputBytes = 0
    let settled = false
    const finish = (operation: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", onAbort)
      operation()
    }
    const onAbort = () => {
      child.kill("SIGKILL")
      finish(() => reject(abortError()))
    }
    signal.addEventListener("abort", onAbort, { once: true })
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length
      if (outputBytes > maximumToolOutputBytes) {
        child.kill("SIGKILL")
        finish(() => reject(new MediaPreparationError()))
        return
      }
      stdout.push(chunk)
    })
    // Drain stderr without retaining provider/tool diagnostics or native paths.
    child.stderr.resume()
    child.once("error", () => finish(() => reject(new MediaToolchainError())))
    child.once("exit", (code) => {
      if (signal.aborted) {
        finish(() => reject(abortError()))
        return
      }
      if (code !== 0) {
        finish(() => reject(new MediaPreparationError()))
        return
      }
      finish(() => resolve(Buffer.concat(stdout).toString("utf8")))
    })
  })
}

function safeFilename(value: string, fallback: string) {
  const name = path.basename(value)
    .replaceAll(/[\u0000-\u001f\u007f/\\:]/gu, "-")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .slice(0, 160)
  return name && name !== "." && name !== ".." ? name : fallback
}

function normalizedFilename(value: string, index: number, extension: string) {
  const source = safeFilename(value, `media-${index}`)
  const stem = path.parse(source).name
    .replaceAll(/[^A-Za-z0-9._ -]/gu, "-")
    .replaceAll(/-+/gu, "-")
    .slice(0, 120)
    .trim()
  return `${stem || `media-${index}`}.${extension}`
}

async function regularFileSize(filePath: string) {
  const info = await lstat(filePath)
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximumInputBytes) {
    throw new MediaPreparationError()
  }
  return info.size
}

function finitePositive(value: unknown) {
  const number = typeof value === "string" ? Number(value) : value
  return typeof number === "number" && Number.isFinite(number) && number > 0 ? number : undefined
}

function finiteDimension(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 65_536
    ? value
    : undefined
}

function parseProbe(value: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(value) as unknown
  } catch {
    throw new MediaPreparationError()
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new MediaPreparationError()
  }
  const result = parsed as ProbeResult
  const streams = Array.isArray(result.streams) ? result.streams : []
  const video = streams.find((stream) => stream?.codec_type === "video")
  const audio = streams.find((stream) => stream?.codec_type === "audio")
  return {
    durationInSeconds: finitePositive(result.format?.duration),
    hasAudioTrack: Boolean(audio),
    height: finiteDimension(video?.height),
    width: finiteDimension(video?.width),
  }
}

function imageDimension(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_536) {
    throw new MediaPreparationError()
  }
  return value
}

function jpegDimensions(bytes: Uint8Array) {
  let offset = 2
  while (offset + 9 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break
    offset += 1
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue
    if (offset + 2 > bytes.length) break
    const length = bytes[offset]! * 256 + bytes[offset + 1]!
    if (length < 2 || offset + length > bytes.length) break
    if (
      marker >= 0xc0
      && marker <= 0xcf
      && ![0xc4, 0xc8, 0xcc].includes(marker)
      && length >= 7
    ) {
      return {
        height: imageDimension(bytes[offset + 3]! * 256 + bytes[offset + 4]!),
        width: imageDimension(bytes[offset + 5]! * 256 + bytes[offset + 6]!),
      }
    }
    offset += length
  }
  throw new MediaPreparationError()
}

async function imageMetadata(filePath: string, mimeType: string) {
  const handle = await open(filePath, "r")
  try {
    const bytes = new Uint8Array(mimeType === "image/jpeg" ? 1024 * 1024 : 32)
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    const header = bytes.subarray(0, bytesRead)
    const ascii = (start: number, end: number) =>
      new TextDecoder("ascii").decode(header.subarray(start, end))
    if (
      mimeType === "image/png"
      && header.length >= 24
      && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte)
    ) {
      const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
      return {
        assetType: "image" as const,
        height: imageDimension(view.getUint32(20, false)),
        width: imageDimension(view.getUint32(16, false)),
      }
    }
    if (
      mimeType === "image/jpeg"
      && header.length >= 3
      && header[0] === 0xff
      && header[1] === 0xd8
      && header[2] === 0xff
    ) {
      return { assetType: "image" as const, ...jpegDimensions(header) }
    }
    if (
      mimeType === "image/webp"
      && header.length >= 30
      && ascii(0, 4) === "RIFF"
      && ascii(8, 12) === "WEBP"
    ) {
      const format = ascii(12, 16)
      if (format === "VP8X") {
        return {
          assetType: "image" as const,
          height: imageDimension(1 + header[27]! + header[28]! * 256 + header[29]! * 65_536),
          width: imageDimension(1 + header[24]! + header[25]! * 256 + header[26]! * 65_536),
        }
      }
      if (
        format === "VP8 "
        && header[23] === 0x9d
        && header[24] === 0x01
        && header[25] === 0x2a
      ) {
        return {
          assetType: "image" as const,
          height: imageDimension((header[28]! + header[29]! * 256) & 0x3fff),
          width: imageDimension((header[26]! + header[27]! * 256) & 0x3fff),
        }
      }
      if (format === "VP8L" && header[20] === 0x2f) {
        return {
          assetType: "image" as const,
          height: imageDimension(1 + (header[22]! >> 6) + header[23]! * 4 + (header[24]! & 0x0f) * 1_024),
          width: imageDimension(1 + header[21]! + (header[22]! & 0x3f) * 256),
        }
      }
      throw new MediaPreparationError()
    }
    if (
      mimeType === "image/gif"
      && header.length >= 10
      && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")
    ) {
      const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
      return {
        assetType: "gif" as const,
        height: imageDimension(view.getUint16(8, true)),
        width: imageDimension(view.getUint16(6, true)),
      }
    }
    throw new MediaPreparationError()
  } finally {
    await handle.close()
  }
}

export class PathMediaPreparer implements MediaPreparer {
  readonly #run: CommandRunner
  readonly #which: ToolResolver

  constructor(
    run: CommandRunner = defaultCommandRunner,
    which: ToolResolver = (command) => Bun.which(command) ?? undefined,
  ) {
    this.#run = run
    this.#which = which
  }

  async prepare(
    reference: MediaReference,
    workDirectory: string,
    index: number,
    signal: AbortSignal,
  ): Promise<PreparedMedia> {
    if (signal.aborted) throw abortError()
    const size = await regularFileSize(reference.path)
    if (reference.role === "reference_image") {
      const metadata = await imageMetadata(reference.path, reference.mime_type)
      return {
        ...metadata,
        contentType: reference.mime_type,
        filename: safeFilename(reference.name, `image-${index}`),
        path: reference.path,
        size,
      }
    }

    const ffmpeg = this.#which("ffmpeg")
    const ffprobe = this.#which("ffprobe")
    if (!ffmpeg || !ffprobe) throw new MediaToolchainError()
    await this.#probe(ffprobe, reference.path, signal)

    const isVideo = reference.role === "reference_video"
    const extension = isVideo ? "mp4" : "ogg"
    const outputPath = path.join(workDirectory, `${index}-${crypto.randomUUID()}.${extension}`)
    const arguments_ = isVideo
      ? [
          "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
          "-i", reference.path,
          "-map", "0:v:0", "-map", "0:a?",
          "-vf", "fps=30",
          "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "192k",
          "-movflags", "+faststart",
          outputPath,
        ]
      : [
          "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
          "-i", reference.path,
          "-map", "0:a:0", "-vn",
          "-c:a", "libopus", "-b:a", "128k", "-f", "ogg",
          outputPath,
        ]
    await this.#run(ffmpeg, arguments_, signal)
    const preparedSize = await regularFileSize(outputPath)
    const metadata = await this.#probe(ffprobe, outputPath, signal)
    if (isVideo && (!metadata.width || !metadata.height)) throw new MediaPreparationError()
    if (!isVideo && !metadata.hasAudioTrack) throw new MediaPreparationError()
    return {
      assetType: isVideo ? "video" : "audio",
      contentType: isVideo ? "video/mp4" : "audio/ogg",
      filename: normalizedFilename(reference.name, index, extension),
      path: outputPath,
      size: preparedSize,
      ...(metadata.durationInSeconds === undefined
        ? {}
        : { durationInSeconds: metadata.durationInSeconds }),
      ...(isVideo ? { hasAudioTrack: metadata.hasAudioTrack } : {}),
      ...(isVideo && metadata.height !== undefined ? { height: metadata.height } : {}),
      ...(isVideo && metadata.width !== undefined ? { width: metadata.width } : {}),
    }
  }

  async #probe(ffprobe: string, filePath: string, signal: AbortSignal) {
    const stdout = await this.#run(ffprobe, [
      "-v", "error",
      "-show_entries", "format=duration:stream=codec_type,width,height,channels",
      "-of", "json",
      filePath,
    ], signal)
    return parseProbe(stdout)
  }
}
