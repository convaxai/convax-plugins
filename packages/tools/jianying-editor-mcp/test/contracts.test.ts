import { describe, expect, test } from "bun:test"

import { InputError, parseGenerationCall } from "../src/contracts.ts"

const envelope = {
  output: "text",
  output_directory: "/tmp/output",
  prompt: "Import media",
  references: [{
    kind: "file",
    mime_type: "image/png",
    name: "frame.png",
    node_id: "node-1",
    path: "/tmp/staged/frame.png",
    role: "reference_image",
  }],
  schema: "convax.generation-call/1",
}

describe("generation-call contract", () => {
  test("accepts only host-staged image and video references", () => {
    expect(parseGenerationCall(envelope, "media.export")).toMatchObject({
      references: [{ mimeType: "image/png", nodeId: "node-1", role: "reference_image" }],
      target: "auto",
    })
    expect(() => parseGenerationCall({
      ...envelope,
      references: [{ ...envelope.references[0], path: "relative.png" }],
    }, "media.export")).toThrow(InputError)
    expect(() => parseGenerationCall({
      ...envelope,
      references: [{ ...envelope.references[0], role: "audio" }],
    }, "media.export")).toThrow("unsupported role")
  })

  test("requires an observation token for an explicit target", () => {
    expect(() => parseGenerationCall({ ...envelope, target: "current" }, "media.export")).toThrow("draft_token")
    expect(parseGenerationCall({
      ...envelope,
      draft_token: "jianying_token",
      target: "new",
    }, "media.export")).toMatchObject({
      draftToken: "jianying_token",
      target: "new",
    })
  })

  test("keeps status free of references and target input", () => {
    const status = { ...envelope, prompt: "Inspect", references: [] }
    expect(parseGenerationCall(status, "draft.status")).toMatchObject({ references: [], target: "auto" })
    expect(() => parseGenerationCall({ ...status, target: "current" }, "draft.status")).toThrow("target fields")
  })
})
