import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { createReadStream } from "node:fs"
import fs from "node:fs/promises"
import { createServer, type Server, type ServerResponse } from "node:http"
import path from "node:path"
import type { Socket } from "node:net"

import type { StagedReference } from "./contracts.ts"

const bundleId = "com.lemon.lvpro"
const importBase = "videocut://com.ies.videocut/uganchor/anchor_point/nothing"
const createDraftUrl = "videocut://com.ies.videocut/main/draft/new_draft?force_create=true"

interface PreparedReference extends StagedReference {
  endpoint: string
  size: number
}

interface Range {
  end: number
  start: number
}

function aborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new DOMException("Operation cancelled", "AbortError")
  }
}

export async function openJianying(url: string, signal?: AbortSignal) {
  if (!url.startsWith("videocut://")) throw new Error("JianYing Deep Link is invalid")
  aborted(signal)
  await new Promise<void>((resolve, reject) => {
    const child = spawn("/usr/bin/open", ["-b", bundleId, url], { stdio: ["ignore", "ignore", "pipe"] })
    const cancel = () => child.kill("SIGTERM")
    signal?.addEventListener("abort", cancel, { once: true })
    child.once("error", reject)
    child.once("close", (code) => {
      signal?.removeEventListener("abort", cancel)
      if (signal?.aborted) reject(signal.reason)
      else if (code === 0) resolve()
      else reject(new Error(`Could not open JianYing (exit code ${code ?? "unknown"})`))
    })
  })
}

function importUrl(urls: readonly string[]) {
  const featureEntry = {
    enter_from: "agent",
    extension: {},
    feature: "nothing",
    feature_context: {
      material_import: true,
      material_infos: urls.map((materialUri) => ({
        material_param: { add_to_material_panel: true },
        material_uri: materialUri,
      })),
    },
    sence: "editor",
    sence_context: { material_import_by_user: true, new_draft: false },
  }
  return `${importBase}?featureEntry=${encodeURIComponent(JSON.stringify(featureEntry))}`
}

async function prepare(references: readonly StagedReference[]): Promise<PreparedReference[]> {
  return Promise.all(references.map(async (reference) => {
    const stat = await fs.lstat(reference.path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1) {
      throw new Error("A staged JianYing input is not a non-empty regular file")
    }
    return {
      ...reference,
      endpoint: `/${randomBytes(32).toString("hex")}`,
      size: stat.size,
    }
  }))
}

function requestedRange(header: string | undefined, size: number): Range | undefined {
  if (!header) return { end: size - 1, start: 0 }
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim())
  if (!match || (!match[1] && !match[2])) return undefined
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    return undefined
  }
  return { end: Math.min(end, size - 1), start }
}

function covered(intervals: readonly Range[]) {
  const sorted = [...intervals].sort((left, right) => left.start - right.start)
  let end = -1
  for (const interval of sorted) {
    if (interval.start > end + 1) break
    end = Math.max(end, interval.end)
  }
  return end + 1
}

function respondFile(
  response: ServerResponse,
  item: PreparedReference,
  method: string,
  rangeHeader: string | undefined,
  completed: (range: Range) => void,
) {
  const range = requestedRange(rangeHeader, item.size)
  if (!range) {
    response.statusCode = 416
    response.setHeader("Content-Range", `bytes */${item.size}`)
    response.end()
    return
  }
  response.setHeader("Accept-Ranges", "bytes")
  response.setHeader("Content-Length", range.end - range.start + 1)
  response.setHeader("Content-Type", item.mimeType)
  if (rangeHeader) response.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${item.size}`)
  if (method === "HEAD") {
    response.statusCode = rangeHeader ? 206 : 200
    response.end()
    return
  }
  response.statusCode = rangeHeader ? 206 : 200
  const stream = createReadStream(item.path, { end: range.end, start: range.start })
  stream.once("error", () => response.destroy())
  stream.once("end", () => completed(range))
  stream.pipe(response)
}

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Loopback server did not bind a TCP port")
  return address.port
}

async function close(server: Server, sockets: Set<Socket>) {
  for (const socket of sockets) socket.destroy()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

export class JianyingTransport {
  constructor(
    private readonly options: {
      open?: (url: string, signal?: AbortSignal) => Promise<void>
      timeoutMs?: number
    } = {},
  ) {}

  createDraft(signal?: AbortSignal) {
    return (this.options.open ?? openJianying)(createDraftUrl, signal)
  }

  async import(references: readonly StagedReference[], signal?: AbortSignal) {
    aborted(signal)
    const prepared = await prepare(references)
    const intervals = new Map(prepared.map((item) => [item.endpoint, [] as Range[]]))
    let resolveAll!: () => void
    const all = new Promise<void>((resolve) => {
      resolveAll = resolve
    })
    const sockets = new Set<Socket>()
    const server = createServer((request, response) => {
      if ((request.method !== "GET" && request.method !== "HEAD") || !request.url) {
        response.statusCode = 405
        response.end()
        return
      }
      const item = prepared.find((candidate) => candidate.endpoint === request.url)
      if (!item) {
        response.statusCode = 404
        response.end()
        return
      }
      respondFile(response, item, request.method, request.headers.range, (range) => {
        intervals.get(item.endpoint)!.push(range)
        if (prepared.every((candidate) => covered(intervals.get(candidate.endpoint)!) >= candidate.size)) resolveAll()
      })
    })
    server.on("connection", (socket) => {
      sockets.add(socket)
      socket.once("close", () => sockets.delete(socket))
    })
    try {
      const port = await listen(server)
      const urls = prepared.map((item) => `http://127.0.0.1:${port}${item.endpoint}`)
      await (this.options.open ?? openJianying)(importUrl(urls), signal)
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        all,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("JianYing did not finish reading all media in time")), this.options.timeoutMs ?? 15_000)
        }),
        signal
          ? new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))
          : new Promise<never>(() => undefined),
      ]).finally(() => {
        if (timer) clearTimeout(timer)
      })
      return { completed: prepared.length }
    } finally {
      await close(server, sockets)
    }
  }
}
