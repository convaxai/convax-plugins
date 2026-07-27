import { describe, expect, mock, test } from "bun:test"

import type { DraftObservation, GenerationCall } from "../src/contracts.ts"
import { JianyingService } from "../src/service.ts"

const active: DraftObservation = {
  draft: { name: "Demo", path: "/drafts/demo", pid: 42 },
  processIds: [42],
  status: "active",
}

function call(overrides: Partial<GenerationCall> = {}): GenerationCall {
  return {
    output: "text",
    outputDirectory: "/tmp/output",
    prompt: "Import",
    references: [{
      kind: "file",
      mimeType: "image/png",
      name: "frame.png",
      nodeId: "node-1",
      path: "/tmp/frame.png",
      role: "reference_image",
    }],
    schema: "convax.generation-call/1",
    target: "auto",
    ...overrides,
  }
}

describe("JianYing service", () => {
  test("issues a single-use token and verifies current-draft transfer", async () => {
    const inspect = mock(async () => active)
    const importMedia = mock(async () => ({ completed: 1 }))
    const service = new JianyingService(
      { inspect },
      { createDraft: mock(async () => undefined), import: importMedia },
    )
    const status = await service.status()
    expect(status).toMatchObject({ draftName: "Demo", status: "active" })
    expect(status.draftToken).toStartWith("jianying_")
    if (!status.draftToken) throw new Error("Expected a draft token")

    await expect(service.export(call({
      draftToken: status.draftToken,
      target: "current",
    }))).resolves.toEqual({
      createdDraft: false,
      draftName: "Demo",
      importedMediaCount: 1,
      schema: "convax.jianying-export-result/1",
      transferStatus: "verified",
    })
    expect(importMedia).toHaveBeenCalledTimes(1)
    await expect(service.export(call({
      draftToken: status.draftToken,
      target: "current",
    }))).rejects.toThrow("expired")
  })

  test("fails closed when the observed draft changes", async () => {
    const inspect = mock()
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce({
        ...active,
        draft: { ...active.draft!, path: "/drafts/other" },
      })
    const importMedia = mock(async () => ({ completed: 1 }))
    const service = new JianyingService(
      { inspect },
      { createDraft: mock(async () => undefined), import: importMedia },
    )
    await expect(service.export(call())).rejects.toThrow("changed before import")
    expect(importMedia).not.toHaveBeenCalled()
  })
})
