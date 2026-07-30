import { describe, expect, test } from "bun:test"

import {
  CHARACTER_SCHEMA,
  DEMO_CHARACTER,
  DEMO_STORY,
  EPISODE_SCHEMA,
  STORY_SCHEMA,
  assetsForScope,
  collectEpisodeAssetIds,
  connectedStorySources,
  isStoryboardDocumentPath,
  normalizeCharacter,
  normalizeEpisode,
  normalizeMediaOutput,
  normalizeStory,
  parseStoryboardDocument,
  portableProjectPath,
  projectResourcePath,
  segmentsForEpisode,
  shotsForSegment,
} from "../package/assets/model.js"

describe("storyboard document normalization", () => {
  test("normalizes a story index, sorts episodes and shots, and preserves only portable references", () => {
    const story = normalizeStory({
      schema: STORY_SCHEMA,
      id: "tea-house",
      title: "雨夜茶馆",
      format: { aspectRatio: "16:9", genre: "悬疑" },
      episodes: [
        "Storyboards/tea-house/episodes/ep-001/episode.storyboard.json",
        {
          schema: EPISODE_SCHEMA,
          id: "ep-002",
          number: 2,
          title: "回声",
          path: "Storyboards/tea-house/episodes/ep-002/episode.storyboard.json",
          groupId: "tea-house-ep-002",
          groupLabel: "EP02 · 回声",
          shots: [
            { id: "shot-002", number: 2, visual: "茶杯裂开", duration: 7 },
            { id: "shot-001", number: 1, action: "客人推门", duration: 4 },
          ],
        },
      ],
      assets: {
        characters: [
          {
            id: "keeper",
            name: "掌柜",
            path: "Storyboards/tea-house/assets/characters/keeper/keeper.character.card.json",
          },
          { id: "visitor", name: "来客", path: "../outside.character.card.json" },
          { id: "other-story", name: "越界人物", path: "Storyboards/other/assets/characters/other/other.character.card.json" },
        ],
      },
    }, "Storyboards/tea-house/story.storyboard.json")

    expect(story).toMatchObject({
      schema: STORY_SCHEMA,
      id: "tea-house",
      title: "雨夜茶馆",
      genre: "悬疑",
      aspectRatio: "16:9",
      sourcePath: "Storyboards/tea-house/story.storyboard.json",
    })
    expect(story.episodes.map((episode) => episode.number)).toEqual([1, 2])
    expect(story.episodes[0]).toMatchObject({
      schema: EPISODE_SCHEMA,
      id: "ep-001",
      storyId: "tea-house",
      aspectRatio: "16:9",
    })
    expect(story.episodes[1].shots.map((shot) => shot.id)).toEqual(["shot-001", "shot-002"])
    expect(story.episodes[1].shots[0]).toMatchObject({
      description: "客人推门",
      durationSeconds: 4,
    })
    expect(story.assets.characters[0].path).toBe(
      "Storyboards/tea-house/assets/characters/keeper/keeper.character.card.json",
    )
    expect(story.assets.characters[1].path).toBe("")
    expect(story.assets.characters[2].path).toBe("")
  })

  test("normalizes standalone episode defaults but rejects an explicitly foreign schema", () => {
    const episode = normalizeEpisode({
      schema: EPISODE_SCHEMA,
      id: "ep-003",
      number: 3,
      title: "第三集",
      durationSeconds: -5,
      shots: [{ number: 2 }, { number: 1 }],
      groupId: "story-ep-003",
      groupLabel: "EP03 · 第三集",
    })
    expect(episode).toMatchObject({
      schema: EPISODE_SCHEMA,
      id: "ep-003",
      number: 3,
      durationSeconds: 90,
      groupId: "story-ep-003",
      groupLabel: "EP03 · 第三集",
    })
    expect(episode.shots.map((shot) => shot.number)).toEqual([1, 2])
    expect(normalizeEpisode({ schema: "convax.other/1", number: 1 })).toBeNull()
  })

  test("preserves production segments, shot prompts and confined media outputs", () => {
    const episode = normalizeEpisode({
      schema: EPISODE_SCHEMA,
      id: "ep-001",
      number: 1,
      title: "旧教室",
      path: "Storyboards/classroom/episodes/ep-001/episode.storyboard.json",
      shots: [
        {
          id: "ep-001-shot-002",
          number: 2,
          description: "人物回头",
          characterIds: ["char-001"],
          assetRefs: ["prop-001"],
          continuityLocks: ["白衬衫袖口挽起"],
          imagePrompt: "cinematic still",
          videoPrompt: "slow push-in",
        },
        {
          id: "ep-001-shot-001",
          number: 1,
          description: "空教室",
          locationAssetId: "loc-001",
        },
      ],
      segments: [
        {
          id: "segment-002",
          number: 2,
          title: "回头",
          shotIds: ["ep-001-shot-002", "missing-shot"],
          assetRefs: ["char-001", "prop-001"],
          outputs: {
            keyframe: {
              status: "ready",
              path: "Storyboards/classroom/episodes/ep-001/outputs/images/segment-002.jpg",
            },
            video: {
              status: "ready",
              path: "Storyboards/other/episodes/ep-001/outputs/video/segment-002.mp4",
            },
          },
        },
        {
          id: "segment-001",
          number: 1,
          title: "建立环境",
          shotIds: ["ep-001-shot-001"],
          locationId: "loc-001",
        },
      ],
    })

    expect(episode.segments.map((segment) => segment.id)).toEqual(["segment-001", "segment-002"])
    expect(episode.segments[0].locationAssetId).toBe("loc-001")
    expect(episode.segments[1].shotIds).toEqual(["ep-001-shot-002"])
    expect(episode.segments[1].outputs.keyframe).toMatchObject({
      status: "ready",
      path: "Storyboards/classroom/episodes/ep-001/outputs/images/segment-002.jpg",
    })
    expect(episode.segments[1].outputs.video).toMatchObject({
      status: "missing-media",
      path: "",
    })
    expect(episode.shots[1]).toMatchObject({
      assetRefs: ["prop-001"],
      continuityLocks: ["白衬衫袖口挽起"],
      imagePrompt: "cinematic still",
      videoPrompt: "slow push-in",
    })
    expect(shotsForSegment(episode, episode.segments[1]).map((shot) => shot.id)).toEqual([
      "ep-001-shot-002",
    ])
    expect([...collectEpisodeAssetIds(episode)].sort()).toEqual([
      "char-001",
      "loc-001",
      "prop-001",
    ])

    const legacy = normalizeEpisode({
      schema: EPISODE_SCHEMA,
      id: "ep-legacy",
      number: 2,
      title: "旧格式",
      shots: [{ id: "shot-001", number: 1 }, { id: "shot-002", number: 2 }],
    })
    expect(segmentsForEpisode(legacy)).toHaveLength(1)
    expect(segmentsForEpisode(legacy)[0].shotIds).toEqual(["shot-001", "shot-002"])

    expect(normalizeMediaOutput({
      status: "ready",
      path: "../escape.mp4",
    }, "Storyboards/classroom")).toMatchObject({ status: "missing-media", path: "" })
  })

  test("filters the asset library by episode use and derives segment materials", () => {
    const episode = normalizeEpisode({
      schema: EPISODE_SCHEMA,
      id: "ep-001",
      number: 1,
      shots: [{
        id: "shot-001",
        number: 1,
        characterIds: ["char-used"],
        locationId: "loc-used",
      }],
      segments: [{
        id: "segment-001",
        number: 1,
        shotIds: ["shot-001"],
        locationAssetId: "loc-used",
        assetRefs: ["prop-used"],
      }],
    })
    const story = normalizeStory({
      schema: STORY_SCHEMA,
      id: "library-story",
      title: "Library",
      episodes: [episode],
      assets: {
        characters: [{ id: "char-used", name: "Used" }, { id: "char-unused", name: "Unused" }],
        locations: [{ id: "loc-used", name: "Used location" }],
        props: [{ id: "prop-used", name: "Used prop" }],
      },
    })

    expect(assetsForScope(story, story.episodes[0], "episode", "characters").map((asset) => asset.id)).toEqual([
      "char-used",
    ])
    expect(assetsForScope(story, story.episodes[0], "story", "characters")).toHaveLength(2)
    expect(assetsForScope(story, story.episodes[0], "episode", "materials")).toMatchObject([
      {
        id: "ep-001-segment-001-material",
        segmentId: "segment-001",
      },
    ])
  })

  test("normalizes the character's personality, voice, image and continuity contracts", () => {
    const character = normalizeCharacter({
      schema: CHARACTER_SCHEMA,
      id: "keeper",
      storyId: "tea-house",
      name: "掌柜",
      personality: {
        archetype: "守门人",
        traits: ["克制", "敏锐"],
        contradiction: "不问来处，却记得每一位客人。",
        gestures: ["擦杯沿"],
      },
      voice: {
        description: "低沉、停顿长",
        referenceAudio: [
          {
            id: "voice-ready",
            status: "ready",
            path: "Storyboards/tea-house/assets/characters/keeper/audio/reference.wav",
          },
          { id: "voice-planned", status: "planned", description: "补录一版耳语" },
          { id: "voice-unsafe", status: "ready", path: "../../private.wav" },
          {
            id: "voice-other-character",
            status: "ready",
            path: "Storyboards/tea-house/assets/characters/stranger/audio/reference.wav",
          },
        ],
      },
      visual: {
        primaryImage: "Storyboards/tea-house/assets/characters/keeper/images/primary.webp",
        referenceImages: [
          "Storyboards/tea-house/assets/characters/keeper/images/profile.webp",
          "Storyboards/tea-house/assets/characters/stranger/images/profile.webp",
          "../outside.webp",
        ],
        wardrobe: ["靛蓝长衫", "旧银怀表"],
        palette: ["#102030", "#d6b37a"],
      },
      continuity: {
        locks: ["怀表始终在左侧口袋"],
        forbiddenChanges: ["不可改变左眼疤痕"],
      },
    }, "Storyboards/tea-house/assets/characters/keeper/keeper.character.card.json")

    expect(character).toMatchObject({
      schema: CHARACTER_SCHEMA,
      id: "keeper",
      storyId: "tea-house",
      personality: {
        archetype: "守门人",
        traits: ["克制", "敏锐"],
        gestures: ["擦杯沿"],
      },
      voice: {
        description: "低沉、停顿长",
        sampleAudio: "Storyboards/tea-house/assets/characters/keeper/audio/reference.wav",
      },
      visual: {
        primaryImage: "Storyboards/tea-house/assets/characters/keeper/images/primary.webp",
        wardrobe: "靛蓝长衫 · 旧银怀表",
        palette: ["#102030", "#d6b37a"],
      },
      continuity: {
        locks: ["怀表始终在左侧口袋"],
        forbiddenChanges: ["不可改变左眼疤痕"],
      },
      sourcePath: "Storyboards/tea-house/assets/characters/keeper/keeper.character.card.json",
    })
    expect(character.voice.references.map((reference) => reference.id)).toEqual([
      "voice-ready",
      "voice-planned",
    ])
    expect(character.visual.references).toEqual([
      "Storyboards/tea-house/assets/characters/keeper/images/profile.webp",
    ])
  })

  test("fails closed for traversal, private state and platform-absolute paths", () => {
    const rejected = [
      "",
      "/Users/example/story.json",
      "C:\\Users\\example\\story.json",
      "C:/Users/example/story.json",
      "../story.json",
      "./story.json",
      "Storyboards/../story.json",
      "Storyboards//story.json",
      "Storyboards\\story.json",
      ".convax",
      ".convax/private.json",
      ".Convax/private.json",
      "Storyboards/\0/story.json",
    ]
    for (const candidate of rejected) expect(portableProjectPath(candidate)).toBe("")
    expect(portableProjectPath("Storyboards/tea-house/story.storyboard.json")).toBe(
      "Storyboards/tea-house/story.storyboard.json",
    )
    expect(isStoryboardDocumentPath("Storyboards/tea-house/story.storyboard.json")).toBeTrue()
    expect(isStoryboardDocumentPath("Storyboards/tea-house/assets/characters/keeper/keeper.character.card.json")).toBeTrue()
    expect(isStoryboardDocumentPath("Scripts/tea-house.storyboard.json")).toBeFalse()
    expect(isStoryboardDocumentPath("Storyboards/tea-house/source/script.md")).toBeFalse()

    expect(projectResourcePath({
      data: {
        metadata: {
          convaxProjectResource: {
            kind: "project-file",
            path: "Storyboards/tea-house/story.storyboard.json",
          },
        },
      },
    })).toBe("Storyboards/tea-house/story.storyboard.json")
    expect(projectResourcePath({
      data: {
        metadata: {
          convaxProjectResource: { kind: "project-file", path: ".convax/private.json" },
        },
      },
    })).toBe("")
    expect(projectResourcePath({
      data: {
        metadata: {
          convaxProjectResource: { kind: "external-file", path: "Storyboards/tea-house/story.json" },
        },
      },
    })).toBe("")
  })

  test("accepts only direct incoming source nodes and bounds adversarial edge sets", () => {
    const document = {
      nodes: [
        {
          id: "script",
          label: "原始剧本",
          kind: "text",
          text: "暴雨夜，一位掌柜接待了没有影子的客人。",
          resource: { path: "Scripts/tea-house.md" },
        },
        { id: "outgoing", label: "插件输出", kind: "text", text: "不应回读" },
        { id: "unrelated", label: "无关节点", kind: "text", text: "不应读取" },
      ],
      edges: [
        { source: "script", target: "storyboard-node" },
        { source: "script", target: "storyboard-node" },
        { source: "storyboard-node", target: "outgoing" },
      ],
    }
    expect(connectedStorySources(document, "storyboard-node")).toEqual([
      {
        id: "script",
        label: "原始剧本",
        kind: "text",
        text: "暴雨夜，一位掌柜接待了没有影子的客人。",
        path: "Scripts/tea-house.md",
        mimeType: "",
        status: "",
      },
    ])

    const tooMany = {
      nodes: Array.from({ length: 201 }, (_, index) => ({ id: `source-${index}`, text: "x" })),
      edges: Array.from(
        { length: 201 },
        (_, index) => ({ source: `source-${index}`, target: "storyboard-node" }),
      ),
    }
    expect(connectedStorySources(tooMany, "storyboard-node")).toEqual([])
  })

  test("dispatches only known top-level schemas and rejects malformed or oversized documents", () => {
    expect(parseStoryboardDocument(JSON.stringify({
      schema: STORY_SCHEMA,
      id: "known-story",
      title: "Known",
      episodes: [],
    }))).toMatchObject({ kind: "story", value: { id: "known-story" } })
    expect(parseStoryboardDocument(JSON.stringify({
      schema: EPISODE_SCHEMA,
      id: "ep-001",
      number: 1,
    }))).toMatchObject({ kind: "episode", value: { id: "ep-001" } })
    expect(parseStoryboardDocument(JSON.stringify({
      schema: CHARACTER_SCHEMA,
      id: "known-character",
      name: "Known",
    }))).toMatchObject({ kind: "character", value: { id: "known-character" } })

    expect(normalizeStory({ schema: "convax.storyboard/2" })).toBeNull()
    expect(normalizeCharacter({ schema: "convax.character-card/2" })).toBeNull()
    expect(() => parseStoryboardDocument('{"schema":"convax.unknown/99"}')).toThrow(
      "暂不支持故事板 schema",
    )
    expect(() => parseStoryboardDocument('{"title":"missing schema"}')).toThrow("缺少 schema")
    expect(() => parseStoryboardDocument("{")).toThrow("不是有效 JSON")
    expect(() => parseStoryboardDocument("x".repeat(2 * 1024 * 1024 + 1))).toThrow(
      "不是可接受的文本",
    )
  })
})

describe("bundled demo contract", () => {
  test("demonstrates production-useful character media/personality and episode Canvas groups", () => {
    expect(DEMO_CHARACTER).toMatchObject({
      schema: CHARACTER_SCHEMA,
      id: "char-001",
      personality: {
        archetype: expect.any(String),
        contradiction: expect.any(String),
        desire: expect.any(String),
        fear: expect.any(String),
        speechPattern: expect.any(String),
      },
      voice: {
        description: expect.any(String),
        sampleAudio: expect.stringMatching(/^Storyboards\/.+\/audio\/.+/u),
      },
      visual: {
        primaryImage: expect.stringMatching(/^Storyboards\/.+\/images\/.+/u),
        imagePrompt: expect.any(String),
      },
    })
    expect(Array.isArray(DEMO_CHARACTER.personality.traits)).toBeTrue()
    expect(Array.isArray(DEMO_CHARACTER.visual.references)).toBeTrue()
    expect(DEMO_CHARACTER.personality.traits.length).toBeGreaterThan(2)
    expect(DEMO_CHARACTER.visual.references.length).toBeGreaterThan(0)

    expect(DEMO_STORY.schema).toBe(STORY_SCHEMA)
    expect(DEMO_STORY.episodes.length).toBeGreaterThan(1)
    expect(DEMO_STORY.episodes[0].segments).toHaveLength(10)
    expect(DEMO_STORY.episodes[0].segments[0].shotIds).toHaveLength(3)
    expect(DEMO_STORY.episodes[0].segments[0].outputs.video.status).toBe("ready")
    expect(DEMO_STORY.episodes[0].segments[8].status).toBe("generating")
    expect(DEMO_STORY.episodes[0].segments[9].status).toBe("planned")
    expect(new Set(DEMO_STORY.episodes.map((episode) => episode.groupId)).size).toBe(
      DEMO_STORY.episodes.length,
    )
    for (const episode of DEMO_STORY.episodes) {
      expect(episode.groupId).toBeTruthy()
      expect(episode.groupLabel).toStartWith(
        `EP${String(episode.number).padStart(3, "0")} · `,
      )
      expect(episode.path).toMatch(/^Storyboards\/.+\/episodes\/.+\/episode\.storyboard\.json$/u)
    }
    expect(DEMO_STORY.assets.characters).toContainEqual(
      expect.objectContaining({
        id: DEMO_CHARACTER.id,
        path: expect.stringMatching(/\/char-001\.character\.card\.json$/u),
      }),
    )
  })
})
