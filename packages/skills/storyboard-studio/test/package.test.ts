import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { describe, expect, test } from "bun:test"

import { validateStoryPackage } from "../package/scripts/validate-story-package.mjs"

const packageRoot = path.resolve(import.meta.dir, "..", "package")
const workspaceRoot = path.resolve(import.meta.dir, "..")

async function read(relativePath: string) {
  return fs.readFile(path.join(packageRoot, ...relativePath.split("/")), "utf8")
}

async function writeFixtureFile(storyRoot: string, relativePath: string, value: string | object) {
  const target = path.join(storyRoot, ...relativePath.split("/"))
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`)
}

async function createValidStoryFixture() {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "storyboard-studio-"))
  const storyRoot = path.join(temporaryRoot, "Storyboards", "night-mailbox")
  const prefix = "Storyboards/night-mailbox/"
  const characterPath = `${prefix}assets/characters/char-001/char-001.character.card.json`
  const locationPath = `${prefix}assets/locations/loc-001/location.card.json`
  const episodePath = `${prefix}episodes/ep-001-the-letter/episode.storyboard.json`
  const shotPath = `${prefix}episodes/ep-001-the-letter/shots/shot-001-letter.md`
  const scriptPath = `${prefix}episodes/ep-001-the-letter/script.md`

  await writeFixtureFile(storyRoot, "source/original-brief.md", "# Source\n\nA courier receives tomorrow's letters.\n")
  await writeFixtureFile(storyRoot, "bible/series-bible.md", "# Series bible\n")
  await writeFixtureFile(storyRoot, "bible/continuity.json", { facts: {} })
  await writeFixtureFile(storyRoot, "episodes/ep-001-the-letter/script.md", "# EP001\n")
  await writeFixtureFile(storyRoot, "episodes/ep-001-the-letter/shots/shot-001-letter.md", "# Shot 001\n")
  await writeFixtureFile(storyRoot, "assets/characters/char-001/char-001.character.card.json", {
    schema: "convax.character-card/1",
    id: "char-001",
    storyId: "story-night-mailbox",
    name: "Lin",
    role: "protagonist",
    summary: "A precise courier who fears another preventable loss.",
    personality: {
      archetype: "reluctant guardian",
      traits: ["observant", "dryly funny"],
      contradiction: "Protects strangers while avoiding intimacy.",
      desire: "Act on every useful warning.",
      fear: "Choosing who deserves help.",
      secret: "Ignored a warning tied to her brother.",
      moralLine: "Will not sacrifice an uninvolved person.",
      speechPattern: "Short factual clauses.",
      gestures: ["aligns edges before deciding"],
    },
    visual: {
      description: "Lean courier in a yellow rain shell.",
      agePresentation: "late twenties",
      silhouette: "angular oversized shell",
      face: "oval face and straight brows",
      hair: "black chin-length bob",
      wardrobe: ["yellow shell", "charcoal cargo trousers"],
      palette: ["#E5B72F", "#30353B"],
      imagePrompt: "Consistent full-body courier reference.",
      negativePrompt: "wardrobe or face drift",
      referenceImages: [
        {
          id: "char-001-image-001",
          status: "planned",
          description: "neutral turnaround",
        },
      ],
    },
    voice: {
      description: "Low, dry alto with clear consonants.",
      language: "zh-CN",
      timbre: "dry alto",
      pitch: "low-mid",
      pace: "measured",
      energy: "contained",
      accent: "light northern Mandarin",
      sampleText: "地址不会撒谎。",
      referenceAudio: [
        {
          id: "char-001-audio-001",
          status: "planned",
          description: "neutral voice reference",
        },
      ],
    },
    performance: {
      baseline: "eyes scan before head moves",
      underPressure: "speech accelerates",
      emotionalRange: "guarded concern to decisive anger",
      videoNotes: "preserve small eye movements",
    },
    continuity: {
      locks: ["scar remains under left eye"],
      allowedVariations: ["shell may be open indoors"],
      forbiddenChanges: ["scar mirrored"],
    },
    relationships: [],
    tags: ["courier", "lead"],
  })
  await writeFixtureFile(storyRoot, "assets/locations/loc-001/location.card.json", {
    schema: "convax.location-card/1",
    id: "loc-001",
    storyId: "story-night-mailbox",
    name: "Sorting room",
    description: "A narrow night sorting room with one flickering fluorescent tube.",
    visual: "Wet concrete floor, metal pigeonholes, cool green practical light.",
    continuityLocks: ["the north wall clock remains stopped at 00:17"],
    tags: ["interior", "night"],
  })
  await writeFixtureFile(storyRoot, "episodes/ep-001-the-letter/episode.storyboard.json", {
    schema: "convax.storyboard-episode/1",
    id: "ep-001",
    storyId: "story-night-mailbox",
    number: 1,
    title: "The Letter",
    logline: "Lin tests an impossible warning.",
    runtimeSeconds: 7,
    groupLabel: "EP001 · The Letter",
    scriptPath,
    continuity: {
      enters: ["char-001"],
      exits: [],
      locks: ["the envelope stays sealed"],
    },
    segments: [
      {
        id: "segment-001",
        number: 1,
        title: "The address changes",
        sceneSetting: "Night sorting room under one flickering fluorescent tube.",
        locationAssetId: "loc-001",
        durationSeconds: 7,
        status: "planned",
        shotIds: ["ep-001-shot-001"],
        assetRefs: ["char-001", "loc-001"],
        outputs: {
          keyframe: { status: "planned" },
          video: { status: "planned" },
          audio: { status: "planned" },
        },
      },
    ],
    shots: [
      {
        id: "ep-001-shot-001",
        number: 1,
        segmentId: "segment-001",
        title: "The impossible address",
        cardPath: shotPath,
        durationSeconds: 7,
        framing: "ECU",
        angle: "top-down",
        cameraMovement: "slow push-in",
        subject: "a rain-soaked envelope",
        action: "the ink rewrites itself",
        performance: "Lin freezes before touching it",
        dialogue: "",
        audio: "rain and paper fibers",
        locationId: "",
        characterIds: ["char-001"],
        assetRefs: [],
        continuityLocks: ["envelope seal intact"],
        imagePrompt: "Top-down macro frame of a wet red envelope.",
        videoPrompt: "Seven-second slow push-in; ink reforms once.",
        status: "planned",
      },
    ],
  })
  await writeFixtureFile(storyRoot, "story.storyboard.json", {
    schema: "convax.storyboard/1",
    id: "story-night-mailbox",
    slug: "night-mailbox",
    title: "Midnight Mailbox",
    logline: "A courier receives tomorrow's undelivered letters.",
    source: {
      mode: "premise",
      files: [`${prefix}source/original-brief.md`],
      connectedNodeIds: [],
    },
    format: {
      language: "zh-CN",
      genre: "mystery",
      aspectRatio: "9:16",
      targetEpisodeSeconds: 90,
    },
    biblePath: `${prefix}bible/series-bible.md`,
    continuityPath: `${prefix}bible/continuity.json`,
    assets: {
      characters: [{ id: "char-001", name: "Lin", path: characterPath }],
      locations: [{ id: "loc-001", name: "Sorting room", path: locationPath }],
      props: [],
    },
    episodes: [
      {
        id: "ep-001",
        number: 1,
        title: "The Letter",
        path: episodePath,
        groupLabel: "EP001 · The Letter",
        shotCount: 1,
        status: "draft",
      },
    ],
  })

  return { storyRoot, temporaryRoot }
}

describe("Storyboard Studio Skill package", () => {
  test("publishes the owned Skill contract and selective references", async () => {
    const skill = await read("SKILL.md")
    const metadata = JSON.parse(await fs.readFile(path.join(workspaceRoot, "convax-package.json"), "utf8"))
    const packageJson = JSON.parse(await fs.readFile(path.join(workspaceRoot, "package.json"), "utf8"))
    const openAiMetadata = await read("agents/openai.yaml")

    expect(metadata).toMatchObject({
      id: "storyboard-studio",
      ownerPluginId: "storyboard-studio",
      version: "0.1.1",
    })
    expect(packageJson.version).toBe("0.1.1")
    expect(skill).toContain("references/convax-capabilities.md")
    expect(skill).toContain("references/plugin-capabilities.md")
    expect(skill).toContain("references/story-file-layout.md")
    expect(skill).toContain("references/character-card.md")
    expect(skill).toContain("references/agent-workflow.md")
    expect(skill).toContain('type: "nodes.group"')
    expect(skill).toContain("exactly one to three ordered shots")
    expect(skill).toContain("shot to exactly one segment")
    expect(skill).toContain("Before any paid external generation or multi-asset batch")
    expect(skill).toContain("Never inspect or edit private `.convax` state")
    expect(openAiMetadata).toContain("$storyboard-studio")
  })

  test("validates a complete traceable story package", async () => {
    const { storyRoot, temporaryRoot } = await createValidStoryFixture()
    try {
      await expect(validateStoryPackage(storyRoot)).resolves.toMatchObject({
        assetCount: 2,
        episodeCount: 1,
        segmentCount: 1,
        shotCount: 1,
        storyId: "story-night-mailbox",
      })
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  test("accepts a confirmed segment output only after its episode file exists", async () => {
    const { storyRoot, temporaryRoot } = await createValidStoryFixture()
    try {
      const outputRelativePath = "episodes/ep-001-the-letter/outputs/images/segment-001.webp"
      await writeFixtureFile(storyRoot, outputRelativePath, "confirmed-image-bytes")
      const episodePath = path.join(
        storyRoot,
        "episodes",
        "ep-001-the-letter",
        "episode.storyboard.json",
      )
      const episode = JSON.parse(await fs.readFile(episodePath, "utf8"))
      episode.segments[0].outputs.keyframe = {
        status: "ready",
        path: `Storyboards/night-mailbox/${outputRelativePath}`,
        mimeType: "image/webp",
      }
      await fs.writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`)

      await expect(validateStoryPackage(storyRoot)).resolves.toMatchObject({
        segmentCount: 1,
      })
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  test("rejects a keyframe output outside the owning episode image directory", async () => {
    const { storyRoot, temporaryRoot } = await createValidStoryFixture()
    try {
      const wrongRelativePath = "episodes/ep-001-the-letter/outputs/video/segment-001.webp"
      await writeFixtureFile(storyRoot, wrongRelativePath, "misfiled-image-bytes")
      const episodePath = path.join(
        storyRoot,
        "episodes",
        "ep-001-the-letter",
        "episode.storyboard.json",
      )
      const episode = JSON.parse(await fs.readFile(episodePath, "utf8"))
      episode.segments[0].outputs.keyframe = {
        status: "ready",
        path: `Storyboards/night-mailbox/${wrongRelativePath}`,
      }
      await fs.writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`)

      await expect(validateStoryPackage(storyRoot)).rejects.toThrow(
        "must be below Storyboards/night-mailbox/episodes/ep-001-the-letter/outputs/images/",
      )
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  test("rejects a ready segment output whose file does not exist", async () => {
    const { storyRoot, temporaryRoot } = await createValidStoryFixture()
    try {
      const episodePath = path.join(
        storyRoot,
        "episodes",
        "ep-001-the-letter",
        "episode.storyboard.json",
      )
      const episode = JSON.parse(await fs.readFile(episodePath, "utf8"))
      episode.segments[0].outputs.video = {
        status: "ready",
        path: "Storyboards/night-mailbox/episodes/ep-001-the-letter/outputs/video/missing.mp4",
      }
      await fs.writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`)

      await expect(validateStoryPackage(storyRoot)).rejects.toThrow(
        "does not exist",
      )
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  test("rejects a shot assigned to more than one segment", async () => {
    const { storyRoot, temporaryRoot } = await createValidStoryFixture()
    try {
      const episodePath = path.join(
        storyRoot,
        "episodes",
        "ep-001-the-letter",
        "episode.storyboard.json",
      )
      const episode = JSON.parse(await fs.readFile(episodePath, "utf8"))
      episode.segments.push({
        ...episode.segments[0],
        id: "segment-002",
        number: 2,
        title: "Duplicate ownership",
      })
      await fs.writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`)

      await expect(validateStoryPackage(storyRoot)).rejects.toThrow(
        "every shot must belong to exactly one segment",
      )
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  test("rejects a shot left outside every segment", async () => {
    const { storyRoot, temporaryRoot } = await createValidStoryFixture()
    try {
      const episodePath = path.join(
        storyRoot,
        "episodes",
        "ep-001-the-letter",
        "episode.storyboard.json",
      )
      const episode = JSON.parse(await fs.readFile(episodePath, "utf8"))
      const secondShotPath =
        "Storyboards/night-mailbox/episodes/ep-001-the-letter/shots/shot-002-door.md"
      await writeFixtureFile(
        storyRoot,
        "episodes/ep-001-the-letter/shots/shot-002-door.md",
        "# Shot 002\n",
      )
      episode.shots.push({
        ...episode.shots[0],
        id: "ep-001-shot-002",
        number: 2,
        segmentId: undefined,
        title: "The locked door",
        cardPath: secondShotPath,
      })
      await fs.writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`)

      const rootPath = path.join(storyRoot, "story.storyboard.json")
      const story = JSON.parse(await fs.readFile(rootPath, "utf8"))
      story.episodes[0].shotCount = 2
      await fs.writeFile(rootPath, `${JSON.stringify(story, null, 2)}\n`)

      await expect(validateStoryPackage(storyRoot)).rejects.toThrow(
        "is unassigned; every shot must belong to exactly one segment",
      )
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  test("rejects a non-canonical segment id", async () => {
    const { storyRoot, temporaryRoot } = await createValidStoryFixture()
    try {
      const episodePath = path.join(
        storyRoot,
        "episodes",
        "ep-001-the-letter",
        "episode.storyboard.json",
      )
      const episode = JSON.parse(await fs.readFile(episodePath, "utf8"))
      episode.segments[0].id = "segment-01"
      await fs.writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`)

      await expect(validateStoryPackage(storyRoot)).rejects.toThrow(
        "must equal segment-001",
      )
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  test("rejects a segment with more than three shots", async () => {
    const { storyRoot, temporaryRoot } = await createValidStoryFixture()
    try {
      const episodePath = path.join(
        storyRoot,
        "episodes",
        "ep-001-the-letter",
        "episode.storyboard.json",
      )
      const episode = JSON.parse(await fs.readFile(episodePath, "utf8"))
      episode.segments[0].shotIds = [
        "ep-001-shot-001",
        "ep-001-shot-002",
        "ep-001-shot-003",
        "ep-001-shot-004",
      ]
      await fs.writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`)

      await expect(validateStoryPackage(storyRoot)).rejects.toThrow(
        "must contain between 1 and 3 shot ids",
      )
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  test("rejects a ready character asset that escapes its media directory", async () => {
    const { storyRoot, temporaryRoot } = await createValidStoryFixture()
    try {
      const characterPath = path.join(
        storyRoot,
        "assets",
        "characters",
        "char-001",
        "char-001.character.card.json",
      )
      const character = JSON.parse(await fs.readFile(characterPath, "utf8"))
      character.visual.referenceImages[0] = {
        id: "char-001-image-001",
        status: "ready",
        description: "unsafe reference",
        path: "Storyboards/night-mailbox/source/original-brief.md",
      }
      await fs.writeFile(characterPath, `${JSON.stringify(character, null, 2)}\n`)

      await expect(validateStoryPackage(storyRoot)).rejects.toThrow(
        "must be below Storyboards/night-mailbox/assets/characters/char-001/images/",
      )
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  test("rejects a story manifest placed under a different physical story slug", async () => {
    const { storyRoot, temporaryRoot } = await createValidStoryFixture()
    const mismatchedRoot = path.join(temporaryRoot, "Storyboards", "different-slug")
    try {
      await fs.rename(storyRoot, mismatchedRoot)
      await expect(validateStoryPackage(mismatchedRoot)).rejects.toThrow(
        "must be the physical Storyboards/night-mailbox/ directory",
      )
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  test("rejects a ready media file reached through an intermediate directory symlink", async () => {
    const { storyRoot, temporaryRoot } = await createValidStoryFixture()
    try {
      const externalImages = path.join(temporaryRoot, "external-images")
      await fs.mkdir(externalImages)
      await fs.writeFile(path.join(externalImages, "reference.webp"), "not-a-real-image")
      const imagesLink = path.join(storyRoot, "assets", "characters", "char-001", "images")
      await fs.symlink(externalImages, imagesLink, "dir")

      const characterPath = path.join(
        storyRoot,
        "assets",
        "characters",
        "char-001",
        "char-001.character.card.json",
      )
      const character = JSON.parse(await fs.readFile(characterPath, "utf8"))
      character.visual.referenceImages[0] = {
        id: "char-001-image-001",
        status: "ready",
        description: "symlinked reference",
        path: "Storyboards/night-mailbox/assets/characters/char-001/images/reference.webp",
      }
      await fs.writeFile(characterPath, `${JSON.stringify(character, null, 2)}\n`)

      await expect(validateStoryPackage(storyRoot)).rejects.toThrow(
        "must not traverse a symlink",
      )
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  test("rejects a symlinked root story manifest", async () => {
    const { storyRoot, temporaryRoot } = await createValidStoryFixture()
    try {
      const manifestPath = path.join(storyRoot, "story.storyboard.json")
      const externalManifest = path.join(temporaryRoot, "external-story.json")
      await fs.copyFile(manifestPath, externalManifest)
      await fs.rm(manifestPath)
      await fs.symlink(externalManifest, manifestPath)
      await expect(validateStoryPackage(storyRoot)).rejects.toThrow(
        "story.storyboard.json: must be a regular non-symlink file",
      )
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    }
  })
})
