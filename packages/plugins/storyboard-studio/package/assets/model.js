const MAX_TEXT = 40_000
const MAX_COLLECTION = 500
const PATH_SEGMENT = /^[^/\\\0]+$/u

export const STORY_SCHEMA = "convax.storyboard/1"
export const EPISODE_SCHEMA = "convax.storyboard-episode/1"
export const CHARACTER_SCHEMA = "convax.character-card/1"
const MEDIA_STATUSES = new Set(["planned", "queued", "running", "ready", "failed", "missing-media"])
const SEGMENT_STATUSES = new Set(["draft", "planned", "queued", "running", "generating", "ready", "failed", "missing-media"])

export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function boundedText(value, maximum = MAX_TEXT, fallback = "") {
  if (typeof value !== "string") return fallback
  const text = value.trim()
  return text && text.length <= maximum ? text : fallback
}

export function boundedNumber(value, fallback = 0, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback
}

export function portableProjectPath(value) {
  const path = boundedText(value, 1_024)
  if (
    !path ||
    path.startsWith("/") ||
    /^[a-z]:\//iu.test(path) ||
    path.includes("\\") ||
    path.includes("\0")
  ) {
    return ""
  }
  const segments = path.split("/")
  if (
    segments[0]?.toLowerCase() === ".convax" ||
    segments.some((segment) => !PATH_SEGMENT.test(segment) || segment === "." || segment === "..")
  ) return ""
  return path
}

export function storyboardRootPath(value) {
  const path = portableProjectPath(value)
  const segments = path.split("/")
  return segments[0] === "Storyboards" && segments.length >= 3
    ? segments.slice(0, 2).join("/")
    : ""
}

export function isStoryboardDocumentPath(value) {
  const path = portableProjectPath(value)
  return Boolean(
    storyboardRootPath(path) &&
    (
      path.endsWith(".storyboard.json") ||
      path.endsWith(".character.card.json")
    ),
  )
}

function confinedPath(value, root) {
  const path = portableProjectPath(value)
  return path && (!root || path.startsWith(`${root}/`)) ? path : ""
}

function cleanId(value, fallback) {
  const id = boundedText(value, 160)
  return /^[a-z0-9][a-z0-9._-]*$/iu.test(id) ? id : fallback
}

function cleanArray(value, normalizer) {
  if (!Array.isArray(value) || value.length > MAX_COLLECTION) return []
  return value.map(normalizer).filter(Boolean)
}

function stringList(value, maximum = 50) {
  if (!Array.isArray(value) || value.length > maximum) return []
  return value.map((item) => boundedText(item, 400)).filter(Boolean)
}

function mediaReferences(value, maximum = 50, requiredRoot = "") {
  if (!Array.isArray(value) || value.length > maximum) return []
  return value
    .map((item, index) => {
      if (typeof item === "string") {
        const path = requiredRoot ? confinedPath(item, requiredRoot) : portableProjectPath(item)
        return path ? { id: `media-${index + 1}`, path, status: "ready", description: "" } : null
      }
      if (!isRecord(item)) return null
      const requestedStatus = boundedText(item.status, 20, "planned")
      const status = MEDIA_STATUSES.has(requestedStatus) ? requestedStatus : "planned"
      const path = requiredRoot
        ? confinedPath(item.path, requiredRoot)
        : portableProjectPath(item.path)
      if (status === "ready" && !path) return null
      return {
        id: cleanId(item.id, `media-${index + 1}`),
        status,
        path: status === "ready" ? path : "",
        description: boundedText(item.description, 800),
      }
    })
    .filter(Boolean)
}

function normalizeReference(value, fallbackKind) {
  if (!isRecord(value)) return null
  const id = cleanId(value.id ?? value.characterId ?? value.locationId ?? value.propId, "")
  const path = portableProjectPath(value.path)
  const name = boundedText(value.name ?? value.title, 200, id)
  if (!id && !path) return null
  return {
    id: id || path,
    kind: boundedText(value.kind, 32, fallbackKind),
    name,
    path,
    role: boundedText(value.role ?? value.roleType, 100),
    summary: boundedText(value.summary ?? value.description, 2_000),
    tags: stringList(value.tags, 30),
  }
}

export function normalizeMediaOutput(value, storyRoot = "", requiredDirectory = "") {
  if (typeof value === "string") {
    const candidate = confinedPath(value, storyRoot)
    const path = candidate && (!requiredDirectory || candidate.startsWith(requiredDirectory))
      ? candidate
      : ""
    return {
      status: path ? "ready" : "missing-media",
      path,
      mimeType: "",
      durationSeconds: 0,
    }
  }
  if (!isRecord(value)) {
    return { status: "planned", path: "", mimeType: "", durationSeconds: 0 }
  }
  const requestedStatus = boundedText(value.status, 30, "planned")
  let status = MEDIA_STATUSES.has(requestedStatus) ? requestedStatus : "planned"
  const candidate = confinedPath(value.path, storyRoot)
  const path = candidate && (!requiredDirectory || candidate.startsWith(requiredDirectory))
    ? candidate
    : ""
  if (status === "ready" && !path) status = "missing-media"
  return {
    status,
    path: status === "ready" ? path : "",
    mimeType: boundedText(value.mimeType ?? value.mime, 160),
    durationSeconds: boundedNumber(value.durationSeconds ?? value.duration, 0, 0, 43_200),
  }
}

export function normalizeShot(value, index = 0, storyRoot = "", episodeDirectory = "") {
  if (!isRecord(value)) return null
  const number = Math.trunc(boundedNumber(value.number ?? value.order, index + 1, 1, 9_999))
  const id = cleanId(value.id ?? value.shotId, `shot-${String(number).padStart(3, "0")}`)
  const characterIds = stringList(value.characterIds ?? value.characters, 50)
  const description = [
    boundedText(value.description ?? value.visual, 5_000),
    boundedText(value.subject, 1_000),
    boundedText(value.action, 2_000),
    boundedText(value.performance, 1_000),
  ].filter(Boolean).join(" · ")
  return {
    id,
    number,
    title: boundedText(value.title, 200, `镜头 ${String(number).padStart(2, "0")}`),
    description,
    dialogue: boundedText(value.dialogue, 3_000),
    sound: boundedText(value.sound ?? value.audio, 1_000),
    durationSeconds: boundedNumber(value.durationSeconds ?? value.duration, 3, 0, 3_600),
    shotSize: boundedText(value.shotSize ?? value.framing, 80, "中景"),
    angle: boundedText(value.angle, 80, "平视"),
    cameraMove: boundedText(value.cameraMove ?? value.cameraMovement ?? value.camera, 100, "固定"),
    locationId: cleanId(value.locationId, ""),
    characterIds,
    assetRefs: stringList(value.assetRefs, 100),
    continuityLocks: stringList(value.continuityLocks, 100),
    imagePrompt: boundedText(value.imagePrompt ?? value.prompt ?? value.framePrompt, 8_000),
    videoPrompt: boundedText(value.videoPrompt, 8_000),
    prompt: boundedText(value.prompt ?? value.framePrompt ?? value.imagePrompt, 8_000),
    segmentId: cleanId(value.segmentId, ""),
    path: portableProjectPath(value.path ?? value.cardPath),
    status: boundedText(value.status, 40, "draft"),
    outputs: {
      keyframe: normalizeMediaOutput(
        value.outputs?.keyframe ?? value.keyframe,
        storyRoot,
        episodeDirectory ? `${episodeDirectory}/outputs/images/` : "",
      ),
      video: normalizeMediaOutput(
        value.outputs?.video ?? value.video,
        storyRoot,
        episodeDirectory ? `${episodeDirectory}/outputs/video/` : "",
      ),
      audio: normalizeMediaOutput(
        value.outputs?.audio,
        storyRoot,
        episodeDirectory ? `${episodeDirectory}/outputs/audio/` : "",
      ),
    },
  }
}

function normalizeSegment(value, index, shots, storyRoot, episodeDirectory) {
  if (!isRecord(value)) return null
  const number = Math.trunc(boundedNumber(value.number ?? value.order, index + 1, 1, 9_999))
  const id = cleanId(value.id ?? value.segmentId, `segment-${String(number).padStart(3, "0")}`)
  const knownShotIds = new Set(shots.map((shot) => shot.id))
  const rawShotIds = Array.isArray(value.shotIds)
    ? value.shotIds
    : Array.isArray(value.shots)
      ? value.shots.map((shot) => isRecord(shot) ? shot.id : shot)
      : []
  const shotIds = stringList(rawShotIds, 100).filter((shotId) => knownShotIds.has(shotId))
  const segmentShots = shots.filter((shot) => shotIds.includes(shot.id))
  const outputs = {
    keyframe: normalizeMediaOutput(
      value.outputs?.keyframe ?? value.keyframe,
      storyRoot,
      episodeDirectory ? `${episodeDirectory}/outputs/images/` : "",
    ),
    video: normalizeMediaOutput(
      value.outputs?.video ?? value.video,
      storyRoot,
      episodeDirectory ? `${episodeDirectory}/outputs/video/` : "",
    ),
    audio: normalizeMediaOutput(
      value.outputs?.audio,
      storyRoot,
      episodeDirectory ? `${episodeDirectory}/outputs/audio/` : "",
    ),
  }
  const requestedStatus = boundedText(value.status, 30, "")
  const status = SEGMENT_STATUSES.has(requestedStatus)
    ? requestedStatus
    : outputs.video.status === "ready" || outputs.keyframe.status === "ready"
      ? "ready"
      : "planned"
  return {
    id,
    number,
    title: boundedText(value.title, 200, `片段 ${String(number).padStart(2, "0")}`),
    summary: boundedText(value.summary ?? value.description, 2_000),
    sceneSetting: boundedText(value.sceneSetting ?? value.setting, 3_000),
    locationAssetId: cleanId(value.locationAssetId ?? value.locationId, ""),
    shotIds,
    assetRefs: stringList(value.assetRefs, 100),
    durationSeconds: boundedNumber(
      value.durationSeconds ?? value.duration,
      segmentShots.reduce((sum, shot) => sum + shot.durationSeconds, 0),
      0,
      43_200,
    ),
    status,
    outputs,
  }
}

export function segmentsForEpisode(episode) {
  if (!episode) return []
  if (Array.isArray(episode.segments) && episode.segments.length > 0) return episode.segments
  const shots = Array.isArray(episode.shots) ? episode.shots : []
  if (shots.length === 0) return []
  return [{
    id: "segment-001",
    number: 1,
    title: episode.title || "完整片段",
    summary: episode.logline || "",
    sceneSetting: "",
    locationAssetId: shots.find((shot) => shot.locationId)?.locationId || "",
    shotIds: shots.map((shot) => shot.id),
    assetRefs: [...new Set(shots.flatMap((shot) => [
      ...shot.characterIds,
      ...shot.assetRefs,
      shot.locationId,
    ].filter(Boolean)))],
    durationSeconds: shots.reduce((sum, shot) => sum + shot.durationSeconds, 0),
    status: episode.status === "ready" ? "ready" : "planned",
    outputs: {
      keyframe: { status: "planned", path: "", mimeType: "", durationSeconds: 0 },
      video: { status: "planned", path: "", mimeType: "", durationSeconds: 0 },
      audio: { status: "planned", path: "", mimeType: "", durationSeconds: 0 },
    },
  }]
}

export function shotsForSegment(episode, segment) {
  if (!episode || !segment) return []
  const ids = new Set(segment.shotIds)
  return episode.shots.filter((shot) => ids.has(shot.id))
}

export function collectEpisodeAssetIds(episode) {
  const ids = new Set()
  for (const shot of episode?.shots ?? []) {
    if (shot.locationId) ids.add(shot.locationId)
    shot.characterIds.forEach((id) => ids.add(id))
    shot.assetRefs.forEach((id) => ids.add(id))
  }
  for (const segment of segmentsForEpisode(episode)) {
    if (segment.locationAssetId) ids.add(segment.locationAssetId)
    segment.assetRefs.forEach((id) => ids.add(id))
  }
  return ids
}

export function assetsForScope(story, episode, scope, kind) {
  if (!story) return []
  if (kind === "materials") {
    const episodes = scope === "story" ? story.episodes : episode ? [episode] : []
    return episodes.flatMap((candidate) => segmentsForEpisode(candidate).map((segment) => ({
      id: `${candidate.id}-${segment.id}-material`,
      kind: "material",
      name: segment.title,
      role: `片段 ${String(segment.number).padStart(2, "0")} · ${segment.durationSeconds}s`,
      summary: segment.summary,
      tags: [segment.status],
      segmentId: segment.id,
      episodeId: candidate.id,
      output: segment.outputs.video.status === "ready" ? segment.outputs.video : segment.outputs.keyframe,
    })))
  }
  const assets = story.assets?.[kind] ?? []
  if (scope === "story" || !episode) return assets
  const usedIds = collectEpisodeAssetIds(episode)
  return assets.filter((asset) => usedIds.has(asset.id))
}

function normalizeBeat(value, index) {
  if (!isRecord(value)) return null
  return {
    id: cleanId(value.id, `beat-${index + 1}`),
    label: boundedText(value.label ?? value.title, 100, `节拍 ${index + 1}`),
    summary: boundedText(value.summary ?? value.description, 600),
  }
}

export function normalizeEpisode(value, fallback = {}) {
  if (!isRecord(value)) return null
  if (value.schema !== undefined && value.schema !== EPISODE_SCHEMA) return null
  const number = Math.trunc(
    boundedNumber(value.number ?? value.order, fallback.number ?? 1, 1, 9_999),
  )
  const id = cleanId(
    value.id ?? value.episodeId ?? fallback.id,
    `ep-${String(number).padStart(3, "0")}`,
  )
  const episodePath = portableProjectPath(value.path ?? fallback.path)
  const storyRoot = storyboardRootPath(episodePath)
  const episodeDirectory = episodePath.includes("/")
    ? episodePath.slice(0, episodePath.lastIndexOf("/"))
    : ""
  const shots = cleanArray(
    value.shots,
    (shot, index) => normalizeShot(shot, index, storyRoot, episodeDirectory),
  )
    .sort((a, b) => a.number - b.number)
  const declaredSegments = cleanArray(
    value.segments,
    (segment, index) => normalizeSegment(segment, index, shots, storyRoot, episodeDirectory),
  ).sort((a, b) => a.number - b.number)
  const episode = {
    schema: EPISODE_SCHEMA,
    id,
    storyId: cleanId(value.storyId ?? fallback.storyId, ""),
    number,
    title: boundedText(value.title ?? fallback.title, 240, `第 ${number} 集`),
    logline: boundedText(value.logline ?? value.summary ?? fallback.logline, 2_000),
    durationSeconds: boundedNumber(
      value.durationSeconds ?? value.runtimeSeconds,
      fallback.durationSeconds ?? 90,
      1,
      43_200,
    ),
    aspectRatio: boundedText(value.aspectRatio ?? fallback.aspectRatio, 20, "9:16"),
    status: boundedText(value.status ?? fallback.status, 40, "draft"),
    path: episodePath,
    groupId: cleanId(value.groupId ?? fallback.groupId, ""),
    groupLabel: boundedText(value.groupLabel ?? fallback.groupLabel, 240),
    beats: cleanArray(value.beats, normalizeBeat),
    shotCount: Math.trunc(
      boundedNumber(value.shotCount, shots.length, shots.length, 9_999),
    ),
    shots,
    segments: declaredSegments,
  }
  if (episode.segments.length === 0) episode.segments = segmentsForEpisode(episode)
  return episode
}

function normalizeEpisodeReference(value, index, storyId, aspectRatio, durationSeconds) {
  if (typeof value === "string") {
    const path = portableProjectPath(value)
    if (!path) return null
    const number = index + 1
    return normalizeEpisode({
      id: `ep-${String(number).padStart(3, "0")}`,
      number,
      path,
      storyId,
      aspectRatio,
      durationSeconds,
    })
  }
  if (!isRecord(value)) return null
  return normalizeEpisode(value, {
    aspectRatio,
    durationSeconds,
    id: cleanId(value.id ?? value.episodeId, `ep-${String(index + 1).padStart(3, "0")}`),
    number: index + 1,
    storyId,
  })
}

export function normalizeStory(value, sourcePath = "") {
  if (!isRecord(value) || value.schema !== STORY_SCHEMA) return null
  const id = cleanId(value.id ?? value.storyId, "untitled-story")
  const format = isRecord(value.format) ? value.format : {}
  const aspectRatio = boundedText(value.aspectRatio ?? format.aspectRatio, 20, "9:16")
  const targetEpisodeSeconds = boundedNumber(format.targetEpisodeSeconds, 90, 1, 43_200)
  const normalizedSourcePath = portableProjectPath(sourcePath || value.path)
  const storyRoot = storyboardRootPath(normalizedSourcePath)
  const rawAssets = isRecord(value.assets) ? value.assets : {}
  const episodes = cleanArray(value.episodes, (item, index) =>
    normalizeEpisodeReference(item, index, id, aspectRatio, targetEpisodeSeconds),
  )
    .map((episode) => ({ ...episode, path: confinedPath(episode.path, storyRoot) }))
    .sort((a, b) => a.number - b.number)
  const normalizeAsset = (item, kind) => {
    const asset = normalizeReference(item, kind)
    return asset ? { ...asset, path: confinedPath(asset.path, storyRoot) } : null
  }
  return {
    schema: STORY_SCHEMA,
    id,
    title: boundedText(value.title, 240, "未命名故事"),
    logline: boundedText(value.logline ?? value.summary, 2_000),
    genre: boundedText(value.genre ?? format.genre, 100),
    aspectRatio,
    status: boundedText(value.status, 40, "draft"),
    revision: boundedNumber(value.revision, 1, 1, Number.MAX_SAFE_INTEGER),
    sourcePath: normalizedSourcePath,
    episodes,
    assets: {
      characters: cleanArray(rawAssets.characters ?? value.characters, (item) =>
        normalizeAsset(item, "character"),
      ),
      locations: cleanArray(rawAssets.locations ?? value.locations ?? value.scenes, (item) =>
        normalizeAsset(item, "location"),
      ),
      props: cleanArray(rawAssets.props ?? value.props, (item) => normalizeAsset(item, "prop")),
    },
  }
}

function normalizePersonality(value) {
  const source = isRecord(value) ? value : {}
  return {
    archetype: boundedText(source.archetype, 200),
    traits: stringList(source.traits, 30),
    contradiction: boundedText(source.contradiction ?? source.flaw, 1_000),
    desire: boundedText(source.desire ?? source.motivation, 1_000),
    fear: boundedText(source.fear, 1_000),
    secret: boundedText(source.secret, 1_000),
    moralLine: boundedText(source.moralLine, 1_000),
    speechPattern: boundedText(source.speechPattern ?? source.speakingStyle, 1_000),
    gestures: stringList(source.gestures, 20),
  }
}

function normalizeVoice(value, audioRoot = "") {
  const source = isRecord(value) ? value : {}
  const references = mediaReferences(source.referenceAudio, 20, audioRoot)
  const sampleAudio = audioRoot
    ? confinedPath(source.sampleAudio ?? source.audioPath, audioRoot)
    : ""
  return {
    description: boundedText(source.description, 2_000),
    language: boundedText(source.language, 100),
    timbre: boundedText(source.timbre, 200),
    pace: boundedText(source.pace, 100),
    pitch: boundedText(source.pitch, 100),
    energy: boundedText(source.energy, 100),
    accent: boundedText(source.accent, 100),
    sampleText: boundedText(source.sampleText, 1_000),
    references,
    sampleAudio:
      sampleAudio ||
      references.find((reference) => reference.status === "ready")?.path ||
      "",
  }
}

function normalizeVisual(value, imageRoot = "") {
  const source = isRecord(value) ? value : {}
  const references = mediaReferences(source.referenceImages, 30, imageRoot)
  return {
    appearance: boundedText(source.appearance ?? source.description, 2_000),
    agePresentation: boundedText(source.agePresentation, 200),
    silhouette: boundedText(source.silhouette, 1_000),
    face: boundedText(source.face, 1_000),
    hair: boundedText(source.hair, 1_000),
    wardrobe: Array.isArray(source.wardrobe)
      ? stringList(source.wardrobe, 30).join(" · ")
      : boundedText(source.wardrobe, 2_000),
    palette: stringList(source.palette, 12),
    imagePrompt: boundedText(source.imagePrompt ?? source.prompt, 8_000),
    negativePrompt: boundedText(source.negativePrompt, 3_000),
    primaryImage: imageRoot
      ? confinedPath(source.primaryImage ?? source.primaryImagePath, imageRoot)
      : "",
    mediaReferences: references,
    references: [
      ...stringList(source.references, 30)
        .map((reference) => imageRoot ? confinedPath(reference, imageRoot) : "")
        .filter(Boolean),
      ...references.filter((reference) => reference.status === "ready").map((reference) => reference.path),
    ],
  }
}

export function normalizeCharacter(value, sourcePath = "") {
  if (!isRecord(value) || value.schema !== CHARACTER_SCHEMA) return null
  const id = cleanId(value.id ?? value.characterId, "unknown-character")
  const normalizedSourcePath = portableProjectPath(sourcePath || value.path)
  const expectedSuffix = `/assets/characters/${id}/${id}.character.card.json`
  const characterRoot = storyboardRootPath(normalizedSourcePath) &&
    normalizedSourcePath.endsWith(expectedSuffix)
    ? normalizedSourcePath.slice(0, -`/${id}.character.card.json`.length)
    : ""
  const continuitySource = isRecord(value.continuity) ? value.continuity : {}
  const performanceSource = isRecord(value.performance) ? value.performance : {}
  return {
    schema: CHARACTER_SCHEMA,
    id,
    storyId: cleanId(value.storyId, ""),
    name: boundedText(value.name, 200, "未命名人物"),
    aliases: stringList(value.aliases, 20),
    role: boundedText(value.role ?? value.roleType, 200, "角色"),
    summary: boundedText(value.summary ?? value.biography, 3_000),
    tags: stringList(value.tags, 30),
    episodeIds: stringList(value.episodeIds, 200),
    personality: normalizePersonality(value.personality),
    voice: normalizeVoice(value.voice, characterRoot ? `${characterRoot}/audio` : ""),
    visual: normalizeVisual(value.visual, characterRoot ? `${characterRoot}/images` : ""),
    performance: {
      baseline: boundedText(performanceSource.baseline, 1_000),
      underPressure: boundedText(performanceSource.underPressure, 1_000),
      emotionalRange: boundedText(performanceSource.emotionalRange, 1_000),
      videoNotes: boundedText(performanceSource.videoNotes, 2_000),
    },
    continuity: {
      locks: stringList(continuitySource.locks ?? value.continuityLocks, 50),
      allowedVariations: stringList(continuitySource.allowedVariations, 30),
      forbiddenChanges: stringList(continuitySource.forbiddenChanges, 50),
      performanceNotes: boundedText(
        continuitySource.performanceNotes ?? value.performanceNotes ?? performanceSource.videoNotes,
        3_000,
      ),
      negativePrompt: boundedText(continuitySource.negativePrompt ?? value.visual?.negativePrompt, 3_000),
    },
    relationships: cleanArray(value.relationships, (item) => {
      if (!isRecord(item)) return null
      const characterId = cleanId(item.characterId ?? item.id, "")
      const description = [
        boundedText(item.description ?? item.relation ?? item.dynamic, 1_000),
        boundedText(item.publicState, 500),
        boundedText(item.privateState, 500),
      ].filter(Boolean).join(" · ")
      return characterId || description ? { characterId, description } : null
    }),
    sourcePath: normalizedSourcePath,
  }
}

export function projectResourcePath(node) {
  if (!isRecord(node) || !isRecord(node.data) || !isRecord(node.data.metadata)) return ""
  const resource = node.data.metadata.convaxProjectResource
  return isRecord(resource) && resource.kind === "project-file"
    ? portableProjectPath(resource.path)
    : ""
}

export function connectedStorySources(document, owningNodeId) {
  if (!isRecord(document) || !Array.isArray(document.nodes) || !Array.isArray(document.edges)) return []
  const incomingIds = []
  const seen = new Set()
  for (const edge of document.edges) {
    if (
      isRecord(edge) &&
      edge.target === owningNodeId &&
      typeof edge.source === "string" &&
      !seen.has(edge.source)
    ) {
      seen.add(edge.source)
      incomingIds.push(edge.source)
    }
  }
  if (incomingIds.length > 200) return []
  const nodesById = new Map(
    document.nodes
      .filter((node) => isRecord(node) && typeof node.id === "string")
      .map((node) => [node.id, node]),
  )
  return incomingIds
    .map((id) => nodesById.get(id))
    .filter(Boolean)
    .map((node) => ({
      id: cleanId(node.id, ""),
      label: boundedText(node.label ?? node.name, 240, "已连接节点"),
      kind: boundedText(node.kind ?? node.type, 80, "text"),
      text: boundedText(node.text, 120_000),
      path: isRecord(node.resource) ? portableProjectPath(node.resource.path) : "",
      mimeType: boundedText(node.mimeType, 200),
      status: boundedText(node.status, 80),
    }))
    .filter((source) => source.id)
}

export function mergeEpisode(story, episode) {
  if (!story || !episode) return story
  const episodes = story.episodes.map((candidate) =>
    candidate.id === episode.id || (candidate.path && candidate.path === episode.path)
      ? { ...candidate, ...episode, path: episode.path || candidate.path }
      : candidate,
  )
  return { ...story, episodes }
}

export function parseStoryboardDocument(text, sourcePath = "") {
  if (typeof text !== "string" || text.length > 2 * 1024 * 1024) {
    throw new Error("故事板文件不是可接受的文本")
  }
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error("故事板文件不是有效 JSON")
  }
  if (!isRecord(value) || typeof value.schema !== "string") {
    throw new Error("故事板文件缺少 schema")
  }
  if (value.schema === STORY_SCHEMA) {
    const story = normalizeStory(value, sourcePath)
    if (!story) throw new Error("故事索引不符合 convax.storyboard/1")
    return { kind: "story", value: story }
  }
  if (value.schema === EPISODE_SCHEMA) {
    const episode = normalizeEpisode({ ...value, path: sourcePath || value.path })
    if (!episode) throw new Error("分集文件不符合 convax.storyboard-episode/1")
    return { kind: "episode", value: episode }
  }
  if (value.schema === CHARACTER_SCHEMA) {
    const character = normalizeCharacter(value, sourcePath)
    if (!character) throw new Error("人物卡不符合 convax.character-card/1")
    return { kind: "character", value: character }
  }
  throw new Error(`暂不支持故事板 schema：${value.schema}`)
}

const DEMO_STORY_ID = "story-old-classroom-tape"
const DEMO_ROOT = "Storyboards/old-classroom-tape"

export const DEMO_CHARACTER = normalizeCharacter({
  schema: CHARACTER_SCHEMA,
  id: "char-001",
  storyId: DEMO_STORY_ID,
  name: "林微",
  aliases: ["微姐", "林记者"],
  role: "主角 · 调查记者",
  summary: "离开县城十七年后，她为拆迁报道回到母校。外表冷静、习惯掌控采访节奏，却始终不敢听完学生时代留下的最后一盘录音。",
  tags: ["克制", "旧校舍", "磁带记忆", "返乡者"],
  episodeIds: ["ep-001", "ep-002", "ep-003", "ep-004"],
  personality: {
    archetype: "回到创伤现场的调查者",
    traits: ["理性", "敏锐", "边界感强", "有隐秘愧疚"],
    contradiction: "擅长替别人追问真相，却不断回避属于自己的证词。",
    desire: "查明旧教室封闭前发生的最后一件事。",
    fear: "录音会证明当年是她的沉默伤害了朋友。",
    secret: "她保存着录音的 B 面，却对所有人声称磁带已经丢失。",
    moralLine: "不把未获同意的私人录音用于新闻。",
    speechPattern: "句子简短，追问时语速稳定；情绪失控前会先沉默。",
    gestures: ["紧张时反复按录音机停止键", "思考时看向窗外而非对方"],
  },
  voice: {
    description: "中低女声，清晰、克制、近讲；采访状态冷静，提到旧校舍时尾音明显变轻。",
    language: "普通话",
    timbre: "温冷交界、轻微沙感",
    pace: "0.94×",
    pitch: "中低",
    energy: "克制",
    accent: "轻微江淮口音",
    sampleText: "我不是来替谁翻案的，我只想让那天发生过的事有一个完整句号。",
    sampleAudio: `${DEMO_ROOT}/assets/characters/char-001/audio/voice-reference.wav`,
  },
  visual: {
    appearance: "38 岁，齐肩黑发，神情沉静，眼下有长期失眠留下的浅阴影。",
    agePresentation: "35—40 岁",
    silhouette: "利落直线轮廓，肩背始终挺直",
    face: "窄长脸、清晰眉骨、淡妆",
    hair: "深黑齐肩发，工作时别到耳后",
    wardrobe: ["象牙白衬衫", "深灰高腰长裤", "黑色细肩采访包"],
    palette: ["#E9E1D2", "#2F3338", "#6D716E", "#8A6548"],
    imagePrompt: "cinematic Chinese investigative reporter, late thirties, ivory blouse, restrained expression, abandoned 1990s classroom",
    primaryImage: `${DEMO_ROOT}/assets/characters/char-001/images/primary.webp`,
    references: [
      `${DEMO_ROOT}/assets/characters/char-001/images/front.webp`,
      `${DEMO_ROOT}/assets/characters/char-001/images/profile.webp`,
    ],
  },
  performance: {
    baseline: "肩背挺直，动作克制，先观察再发问。",
    underPressure: "呼吸变浅，右手拇指不断摩挲录音机边缘。",
    emotionalRange: "冷静调查到无法回避的愧疚崩口。",
    videoNotes: "情绪主要依靠眼神停顿和手部细节表达，避免夸张哭戏。",
  },
  continuity: {
    locks: [
      "象牙白衬衫袖口始终挽到前臂",
      "采访包斜挎方向固定为右肩到左胯",
      "录音机由右手持握",
      "常态表情克制，避免商业微笑",
    ],
    allowedVariations: ["进入尘土环境后衬衫可出现轻微灰痕"],
    forbiddenChanges: ["不可突然改变发长", "不可替换采访包"],
    performanceNotes: "听到录音中的学生声音时先停住动作，再缓慢转头。",
    negativePrompt: "no glamorous styling, no bright fashion, no exaggerated expression",
  },
}, `${DEMO_ROOT}/assets/characters/char-001/char-001.character.card.json`)

const episodeOneShots = [
  ["空教室", "远景", "平视", "固定机位", "空无一人的旧教室被斜射阳光切成明暗两半，灰尘在光柱中漂浮。", "", "风穿过破窗，远处操场广播底噪", "loc-001", []],
  ["整理遗物", "中景", "俯视", "缓慢下移", "林微跪在一堆旧物前，把散乱磁带按年份排开。", "", "纸盒摩擦声", "loc-001", ["char-001"]],
  ["拒绝来电", "近景", "平视", "极慢推近", "手机亮起“王老师”，她看了三秒后按下挂断。", "我习惯一个人了，不麻烦别人。", "短促震动后归于安静", "loc-001", ["char-001"]],
  ["学生影像", "中近景", "平视", "跳切", "旧电视雪花中闪过十七岁的林微，她穿蓝白校服看向镜头外。", "", "磁带齿轮开始转动", "loc-001", ["char-002"]],
  ["王老师到场", "双人中景", "侧逆光", "手持轻晃", "王老师站在门口，不肯跨过教室门槛。", "有些东西，拆掉比留下容易。", "走廊脚步回声", "loc-002", ["char-001", "char-003"]],
  ["缺失的七秒", "物件特写", "俯拍", "固定机位", "计数器从 02:14 跳到 02:21，磁带中间被人为剪去七秒。", "", "剪辑点爆音", "loc-001", ["char-001"]],
  ["旧值日表", "近景", "斜俯", "横移", "泛黄值日表上，林微和陈屹的名字被红笔圈在同一天。", "", "铅笔划过纸面", "loc-001", ["char-001"]],
  ["走廊追问", "双人近景", "侧拍", "跟拍", "林微追上王老师，第一次直问当年的封校原因。", "那天最后离开教室的人，到底是谁？", "雨声由远及近", "loc-002", ["char-001", "char-003"]],
  ["维修工证词", "中景", "低机位", "缓推", "陈屹放下卷尺，承认自己曾在墙里封过一只铁盒。", "我只负责砌墙，不负责忘记。", "卷尺回弹", "loc-003", ["char-001", "char-004"]],
  ["拆字墙", "大全景", "平视", "固定机位", "红色“拆”字在暮色中覆盖整面旧墙，三个人站成彼此疏离的三角。", "", "远处施工机械启动", "loc-003", ["char-001", "char-003", "char-004"]],
  ["铁盒", "手部特写", "俯拍", "轻微环绕", "墙灰落下，锈蚀铁盒里只有半张合照和一盘 B 面录音。", "", "金属盒盖摩擦", "loc-003", ["char-001"]],
  ["门口回望", "面部特写", "正面", "极慢推近", "林微站在黑暗门框里，终于按下播放键。", "如果你听到这里，说明我没有等到你回来。", "学生女声从录音机传出", "loc-001", ["char-001", "char-002"]],
].map(([title, shotSize, angle, cameraMove, description, dialogue, sound, locationId, characterIds], index) => ({
  id: `ep-001-shot-${String(index + 1).padStart(3, "0")}`,
  number: index + 1,
  title,
  shotSize,
  angle,
  cameraMove,
  description,
  dialogue,
  sound,
  durationSeconds: [4, 5, 6, 11, 9, 9, 12, 10, 10, 10, 8, 10][index],
  locationId,
  characterIds,
  assetRefs: index >= 5 ? ["prop-001"] : [],
  continuityLocks: ["人物形象与旧教室光向保持连续"],
  imagePrompt: `${title}，90 年代县城旧中学，写实电影质感`,
  videoPrompt: `${cameraMove}，${shotSize}，保持人物身份与服装连续`,
  status: index < 10 ? "ready" : "planned",
}))

const episodeOneSegments = [
  { title: "阳光里的旧教室", shotIds: [1, 2, 3], assetRefs: ["char-001", "loc-001"], sceneSetting: "十七年前的教室 · 废弃全景 · 白天" },
  { title: "电视里的学生", shotIds: [4], assetRefs: ["char-002", "loc-001"], sceneSetting: "旧电视雪花中的学生时代影像" },
  { title: "门槛之外", shotIds: [5], assetRefs: ["char-001", "char-003", "loc-001"], sceneSetting: "旧教室门口 · 午后逆光" },
  { title: "缺失的七秒", shotIds: [6], assetRefs: ["char-001", "prop-001"], sceneSetting: "课桌上的录音机与磁带" },
  { title: "被圈住的名字", shotIds: [7], assetRefs: ["char-001", "prop-002"], sceneSetting: "旧教室讲台 · 值日表" },
  { title: "走廊追问", shotIds: [8], assetRefs: ["char-001", "char-003", "loc-002"], sceneSetting: "县城老中学长走廊 · 暴雨将至" },
  { title: "砌墙的人", shotIds: [9], assetRefs: ["char-001", "char-004", "loc-003"], sceneSetting: "旧校舍维修间 · 冷色顶光" },
  { title: "拆字墙", shotIds: [10], assetRefs: ["char-001", "char-003", "char-004", "loc-003"], sceneSetting: "待拆教学楼外墙 · 暮色" },
  { title: "墙里的铁盒", shotIds: [11], assetRefs: ["char-001", "prop-001", "loc-003"], sceneSetting: "拆开的夹墙 · 灰尘与锈铁盒", status: "generating" },
  { title: "终于播放", shotIds: [12], assetRefs: ["char-001", "char-002", "prop-001", "loc-001"], sceneSetting: "旧教室门口 · 夜", status: "planned" },
].map((segment, index) => {
  const number = index + 1
  const shotIds = segment.shotIds.map((shotNumber) => `ep-001-shot-${String(shotNumber).padStart(3, "0")}`)
  const durationSeconds = episodeOneShots
    .filter((shot) => shotIds.includes(shot.id))
    .reduce((sum, shot) => sum + shot.durationSeconds, 0)
  const status = segment.status ?? "ready"
  return {
    id: `segment-${String(number).padStart(3, "0")}`,
    number,
    title: segment.title,
    summary: episodeOneShots.find((shot) => shotIds.includes(shot.id))?.description ?? "",
    sceneSetting: segment.sceneSetting,
    locationAssetId: segment.assetRefs.find((id) => id.startsWith("loc-")) ?? "",
    shotIds,
    assetRefs: segment.assetRefs,
    durationSeconds,
    status,
    outputs: {
      keyframe: status === "ready"
        ? { status: "ready", path: `${DEMO_ROOT}/episodes/ep-001-old-classroom/outputs/images/segment-${String(number).padStart(3, "0")}.jpg`, mimeType: "image/jpeg" }
        : { status: status === "generating" ? "running" : "planned" },
      video: status === "ready"
        ? { status: "ready", path: `${DEMO_ROOT}/episodes/ep-001-old-classroom/outputs/video/segment-${String(number).padStart(3, "0")}.mp4`, mimeType: "video/mp4", durationSeconds }
        : { status: status === "generating" ? "running" : "planned" },
      audio: { status: "planned" },
    },
  }
})

const demoEpisodes = [
  {
    schema: EPISODE_SCHEMA,
    id: "ep-001",
    storyId: DEMO_STORY_ID,
    number: 1,
    title: "旧教室重逢揭尘封往事",
    logline: "返乡记者林微在待拆母校发现一盘被剪去七秒的录音，旧日师生被迫重新面对同一段沉默。",
    durationSeconds: 104,
    status: "ready",
    path: `${DEMO_ROOT}/episodes/ep-001-old-classroom/episode.storyboard.json`,
    groupId: `${DEMO_STORY_ID}-ep-001`,
    groupLabel: "EP001 · 旧教室重逢揭尘封往事",
    beats: [
      { label: "回到现场", summary: "林微独自进入待拆旧教室。" },
      { label: "证据出现", summary: "录音带中缺失关键七秒。" },
      { label: "关系冲突", summary: "王老师和维修工给出矛盾证词。" },
      { label: "尾钩", summary: "墙中铁盒保存着录音 B 面。" },
    ],
    shots: episodeOneShots,
    segments: episodeOneSegments,
  },
  {
    schema: EPISODE_SCHEMA,
    id: "ep-002",
    storyId: DEMO_STORY_ID,
    number: 2,
    title: "值日表上的第五个人",
    logline: "被抹去的值日生姓名指向一位从校史中消失的女生。",
    durationSeconds: 92,
    status: "draft",
    path: `${DEMO_ROOT}/episodes/ep-002-fifth-name/episode.storyboard.json`,
    groupId: `${DEMO_STORY_ID}-ep-002`,
    groupLabel: "EP002 · 值日表上的第五个人",
    shots: [
      { id: "ep-002-shot-001", number: 1, title: "第五个名字", description: "显影药水让被刮掉的名字重新浮现。", durationSeconds: 8, shotSize: "物件特写", angle: "俯拍", cameraMove: "固定", locationId: "loc-001", characterIds: ["char-001"], assetRefs: ["prop-002"] },
      { id: "ep-002-shot-002", number: 2, title: "没有毕业照", description: "毕业照最右侧被整齐剪去一个人。", durationSeconds: 9, shotSize: "近景", angle: "平视", cameraMove: "缓推", locationId: "loc-001", characterIds: ["char-001", "char-003"], assetRefs: ["prop-002"] },
    ],
    segments: [
      { id: "segment-001", number: 1, title: "消失的名字", shotIds: ["ep-002-shot-001"], assetRefs: ["char-001", "loc-001", "prop-002"], status: "planned" },
      { id: "segment-002", number: 2, title: "被剪掉的人", shotIds: ["ep-002-shot-002"], assetRefs: ["char-001", "char-003", "loc-001", "prop-002"], status: "planned" },
    ],
  },
  {
    schema: EPISODE_SCHEMA,
    id: "ep-003",
    storyId: DEMO_STORY_ID,
    number: 3,
    title: "广播站最后一次点名",
    logline: "封存的校园广播带在午夜自动播放，点名顺序暗藏当年的逃生路线。",
    durationSeconds: 96,
    status: "queued",
    path: `${DEMO_ROOT}/episodes/ep-003-last-roll-call/episode.storyboard.json`,
    groupId: `${DEMO_STORY_ID}-ep-003`,
    groupLabel: "EP003 · 广播站最后一次点名",
    shots: [],
    segments: [],
  },
  {
    schema: EPISODE_SCHEMA,
    id: "ep-004",
    storyId: DEMO_STORY_ID,
    number: 4,
    title: "拆除前的证词",
    logline: "推土机启动前，林微必须决定公开录音，还是守住故人最后的请求。",
    durationSeconds: 100,
    status: "planned",
    path: `${DEMO_ROOT}/episodes/ep-004-testimony/episode.storyboard.json`,
    groupId: `${DEMO_STORY_ID}-ep-004`,
    groupLabel: "EP004 · 拆除前的证词",
    shots: [],
    segments: [],
  },
]

export const DEMO_STORY = normalizeStory({
  schema: STORY_SCHEMA,
  id: DEMO_STORY_ID,
  title: "第七码带",
  logline: "返乡记者在待拆母校发现一盘被剪去七秒的录音，迫使旧日师生重新面对一场被集体沉默掩埋的事故。",
  genre: "现实悬疑 · 旧城往事",
  aspectRatio: "16:9",
  status: "storyboard",
  revision: 4,
  episodes: demoEpisodes,
  assets: {
    characters: [
      { id: "char-001", name: "林微", role: "基础形象 · 调查记者", summary: DEMO_CHARACTER.summary, path: `${DEMO_ROOT}/assets/characters/char-001/char-001.character.card.json`, tags: ["本集", "主角"] },
      { id: "char-002", name: "林微", role: "学生时期 · 17 岁", summary: "录音中的林微，尚未学会用冷静隐藏恐惧。", tags: ["回忆", "校服"] },
      { id: "char-003", name: "王老师", role: "班主任 · 知情者", summary: "坚持旧事已经结束，却始终不敢踏进教室。", tags: ["知情者", "隐瞒"] },
      { id: "char-004", name: "陈屹", role: "维修工 · 关键证人", summary: "当年负责封墙的年轻工人，如今回来执行拆除。", tags: ["证人", "铁盒"] },
    ],
    locations: [
      { id: "loc-001", name: "旧教室_废弃全景_白天", role: "本集主场景", summary: "斜射阳光、灰尘光柱、杂乱旧桌椅和褪色黑板。", tags: ["已引用", "日景"] },
      { id: "loc-002", name: "县城老中学长走廊", role: "追问场景", summary: "长窗、剥落绿墙裙和强烈纵深。", tags: ["暴雨前", "回声"] },
      { id: "loc-003", name: "拆字墙与维修间", role: "证据场景", summary: "红色拆字覆盖旧墙，夹层内藏有锈蚀铁盒。", tags: ["暮色", "施工"] },
    ],
    props: [
      { id: "prop-001", name: "第七码带", role: "核心道具", summary: "B 面被剪去七秒，保存着事故现场的最后声音。", tags: ["录音", "证据"] },
      { id: "prop-002", name: "旧值日表", role: "人物线索", summary: "被刮掉的第五个名字在特殊角度下仍可辨认。", tags: ["纸张", "校史"] },
    ],
  },
}, `${DEMO_ROOT}/story.storyboard.json`)
