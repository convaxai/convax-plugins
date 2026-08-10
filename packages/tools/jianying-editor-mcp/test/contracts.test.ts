import { describe, expect, test } from "bun:test"

import { InputError, parseGenerationCall } from "../src/contracts.ts"

const envelope = {
  operation_id: `convax-${"a".repeat(64)}`,
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

  test("accepts exactly one toolbar-selected image or video with automatic safe targeting", () => {
    expect(parseGenerationCall(envelope, "media.import-selected")).toMatchObject({
      operationId: envelope.operation_id,
      references: [{ role: "reference_image" }],
      target: "auto",
    })
    expect(() => parseGenerationCall({
      ...envelope,
      references: [...envelope.references, {
        ...envelope.references[0],
        node_id: "node-2",
      }],
    }, "media.import-selected")).toThrow("exactly one")
    expect(() => parseGenerationCall({
      ...envelope,
      draft_token: "hidden-token",
      target: "current",
    }, "media.import-selected")).toThrow("does not accept target fields")
  })

  test("accepts the bounded host operation identity and still rejects malformed input", () => {
    expect(parseGenerationCall({
      ...envelope,
      operation_id: "host-operation-123",
    }, "media.import-selected")).toMatchObject({ operationId: "host-operation-123" })
    expect(() => parseGenerationCall({ ...envelope, operation_id: " invalid " }, "media.import-selected")).toThrow(
      "operation_id",
    )
    expect(() => parseGenerationCall({ ...envelope, operation_id: "x".repeat(257) }, "media.import-selected")).toThrow(
      "operation_id",
    )
    expect(() => parseGenerationCall({ ...envelope, result_mode: "return" }, "media.import-selected")).toThrow(
      "unsupported fields",
    )
  })
})
