import { describe, expect, test } from "bun:test"

import { openSafeDownload } from "../src/safe-download.ts"

describe("safe artifact download boundary", () => {
  test("rejects non-HTTPS, credentialed, nonstandard-port, and private targets", async () => {
    const unsafe = [
      "http://cdn.example/artifact.png",
      "https://user:password@cdn.example/artifact.png",
      "https://cdn.example:8443/artifact.png",
      "https://127.0.0.1/artifact.png",
      "https://[::1]/artifact.png",
      "https://service.local/artifact.png",
    ]

    for (const url of unsafe) {
      await expect(openSafeDownload(
        url,
        new AbortController().signal,
      )).rejects.toThrow("unsafe")
    }
  })

  test("rejects an already-cancelled request before DNS or network access", async () => {
    const controller = new AbortController()
    controller.abort("caller cancelled")

    await expect(openSafeDownload(
      "https://cdn.example/artifact.png",
      controller.signal,
    )).rejects.toMatchObject({ name: "AbortError" })
  })
})
