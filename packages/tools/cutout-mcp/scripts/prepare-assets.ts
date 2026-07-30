import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { sources } from "./cutout-targets.ts"

const execute = promisify(execFile)
const toolRoot = path.join(import.meta.dir, "..")
const sourceDirectory = path.join(toolRoot, "vendor", "source")
const modelPath = path.join(sourceDirectory, "u2netp.onnx")
const runtimeArchivePath = path.join(sourceDirectory, `${sources.onnxRuntime.directory}.tgz`)
const runtimeDirectory = path.join(sourceDirectory, sources.onnxRuntime.directory)
const maximumDownloadBytes = 128 * 1024 * 1024

export interface PreparedAssets {
  includeDirectory: string
  modelPath: string
  onnxRuntimeDylibPath: string
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

async function downloadPinned(url: string, size: number, digest: string, destination: string, envPath?: string) {
  const existing = await readFile(destination).catch(() => undefined)
  if (existing && existing.length === size && sha256(existing) === digest) return destination
  const override = envPath?.trim()
  let bytes: Uint8Array
  if (override) {
    bytes = await readFile(override)
  } else {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(240_000) })
    if (!response.ok || !response.url.startsWith("https://")) {
      throw new Error(`Unable to download pinned Cutout dependency (${response.status})`)
    }
    const declaredLength = Number(response.headers.get("content-length"))
    if (Number.isFinite(declaredLength) && declaredLength > maximumDownloadBytes) {
      throw new Error("Pinned Cutout dependency exceeds the download boundary")
    }
    bytes = new Uint8Array(await response.arrayBuffer())
  }
  if (bytes.length !== size || sha256(bytes) !== digest) {
    throw new Error("Pinned Cutout dependency failed size or SHA-256 verification")
  }
  await mkdir(sourceDirectory, { recursive: true, mode: 0o700 })
  const temporary = `${destination}.${process.pid}.tmp`
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 })
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
  return destination
}

async function extractRuntime(archive: string) {
  const dylib = path.join(runtimeDirectory, "lib", sources.onnxRuntime.dylibName)
  const header = path.join(runtimeDirectory, "include", "onnxruntime_cxx_api.h")
  if ((await stat(dylib).catch(() => undefined))?.isFile() && (await stat(header).catch(() => undefined))?.isFile()) {
    return runtimeDirectory
  }
  const { stdout: listing } = await execute("/usr/bin/tar", ["-tzf", archive], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  })
  const entries = listing.split("\n").filter(Boolean).map((entry) =>
    entry.startsWith("./") ? entry.slice(2) : entry
  )
  const prefix = `${sources.onnxRuntime.directory}/`
  if (
    entries.length === 0 ||
    entries.some((entry) =>
      entry.includes("\\") ||
      entry.startsWith("/") ||
      entry.split("/").includes("..") ||
      (entry !== sources.onnxRuntime.directory && !entry.startsWith(prefix))
    )
  ) {
    throw new Error("Pinned ONNX Runtime archive contains an unsafe path")
  }
  const extraction = await mkdtemp(path.join(sourceDirectory, ".onnxruntime-extract-"))
  try {
    await execute("/usr/bin/tar", ["-xzf", archive, "-C", extraction], { maxBuffer: 8 * 1024 * 1024 })
    const extracted = path.join(extraction, sources.onnxRuntime.directory)
    if (!(await stat(path.join(extracted, "lib", sources.onnxRuntime.dylibName))).isFile()) {
      throw new Error("Pinned ONNX Runtime archive is missing its dylib")
    }
    await rm(runtimeDirectory, { force: true, recursive: true })
    await rename(extracted, runtimeDirectory)
  } finally {
    await rm(extraction, { force: true, recursive: true })
  }
  return runtimeDirectory
}

export async function prepareAssets(): Promise<PreparedAssets> {
  await mkdir(sourceDirectory, { recursive: true, mode: 0o700 })
  await Promise.all([
    downloadPinned(
      sources.model.url,
      sources.model.size,
      sources.model.sha256,
      modelPath,
      Bun.env.CONVAX_CUTOUT_MODEL,
    ),
    downloadPinned(
      sources.onnxRuntime.archiveUrl,
      sources.onnxRuntime.archiveSize,
      sources.onnxRuntime.archiveSha256,
      runtimeArchivePath,
      Bun.env.CONVAX_CUTOUT_ONNXRUNTIME_ARCHIVE,
    ),
  ])
  const runtime = await extractRuntime(runtimeArchivePath)
  return {
    includeDirectory: path.join(runtime, "include"),
    modelPath,
    onnxRuntimeDylibPath: path.join(runtime, "lib", sources.onnxRuntime.dylibName),
  }
}
