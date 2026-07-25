import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { FetchLike } from "../src/chatcut-client.ts"
import { ChatCutEndpointError } from "../src/chatcut-client.ts"
import type { MediaImportCall } from "../src/contracts.ts"
import { MediaImportEngine, publicImportError } from "../src/importer.ts"
import type { MediaPreparer } from "../src/media.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { force: true, recursive: true })))
})

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "chatcut-companion-test-"))
  temporaryDirectories.push(directory)
  const mediaPath = path.join(directory, "staged.png")
  await writeFile(mediaPath, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]))
  return { directory, mediaPath }
}

function call(mediaPath: string): MediaImportCall {
  return {
    endpoint: "https://chatcut.test/import-session",
    operation_id: "operation-one",
    output: "text",
    output_directory: "/unused/output",
    prompt: "Import connected media",
    references: [{
      kind: "file",
      mime_type: "image/png",
      name: "staged.png",
      node_id: "node-one",
      path: mediaPath,
      role: "reference_image",
    }],
    schema: "convax.generation-call/1",
    session_token: "short-lived-session-token",
  }
}

const passthroughPreparer: MediaPreparer = {
  async prepare(reference) {
    return {
      assetType: "image",
      contentType: "image/png",
      filename: "staged.png",
      path: reference.path,
      size: 9,
    }
  },
}

describe("media import engine", () => {
  test("uses the short-session protocol and returns only bounded asset metadata", async () => {
    const { directory, mediaPath } = await fixture()
    const requests: Array<{ authorization: string | null; method: string; url: string }> = []
    const actions: string[] = []
    const fetch_: FetchLike = async (input, init) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      requests.push({
        authorization: new Headers(init?.headers).get("authorization"),
        method,
        url,
      })
      if (method === "PUT") return new Response(null, { status: 200 })
      const envelope = JSON.parse(String(init?.body)) as {
        request: Record<string, Record<string, unknown>>
      }
      const key = Object.keys(envelope.request)[0]!
      const action = envelope.request[key]?.action
      if (typeof action === "string") actions.push(action)
      if (key === "prepareRegisteredUploadRequest") {
        return Response.json({
          assetUpload: {
            fileKey: "asset/object",
            presignedUrl: "https://uploads.chatcut.test/object?signature=opaque",
            readUrl: "https://media.chatcut.test/object",
          },
        })
      }
      return Response.json({})
    }
    const engine = new MediaImportEngine({
      allowedOrigin: "https://chatcut.test",
      fetch: fetch_,
      preparer: passthroughPreparer,
      temporaryRoot: directory,
    })

    const result = await engine.import(call(mediaPath), new AbortController().signal)

    expect(result.schema).toBe("convax.chatcut-media-import-result/1")
    expect(result.assetIds).toHaveLength(1)
    expect(result.assetIds[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.assets).toEqual([{
      assetId: result.assetIds[0]!,
      assetType: "image",
      nodeId: "node-one",
    }])
    expect(actions).toEqual([
      "register_asset_placeholder",
      "prepare_registered_upload",
      "finalize_asset_upload",
    ])
    expect(requests.map(({ method }) => method)).toEqual(["POST", "POST", "PUT", "POST"])
    expect(requests.filter(({ method }) => method === "POST").every(
      ({ authorization }) => authorization === "Bearer short-lived-session-token",
    )).toBeTrue()
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("session-token")
    expect(serialized).not.toContain(mediaPath)
    expect(serialized).not.toContain("chatcut.test")
  })

  test("rejects any endpoint outside the exact production origin before fetch", async () => {
    const { mediaPath } = await fixture()
    let fetched = false
    const engine = new MediaImportEngine({
      fetch: async () => {
        fetched = true
        return new Response()
      },
      preparer: passthroughPreparer,
    })
    await expect(engine.import(call(mediaPath), new AbortController().signal)).rejects.toBeInstanceOf(
      ChatCutEndpointError,
    )
    expect(fetched).toBeFalse()
  })

  test("does not reflect upstream bodies through its public error", async () => {
    const { mediaPath } = await fixture()
    const secretBody = "server-secret /private/native/path"
    const engine = new MediaImportEngine({
      allowedOrigin: "https://chatcut.test",
      fetch: async () => new Response(secretBody, { status: 401 }),
      preparer: passthroughPreparer,
    })
    let caught: unknown
    try {
      await engine.import(call(mediaPath), new AbortController().signal)
    } catch (error) {
      caught = error
    }
    expect(publicImportError(caught)).toBe(
      "ChatCut media import failed. Create a fresh import session and try again.",
    )
    expect(publicImportError(caught)).not.toContain(secretBody)
  })
})
