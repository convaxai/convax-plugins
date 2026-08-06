import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  assertPortablePluginStateValueV1,
  parsePortablePluginStateSchemaV1,
} from "@convax/plugin-sdk"

const workspaceRoot = path.resolve(import.meta.dir, "..")

async function readManifest() {
  return JSON.parse(await readFile(path.join(workspaceRoot, "package", "manifest.json"), "utf8"))
}

const representativeState = Object.freeze({
  schema: "convax.storyboard-studio-state/2",
  idea: "一句话悬疑开场",
  settings: {
    aspectRatio: "9:16",
    durationSeconds: 90,
    episodeCount: 6,
    genre: "悬疑轻喜剧",
  },
  production: {
    planning: "Agent 智能分镜",
    resolution: "1080P",
    style: "90 年代写实电影",
    aspectRatio: "",
  },
  selectedEpisodeId: "ep-01",
  selectedSegmentId: "seg-01",
  libraryScope: "episode",
  selectedAssetTab: "characters",
  storyPath: "Storyboards/demo/story.storyboard.json",
})

describe("storyboard-studio portable stateSchema", () => {
  test("admits empty object and a representative closed plugin state", async () => {
    const manifest = await readManifest()
    const schema = parsePortablePluginStateSchemaV1(
      manifest.contributes.canvas.renderer.stateSchema,
    )
    expect(() => assertPortablePluginStateValueV1(schema, {})).not.toThrow()
    expect(() => assertPortablePluginStateValueV1(schema, representativeState)).not.toThrow()
  })

  test("rejects invalid plugin state", async () => {
    const manifest = await readManifest()
    const schema = parsePortablePluginStateSchemaV1(
      manifest.contributes.canvas.renderer.stateSchema,
    )
    expect(() => assertPortablePluginStateValueV1(schema, { schema: "unknown" })).toThrow()
    expect(() =>
      assertPortablePluginStateValueV1(schema, {
        ...representativeState,
        settings: {
          ...representativeState.settings,
          durationSeconds: 90.5,
        },
      }),
    ).toThrow()
    expect(() =>
      assertPortablePluginStateValueV1(schema, {
        ...representativeState,
        extra: true,
      }),
    ).toThrow()
    expect(() =>
      assertPortablePluginStateValueV1(schema, {
        ...representativeState,
        libraryScope: "world",
      }),
    ).toThrow()
  })
})
