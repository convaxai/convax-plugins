import { describe, expect, test } from "bun:test"

import {
  generationTools,
  validateModelCatalog,
} from "../src/catalog.ts"
import { providerModel } from "./fakes.ts"

describe("dynamic provider model catalog", () => {
  test("creates one bounded required selector per media class", () => {
    const catalog = validateModelCatalog([
      providerModel("xiaoyunque", "audio", "xiaoyunque/speech"),
      providerModel("xiaoyunque", "image", "xiaoyunque/image-a"),
      providerModel("xiaoyunque", "image", "xiaoyunque/image-b"),
      providerModel("xiaoyunque", "video", "xiaoyunque/video"),
    ], "xiaoyunque")

    const tools = generationTools(catalog)
    expect(tools.map(({ name }) => name)).toEqual([
      "audio.generate",
      "image.generate",
      "video.generate",
    ])
    for (const tool of tools) {
      const schema = tool.inputSchema as {
        properties: { model: Record<string, unknown> }
        required: string[]
      }
      expect(schema.required).toContain("model")
      expect(schema.properties.model["x-convax-role"]).toBe(
        "generation-model-id",
      )
      expect(schema.properties.model.type).toBe("string")
      expect(Array.isArray(schema.properties.model.oneOf)).toBe(true)
    }
    expect(
      (tools[1]!.inputSchema as {
        properties: { model: { oneOf: unknown[] } }
      }).properties.model.oneOf,
    ).toHaveLength(2)
  })

  test("rejects a provider-crossing model instead of leaking it", () => {
    expect(() => validateModelCatalog([
      providerModel("libtv", "image"),
    ], "jimeng")).toThrow("provider boundary")
  })

  test("fails closed above 32 models in one media class", () => {
    const models = Array.from({ length: 33 }, (_, index) =>
      providerModel("jimeng", "image", `jimeng/image-${index}`))
    expect(() => validateModelCatalog(models, "jimeng")).toThrow(
      "bounded limit",
    )
  })

  test("rejects malformed capability choices", () => {
    const model = providerModel("jimeng", "image", "jimeng/image", {
      aspect_ratios: ["16:9", "bad\nvalue"],
    })
    const catalog = validateModelCatalog([model], "jimeng")
    expect(() => generationTools(catalog)).toThrow("capability")
  })

  test("hides unavailable models and exposes normalized duration ranges", () => {
    const unavailable = {
      ...providerModel("xiaoyunque", "video", "xiaoyunque/unavailable"),
      availability: { state: "unavailable" as const },
    }
    const available = {
      ...providerModel("xiaoyunque", "video", "xiaoyunque/available", {
        constraints: {
          duration: { kind: "range", max: 60, min: 1, step: 1 },
        },
        durations: null,
      }),
      availability: { state: "available" as const },
    }
    const tools = generationTools(
      validateModelCatalog([unavailable, available], "xiaoyunque"),
    )
    const schema = tools[0]!.inputSchema as {
      properties: {
        duration: Record<string, unknown>
        model: { oneOf: Array<{ const: string; title: string }> }
      }
    }
    expect(schema.properties.model.oneOf).toEqual([
      { const: "xiaoyunque/available", title: "video model" },
    ])
    expect(schema.properties.duration).toMatchObject({
      maximum: 60,
      minimum: 1,
      multipleOf: 1,
      type: "number",
    })
  })

  test("does not misrepresent a range whose step is offset from zero", () => {
    const catalog = validateModelCatalog([
      providerModel("jimeng", "video", "jimeng/video", {
        constraints: {
          duration: { kind: "range", max: 9, min: 1, step: 2 },
        },
      }),
    ], "jimeng")
    const schema = generationTools(catalog)[0]!.inputSchema as {
      properties: { duration: Record<string, unknown> }
    }
    expect(schema.properties.duration).toMatchObject({
      maximum: 9,
      minimum: 1,
      type: "number",
    })
    expect(schema.properties.duration.multipleOf).toBeUndefined()
  })

  test("projects normalized image size choices", () => {
    const catalog = validateModelCatalog([
      providerModel("libtv", "image", "libtv/image", {
        constraints: {
          size: { kind: "enum", values: ["1024x1024", "1920x1080"] },
        },
      }),
    ], "libtv")
    const schema = generationTools(catalog)[0]!.inputSchema as {
      properties: { size: Record<string, unknown> }
    }
    expect(schema.properties.size).toEqual({
      enum: ["1024x1024", "1920x1080"],
      type: "string",
    })
  })
})
