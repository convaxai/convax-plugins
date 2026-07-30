import fs from "node:fs/promises"
import path from "node:path"

const STORY_SCHEMA = "convax.storyboard/1"
const EPISODE_SCHEMA = "convax.storyboard-episode/1"
const CHARACTER_SCHEMA = "convax.character-card/1"
const LOCATION_SCHEMA = "convax.location-card/1"
const PROP_SCHEMA = "convax.prop-card/1"
const MEDIA_STATES = new Set([
  "planned",
  "queued",
  "running",
  "ready",
  "failed",
  "missing-media",
])
const SEGMENT_STATES = new Set([
  "draft",
  "planned",
  "queued",
  "running",
  "generating",
  "ready",
  "failed",
  "missing-media",
])
const SOURCE_MODES = new Set(["premise", "script", "connected", "mixed"])
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function fail(label, message) {
  throw new Error(`${label}: ${message}`)
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(label, "must be an object")
  }
  return value
}

function text(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(label, "must be a non-empty string")
  }
  return value
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(label, `must be an integer >= ${minimum}`)
  }
  return value
}

function number(value, label, minimum = 0) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    fail(label, `must be a finite number >= ${minimum}`)
  }
  return value
}

function array(value, label) {
  if (!Array.isArray(value)) fail(label, "must be an array")
  return value
}

function textArray(value, label) {
  const items = array(value, label).map((item, index) => text(item, `${label}[${index}]`))
  if (new Set(items).size !== items.length) fail(label, "must not contain duplicates")
  return items
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) fail(label, "must not contain duplicates")
}

function assertSortedNumbers(values, label) {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] >= values[index]) fail(label, "must be strictly increasing")
  }
}

function projectPath(value, storyPrefix, label) {
  const candidate = text(value, label)
  if (
    candidate.includes("\\") ||
    path.posix.isAbsolute(candidate) ||
    path.posix.normalize(candidate) !== candidate ||
    candidate.split("/").some((part) => part === "." || part === "..") ||
    !candidate.startsWith(storyPrefix)
  ) {
    fail(label, `must be a normalized Project-relative path below ${storyPrefix}`)
  }
  return candidate
}

async function regularFile(storyRoot, storyPrefix, projectRelativePath, label) {
  const checked = projectPath(projectRelativePath, storyPrefix, label)
  const localRelativePath = checked.slice(storyPrefix.length)
  if (!localRelativePath) fail(label, "must name a file below the story root")
  const parts = localRelativePath.split("/")
  let localPath = storyRoot
  for (const [index, part] of parts.entries()) {
    localPath = path.join(localPath, part)
    let stat
    try {
      stat = await fs.lstat(localPath)
    } catch {
      fail(label, `does not exist: ${checked}`)
    }
    if (stat.isSymbolicLink()) {
      fail(label, `must not traverse a symlink: ${checked}`)
    }
    if (index < parts.length - 1 && !stat.isDirectory()) {
      fail(label, `has a non-directory parent component: ${checked}`)
    }
    if (index === parts.length - 1 && !stat.isFile()) {
      fail(label, `must resolve to a regular file: ${checked}`)
    }
  }
  return localPath
}

async function readJsonFile(storyRoot, storyPrefix, projectRelativePath, label) {
  const localPath = await regularFile(storyRoot, storyPrefix, projectRelativePath, label)
  let source
  try {
    source = await fs.readFile(localPath, "utf8")
  } catch {
    fail(label, "could not be read")
  }
  try {
    return JSON.parse(source)
  } catch {
    fail(label, "must contain valid JSON")
  }
}

function requireSchema(document, expected, label) {
  const value = record(document, label)
  if (value.schema !== expected) fail(`${label}.schema`, `must equal ${expected}`)
  return value
}

function validateEntityId(id, prefix, label) {
  const value = text(id, label)
  if (!new RegExp(`^${prefix}-[0-9]{3,}$`).test(value)) {
    fail(label, `must match ${prefix}-<three-or-more digits>`)
  }
  return value
}

async function validateMediaReferences(input) {
  const { items, label, expectedDirectory, storyRoot, storyPrefix } = input
  const ids = []
  for (const [index, raw] of array(items, label).entries()) {
    const itemLabel = `${label}[${index}]`
    const item = record(raw, itemLabel)
    ids.push(text(item.id, `${itemLabel}.id`))
    const state = text(item.status, `${itemLabel}.status`)
    if (!MEDIA_STATES.has(state)) {
      fail(
        `${itemLabel}.status`,
        "must be planned, queued, running, ready, failed, or missing-media",
      )
    }
    text(item.description, `${itemLabel}.description`)
    if (state !== "ready" && item.path !== undefined) {
      fail(`${itemLabel}.path`, "is allowed only when status is ready")
    }
    if (state === "ready") {
      const readyPath = projectPath(item.path, storyPrefix, `${itemLabel}.path`)
      if (!readyPath.startsWith(expectedDirectory)) {
        fail(`${itemLabel}.path`, `must be below ${expectedDirectory}`)
      }
      await regularFile(storyRoot, storyPrefix, readyPath, `${itemLabel}.path`)
    }
  }
  assertUnique(ids, `${label} ids`)
}

async function validateSegmentOutput(input) {
  const {
    raw,
    label,
    expectedDirectory,
    storyRoot,
    storyPrefix,
  } = input
  const output = record(raw, label)
  const state = text(output.status, `${label}.status`)
  if (!MEDIA_STATES.has(state)) {
    fail(
      `${label}.status`,
      "must be planned, queued, running, ready, failed, or missing-media",
    )
  }
  if (state !== "ready" && output.path !== undefined) {
    fail(`${label}.path`, "is allowed only when status is ready")
  }
  if (state === "ready") {
    const readyPath = projectPath(output.path, storyPrefix, `${label}.path`)
    if (!readyPath.startsWith(expectedDirectory)) {
      fail(`${label}.path`, `must be below ${expectedDirectory}`)
    }
    await regularFile(storyRoot, storyPrefix, readyPath, `${label}.path`)
  }
  if (output.mimeType !== undefined) text(output.mimeType, `${label}.mimeType`)
  if (output.durationSeconds !== undefined) {
    number(output.durationSeconds, `${label}.durationSeconds`, 0)
  }
}

async function validateCharacterCard(input) {
  const { document, entry, story, storyRoot, storyPrefix, characterIds } = input
  const label = `character ${entry.id}`
  const card = requireSchema(document, CHARACTER_SCHEMA, label)
  if (card.id !== entry.id) fail(`${label}.id`, `must equal ${entry.id}`)
  if (card.storyId !== story.id) fail(`${label}.storyId`, `must equal ${story.id}`)
  text(card.name, `${label}.name`)
  text(card.role, `${label}.role`)
  text(card.summary, `${label}.summary`)

  const personality = record(card.personality, `${label}.personality`)
  for (const field of ["archetype", "contradiction", "desire", "fear", "secret", "moralLine", "speechPattern"]) {
    text(personality[field], `${label}.personality.${field}`)
  }
  textArray(personality.traits, `${label}.personality.traits`)
  textArray(personality.gestures, `${label}.personality.gestures`)

  const visual = record(card.visual, `${label}.visual`)
  for (const field of ["description", "agePresentation", "silhouette", "face", "hair", "imagePrompt", "negativePrompt"]) {
    text(visual[field], `${label}.visual.${field}`)
  }
  textArray(visual.wardrobe, `${label}.visual.wardrobe`)
  textArray(visual.palette, `${label}.visual.palette`)
  await validateMediaReferences({
    items: visual.referenceImages,
    label: `${label}.visual.referenceImages`,
    expectedDirectory: `${storyPrefix}assets/characters/${card.id}/images/`,
    storyRoot,
    storyPrefix,
  })

  const voice = record(card.voice, `${label}.voice`)
  for (const field of ["description", "language", "timbre", "pitch", "pace", "energy", "accent", "sampleText"]) {
    text(voice[field], `${label}.voice.${field}`)
  }
  await validateMediaReferences({
    items: voice.referenceAudio,
    label: `${label}.voice.referenceAudio`,
    expectedDirectory: `${storyPrefix}assets/characters/${card.id}/audio/`,
    storyRoot,
    storyPrefix,
  })

  const performance = record(card.performance, `${label}.performance`)
  for (const field of ["baseline", "underPressure", "emotionalRange", "videoNotes"]) {
    text(performance[field], `${label}.performance.${field}`)
  }

  const continuity = record(card.continuity, `${label}.continuity`)
  textArray(continuity.locks, `${label}.continuity.locks`)
  textArray(continuity.allowedVariations, `${label}.continuity.allowedVariations`)
  textArray(continuity.forbiddenChanges, `${label}.continuity.forbiddenChanges`)

  for (const [index, raw] of array(card.relationships, `${label}.relationships`).entries()) {
    const relationshipLabel = `${label}.relationships[${index}]`
    const relationship = record(raw, relationshipLabel)
    if (relationship.unresolved === true) {
      text(relationship.label, `${relationshipLabel}.label`)
    } else {
      const target = text(relationship.characterId, `${relationshipLabel}.characterId`)
      if (!characterIds.has(target)) fail(`${relationshipLabel}.characterId`, "must reference a declared character")
    }
    text(relationship.dynamic, `${relationshipLabel}.dynamic`)
  }
  textArray(card.tags, `${label}.tags`)
}

function validateSimpleAssetCard(document, input) {
  const { entry, expectedSchema, story, kind } = input
  const label = `${kind} ${entry.id}`
  const card = requireSchema(document, expectedSchema, label)
  if (card.id !== entry.id) fail(`${label}.id`, `must equal ${entry.id}`)
  if (card.storyId !== story.id) fail(`${label}.storyId`, `must equal ${story.id}`)
  text(card.name, `${label}.name`)
  text(card.description, `${label}.description`)
  text(card.visual, `${label}.visual`)
  textArray(card.continuityLocks, `${label}.continuityLocks`)
  textArray(card.tags, `${label}.tags`)
}

async function validateEpisode(input) {
  const { document, entry, story, storyRoot, storyPrefix, allAssetIds, characterIds, locationIds } = input
  const label = `episode ${entry.id}`
  const episode = requireSchema(document, EPISODE_SCHEMA, label)
  if (episode.id !== entry.id) fail(`${label}.id`, `must equal ${entry.id}`)
  if (episode.storyId !== story.id) fail(`${label}.storyId`, `must equal ${story.id}`)
  if (episode.number !== entry.number) fail(`${label}.number`, `must equal ${entry.number}`)
  if (episode.groupLabel !== entry.groupLabel) fail(`${label}.groupLabel`, "must match the root manifest")
  text(episode.title, `${label}.title`)
  text(episode.logline, `${label}.logline`)
  number(episode.runtimeSeconds, `${label}.runtimeSeconds`, 1)
  const episodePath = projectPath(entry.path, storyPrefix, `${label}.path`)
  const episodeDirectory = `${path.posix.dirname(episodePath)}/`
  await regularFile(storyRoot, storyPrefix, episode.scriptPath, `${label}.scriptPath`)

  const continuity = record(episode.continuity, `${label}.continuity`)
  for (const field of ["enters", "exits"]) {
    const ids = textArray(continuity[field], `${label}.continuity.${field}`)
    for (const id of ids) {
      if (!characterIds.has(id)) fail(`${label}.continuity.${field}`, `references undeclared character ${id}`)
    }
  }
  textArray(continuity.locks, `${label}.continuity.locks`)

  const shots = array(episode.shots, `${label}.shots`)
  if (shots.length !== entry.shotCount) fail(`${label}.shots`, `count must equal root shotCount ${entry.shotCount}`)
  const shotIds = []
  const shotNumbers = []
  const shotsById = new Map()
  for (const [index, raw] of shots.entries()) {
    const shotLabel = `${label}.shots[${index}]`
    const shot = record(raw, shotLabel)
    const shotNumber = integer(shot.number, `${shotLabel}.number`, 1)
    const expectedId = `${episode.id}-shot-${String(shotNumber).padStart(3, "0")}`
    if (shot.id !== expectedId) fail(`${shotLabel}.id`, `must equal ${expectedId}`)
    shotIds.push(shot.id)
    shotNumbers.push(shotNumber)
    for (const field of [
      "title",
      "framing",
      "angle",
      "cameraMovement",
      "subject",
      "action",
      "performance",
      "audio",
      "imagePrompt",
      "videoPrompt",
      "status",
    ]) {
      text(shot[field], `${shotLabel}.${field}`)
    }
    if (typeof shot.dialogue !== "string") fail(`${shotLabel}.dialogue`, "must be a string")
    number(shot.durationSeconds, `${shotLabel}.durationSeconds`, 0)
    await regularFile(storyRoot, storyPrefix, shot.cardPath, `${shotLabel}.cardPath`)
    if (shot.locationId && !locationIds.has(shot.locationId)) {
      fail(`${shotLabel}.locationId`, `references undeclared location ${shot.locationId}`)
    }
    for (const id of textArray(shot.characterIds, `${shotLabel}.characterIds`)) {
      if (!characterIds.has(id)) fail(`${shotLabel}.characterIds`, `references undeclared character ${id}`)
    }
    for (const id of textArray(shot.assetRefs, `${shotLabel}.assetRefs`)) {
      if (!allAssetIds.has(id)) fail(`${shotLabel}.assetRefs`, `references undeclared asset ${id}`)
    }
    textArray(shot.continuityLocks, `${shotLabel}.continuityLocks`)
    shotsById.set(shot.id, shot)
  }
  assertUnique(shotIds, `${label} shot ids`)
  assertUnique(shotNumbers, `${label} shot numbers`)
  assertSortedNumbers(shotNumbers, `${label} shot numbers`)

  const segments = array(episode.segments, `${label}.segments`)
  if (segments.length === 0) fail(`${label}.segments`, "must contain at least one segment")
  const segmentIds = []
  const segmentNumbers = []
  const segmentByShotId = new Map()
  for (const [index, raw] of segments.entries()) {
    const segmentLabel = `${label}.segments[${index}]`
    const segment = record(raw, segmentLabel)
    const segmentNumber = integer(segment.number, `${segmentLabel}.number`, 1)
    if (segmentNumber > 999) fail(`${segmentLabel}.number`, "must be <= 999")
    const expectedId = `segment-${String(segmentNumber).padStart(3, "0")}`
    if (segment.id !== expectedId) fail(`${segmentLabel}.id`, `must equal ${expectedId}`)
    segmentIds.push(segment.id)
    segmentNumbers.push(segmentNumber)
    text(segment.title, `${segmentLabel}.title`)
    text(segment.sceneSetting, `${segmentLabel}.sceneSetting`)
    const locationAssetId = text(
      segment.locationAssetId,
      `${segmentLabel}.locationAssetId`,
    )
    if (!locationIds.has(locationAssetId)) {
      fail(
        `${segmentLabel}.locationAssetId`,
        `references undeclared location ${locationAssetId}`,
      )
    }
    const segmentDuration = number(
      segment.durationSeconds,
      `${segmentLabel}.durationSeconds`,
      0,
    )
    if (segmentDuration <= 0) {
      fail(`${segmentLabel}.durationSeconds`, "must be greater than 0")
    }
    const state = text(segment.status, `${segmentLabel}.status`)
    if (!SEGMENT_STATES.has(state)) {
      fail(
        `${segmentLabel}.status`,
        "must be draft, planned, queued, running, generating, ready, failed, or missing-media",
      )
    }

    const segmentShotIds = textArray(segment.shotIds, `${segmentLabel}.shotIds`)
    if (segmentShotIds.length < 1 || segmentShotIds.length > 3) {
      fail(`${segmentLabel}.shotIds`, "must contain between 1 and 3 shot ids")
    }
    for (const shotId of segmentShotIds) {
      if (!shotsById.has(shotId)) {
        fail(`${segmentLabel}.shotIds`, `references undeclared shot ${shotId}`)
      }
      const existingSegmentId = segmentByShotId.get(shotId)
      if (existingSegmentId) {
        fail(
          `${segmentLabel}.shotIds`,
          `${shotId} already belongs to ${existingSegmentId}; every shot must belong to exactly one segment`,
        )
      }
      segmentByShotId.set(shotId, segment.id)
    }

    for (const id of textArray(segment.assetRefs, `${segmentLabel}.assetRefs`)) {
      if (!allAssetIds.has(id)) {
        fail(`${segmentLabel}.assetRefs`, `references undeclared asset ${id}`)
      }
    }

    const outputs = record(segment.outputs, `${segmentLabel}.outputs`)
    await validateSegmentOutput({
      raw: outputs.keyframe,
      label: `${segmentLabel}.outputs.keyframe`,
      expectedDirectory: `${episodeDirectory}outputs/images/`,
      storyRoot,
      storyPrefix,
    })
    await validateSegmentOutput({
      raw: outputs.video,
      label: `${segmentLabel}.outputs.video`,
      expectedDirectory: `${episodeDirectory}outputs/video/`,
      storyRoot,
      storyPrefix,
    })
    await validateSegmentOutput({
      raw: outputs.audio,
      label: `${segmentLabel}.outputs.audio`,
      expectedDirectory: `${episodeDirectory}outputs/audio/`,
      storyRoot,
      storyPrefix,
    })
  }
  assertUnique(segmentIds, `${label} segment ids`)
  assertUnique(segmentNumbers, `${label} segment numbers`)
  assertSortedNumbers(segmentNumbers, `${label} segment numbers`)

  for (const shotId of shotIds) {
    const segmentId = segmentByShotId.get(shotId)
    if (!segmentId) {
      fail(
        `${label}.segments`,
        `${shotId} is unassigned; every shot must belong to exactly one segment`,
      )
    }
    const shot = shotsById.get(shotId)
    if (shot.segmentId !== undefined && shot.segmentId !== segmentId) {
      fail(
        `${label}.shots`,
        `${shotId}.segmentId must equal its owning segment ${segmentId}`,
      )
    }
  }

  return {
    segmentCount: segments.length,
    shotCount: shots.length,
  }
}

export async function validateStoryPackage(inputPath) {
  const storyRoot = path.resolve(text(inputPath, "story directory"))
  let rootStat
  try {
    rootStat = await fs.lstat(storyRoot)
  } catch {
    fail("story directory", "does not exist")
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    fail("story directory", "must be a non-symlink directory")
  }
  const storyboardsRoot = path.dirname(storyRoot)
  const storyboardsRootStat = await fs.lstat(storyboardsRoot)
  if (storyboardsRootStat.isSymbolicLink() || !storyboardsRootStat.isDirectory()) {
    fail("Storyboards directory", "must be a non-symlink directory")
  }

  const rootManifestPath = path.join(storyRoot, "story.storyboard.json")
  let rootManifestStat
  try {
    rootManifestStat = await fs.lstat(rootManifestPath)
  } catch {
    fail("story.storyboard.json", "does not exist or cannot be read")
  }
  if (rootManifestStat.isSymbolicLink() || !rootManifestStat.isFile()) {
    fail("story.storyboard.json", "must be a regular non-symlink file")
  }
  let storySource
  try {
    storySource = await fs.readFile(rootManifestPath, "utf8")
  } catch {
    fail("story.storyboard.json", "does not exist or cannot be read")
  }
  let storyDocument
  try {
    storyDocument = JSON.parse(storySource)
  } catch {
    fail("story.storyboard.json", "must contain valid JSON")
  }
  const story = requireSchema(storyDocument, STORY_SCHEMA, "story")
  const slug = text(story.slug, "story.slug")
  if (!SLUG_PATTERN.test(slug)) fail("story.slug", "must be a lowercase POSIX slug")
  if (story.id !== `story-${slug}`) fail("story.id", `must equal story-${slug}`)
  if (
    path.basename(storyRoot) !== slug ||
    path.basename(path.dirname(storyRoot)) !== "Storyboards"
  ) {
    fail(
      "story directory",
      `must be the physical Storyboards/${slug}/ directory named by story.slug`,
    )
  }
  text(story.title, "story.title")
  text(story.logline, "story.logline")
  const storyPrefix = `Storyboards/${slug}/`

  const source = record(story.source, "story.source")
  if (!SOURCE_MODES.has(source.mode)) fail("story.source.mode", "must be premise, script, connected, or mixed")
  const sourceFiles = array(source.files, "story.source.files")
  if (sourceFiles.length === 0) fail("story.source.files", "must contain at least one durable source snapshot")
  for (const [index, sourcePath] of sourceFiles.entries()) {
    await regularFile(storyRoot, storyPrefix, sourcePath, `story.source.files[${index}]`)
  }
  textArray(source.connectedNodeIds, "story.source.connectedNodeIds")

  const format = record(story.format, "story.format")
  for (const field of ["language", "genre", "aspectRatio"]) text(format[field], `story.format.${field}`)
  number(format.targetEpisodeSeconds, "story.format.targetEpisodeSeconds", 1)
  await regularFile(storyRoot, storyPrefix, story.biblePath, "story.biblePath")
  await readJsonFile(storyRoot, storyPrefix, story.continuityPath, "story.continuityPath")

  const assets = record(story.assets, "story.assets")
  const assetKinds = [
    { field: "characters", prefix: "char", schema: CHARACTER_SCHEMA, kind: "character" },
    { field: "locations", prefix: "loc", schema: LOCATION_SCHEMA, kind: "location" },
    { field: "props", prefix: "prop", schema: PROP_SCHEMA, kind: "prop" },
  ]
  const entriesByKind = new Map()
  const allAssetIds = new Set()
  for (const definition of assetKinds) {
    const entries = array(assets[definition.field], `story.assets.${definition.field}`)
    const ids = []
    for (const [index, raw] of entries.entries()) {
      const label = `story.assets.${definition.field}[${index}]`
      const entry = record(raw, label)
      entry.id = validateEntityId(entry.id, definition.prefix, `${label}.id`)
      text(entry.name, `${label}.name`)
      const entryPath = projectPath(entry.path, storyPrefix, `${label}.path`)
      if (definition.field === "characters") {
        const expectedPath =
          `${storyPrefix}assets/characters/${entry.id}/${entry.id}.character.card.json`
        if (entryPath !== expectedPath) {
          fail(`${label}.path`, `must equal ${expectedPath}`)
        }
      }
      ids.push(entry.id)
      if (allAssetIds.has(entry.id)) fail(`${label}.id`, "must be unique across every asset kind")
      allAssetIds.add(entry.id)
    }
    assertUnique(ids, `story.assets.${definition.field} ids`)
    entriesByKind.set(definition.field, entries)
  }
  const characterIds = new Set(entriesByKind.get("characters").map((entry) => entry.id))
  const locationIds = new Set(entriesByKind.get("locations").map((entry) => entry.id))

  for (const definition of assetKinds) {
    for (const entry of entriesByKind.get(definition.field)) {
      const document = await readJsonFile(storyRoot, storyPrefix, entry.path, `${definition.kind} ${entry.id} path`)
      if (definition.field === "characters") {
        await validateCharacterCard({ document, entry, story, storyRoot, storyPrefix, characterIds })
      } else {
        validateSimpleAssetCard(document, {
          entry,
          expectedSchema: definition.schema,
          story,
          kind: definition.kind,
        })
      }
    }
  }

  const episodes = array(story.episodes, "story.episodes")
  if (episodes.length === 0) fail("story.episodes", "must contain at least one episode")
  const episodeIds = []
  const episodeNumbers = []
  for (const [index, raw] of episodes.entries()) {
    const label = `story.episodes[${index}]`
    const entry = record(raw, label)
    const episodeNumber = integer(entry.number, `${label}.number`, 1)
    const expectedId = `ep-${String(episodeNumber).padStart(3, "0")}`
    if (entry.id !== expectedId) fail(`${label}.id`, `must equal ${expectedId}`)
    episodeIds.push(entry.id)
    episodeNumbers.push(episodeNumber)
    text(entry.title, `${label}.title`)
    projectPath(entry.path, storyPrefix, `${label}.path`)
    text(entry.groupLabel, `${label}.groupLabel`)
    integer(entry.shotCount, `${label}.shotCount`, 1)
    text(entry.status, `${label}.status`)
  }
  assertUnique(episodeIds, "story episode ids")
  assertUnique(episodeNumbers, "story episode numbers")
  assertSortedNumbers(episodeNumbers, "story episode numbers")

  let shotCount = 0
  let segmentCount = 0
  for (const entry of episodes) {
    const document = await readJsonFile(storyRoot, storyPrefix, entry.path, `episode ${entry.id} path`)
    const counts = await validateEpisode({
      document,
      entry,
      story,
      storyRoot,
      storyPrefix,
      allAssetIds,
      characterIds,
      locationIds,
    })
    shotCount += counts.shotCount
    segmentCount += counts.segmentCount
  }

  return {
    assetCount: allAssetIds.size,
    episodeCount: episodes.length,
    segmentCount,
    shotCount,
    storyId: story.id,
    storyRoot,
  }
}

if (import.meta.main) {
  const storyDirectory = process.argv[2]
  if (!storyDirectory || process.argv.length !== 3) {
    throw new Error("Usage: bun scripts/validate-story-package.mjs <Storyboards/story-slug>")
  }
  const result = await validateStoryPackage(storyDirectory)
  console.log(
    `Validated ${result.storyId}: ${result.episodeCount} episode(s), ${result.segmentCount} segment(s), ${result.shotCount} shot(s), ${result.assetCount} asset(s).`,
  )
}
