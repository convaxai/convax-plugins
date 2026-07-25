import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ChatCutImportClient, type FetchLike } from "../src/chatcut-client.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { force: true, recursive: true })))
})

async function mediaFixture(bytes = new Uint8Array([1, 2, 3, 4, 5, 6])) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "chatcut-client-test-"))
  temporaryDirectories.push(directory)
  const mediaPath = path.join(directory, "source.mp4")
  await writeFile(mediaPath, bytes)
  return mediaPath
}

describe("ChatCut short-session client", () => {
  test("uploads bounded multipart pieces without forwarding session authorization", async () => {
    const mediaPath = await mediaFixture()
    const uploads: Array<{ authorization: string | null; size: number; url: string }> = []
    let finalized: Record<string, unknown> | undefined
    const fetch_: FetchLike = async (input, init) => {
      const url = String(input)
      if (init?.method === "PUT") {
        const body = init.body
        if (!(body instanceof Blob)) throw new Error("expected Blob upload")
        uploads.push({
          authorization: new Headers(init.headers).get("authorization"),
          size: body.size,
          url,
        })
        return new Response(null, {
          headers: { etag: url.endsWith("/1") ? "\"etag-one\"" : "\"etag-two\"" },
          status: 200,
        })
      }
      const envelope = JSON.parse(String(init?.body)) as {
        request: Record<string, Record<string, unknown>>
      }
      if (envelope.request.prepareRegisteredUploadRequest) {
        return Response.json({
          assetUpload: {
            fileKey: "asset/object",
            multipartPartCount: 2,
            multipartPartSizeBytes: 3,
            multipartUploadId: "multipart-one",
            presignedUrl: "https://uploads.chatcut.test/not-used",
            readUrl: "https://media.chatcut.test/object",
          },
        })
      }
      if (envelope.request.signPartsRequest) {
        return Response.json({
          partUrls: {
            1: "https://uploads.chatcut.test/1",
            2: "https://uploads.chatcut.test/2",
          },
        })
      }
      if (envelope.request.finalizeAssetUploadRequest) {
        finalized = envelope.request.finalizeAssetUploadRequest
      }
      return Response.json({})
    }
    const client = new ChatCutImportClient({
      allowedOrigin: "https://chatcut.test",
      endpoint: "https://chatcut.test/import-session",
      fetch: fetch_,
      operationId: "operation-one",
      sessionToken: "short-lived-session-token",
    })

    await client.upload("asset-one", {
      assetType: "video",
      contentType: "video/mp4",
      filename: "source.mp4",
      hasAudioTrack: true,
      path: mediaPath,
      size: 6,
    }, new AbortController().signal)

    expect(uploads).toEqual([
      { authorization: null, size: 3, url: "https://uploads.chatcut.test/1" },
      { authorization: null, size: 3, url: "https://uploads.chatcut.test/2" },
    ])
    expect(finalized?.multipart).toEqual({
      parts: [
        { ETag: "etag-one", PartNumber: 1 },
        { ETag: "etag-two", PartNumber: 2 },
      ],
      uploadId: "multipart-one",
    })
    expect(finalized?.startTranscription).toBeTrue()
  })

  test("fails closed when registration changes the requested asset id", async () => {
    const mediaPath = await mediaFixture()
    let calls = 0
    const client = new ChatCutImportClient({
      allowedOrigin: "https://chatcut.test",
      endpoint: "https://chatcut.test/import-session",
      fetch: async () => {
        calls += 1
        return Response.json({ assetId: "different-asset" })
      },
      operationId: "operation-one",
      sessionToken: "short-lived-session-token",
    })
    await expect(client.upload("asset-one", {
      assetType: "image",
      contentType: "image/png",
      filename: "source.png",
      path: mediaPath,
      size: 6,
    }, new AbortController().signal)).rejects.toThrow("upstream-envelope-rejected")
    expect(calls).toBe(1)
  })
})
