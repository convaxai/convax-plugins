import { describe, expect, test } from "bun:test"
import { type MediaImportCall, parseMediaImportCall } from "../src/contracts.ts"

function validCall(): MediaImportCall {
  return {
    endpoint: "https://api.chatcut.io/api/media-import/session",
    operation_id: "operation-one",
    output: "text",
    output_directory: "/private/tmp/output",
    prompt: "Import connected media",
    references: [{
      kind: "file",
      mime_type: "video/quicktime",
      name: "source.mov",
      node_id: "node-one",
      path: "/private/tmp/staged/source.mov",
      role: "reference_video",
    }],
    schema: "convax.generation-call/1",
    session_token: "short-lived-session-token",
  }
}

describe("media import call", () => {
  test("accepts the exact host envelope", () => {
    expect(parseMediaImportCall(validCall())).toEqual(validCall())
  })

  test("rejects non-staged, mismatched, excessive, and extended references", () => {
    const cases: unknown[] = [
      { ...validCall(), references: [] },
      {
        ...validCall(),
        references: Array.from({ length: 5 }, () => validCall().references[0]),
      },
      {
        ...validCall(),
        references: [{ ...validCall().references[0], path: "relative.mov" }],
      },
      {
        ...validCall(),
        references: [{ ...validCall().references[0], mime_type: "image/png" }],
      },
      {
        ...validCall(),
        references: [{ ...validCall().references[0], source_url: "https://example.com/video" }],
      },
    ]
    for (const input of cases) {
      expect(() => parseMediaImportCall(input)).toThrow()
    }
  })

  test("rejects extra top-level fields and malformed secrets", () => {
    expect(() => parseMediaImportCall({ ...validCall(), oauth_token: "not-allowed" })).toThrow(
      "unsupported fields",
    )
    expect(() => parseMediaImportCall({ ...validCall(), session_token: "too-short" })).toThrow(
      "session_token",
    )
    expect(() => parseMediaImportCall({ ...validCall(), output: "video" })).toThrow(
      "output must be text",
    )
  })
})
