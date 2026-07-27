import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, test } from "bun:test"

import type { StagedReference } from "../src/contracts.ts"
import { JianyingTransport } from "../src/transport.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe("JianYing loopback transport", () => {
  test("serves only opaque Deep Link URLs and verifies ranged transfer coverage", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "jianying-transport-"))
    roots.push(root)
    const file = path.join(root, "frame.png")
    await fs.writeFile(file, "abcdef")
    const references: StagedReference[] = [{
      kind: "file",
      mimeType: "image/png",
      name: "frame.png",
      nodeId: "node-1",
      path: file,
      role: "reference_image",
    }]
    let materialUrl = ""
    const transport = new JianyingTransport({
      async open(url) {
        const parsed = new URL(url)
        const featureEntry = JSON.parse(parsed.searchParams.get("featureEntry") ?? "{}")
        materialUrl = featureEntry.feature_context.material_infos[0].material_uri
        expect(materialUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{64}$/u)
        const first = await fetch(materialUrl, { headers: { Range: "bytes=0-2" } })
        expect(first.status).toBe(206)
        expect(await first.text()).toBe("abc")
        const second = await fetch(materialUrl, { headers: { Range: "bytes=3-5" } })
        expect(second.status).toBe(206)
        expect(await second.text()).toBe("def")
      },
      timeoutMs: 2_000,
    })

    await expect(transport.import(references)).resolves.toEqual({ completed: 1 })
    await expect(fetch(materialUrl)).rejects.toThrow()
  })
})
