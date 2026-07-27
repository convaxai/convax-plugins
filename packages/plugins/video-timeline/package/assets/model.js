export const STATE_SCHEMA = "convax.video-timeline"
export const STATE_VERSION = 1
export const MAX_STATE_BYTES = 240 * 1024

const forbiddenStateKeys = new Set([
  "bytes",
  "dataUrl",
  "mediaSession",
  "path",
  "previewUrl",
  "thumbnail",
  "token",
  "undo",
  "url",
  "waveform",
])

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function gcd(left, right) {
  let a = left < 0n ? -left : left
  let b = right < 0n ? -right : right
  while (b !== 0n) [a, b] = [b, a % b]
  return a || 1n
}

function normalizedBigTime(value, scale) {
  if (scale <= 0n) throw new Error("Time scale must be positive")
  const divisor = gcd(value, scale)
  const normalizedScale = scale / divisor
  if (normalizedScale > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Time scale exceeds the persistent exact-rational limit")
  }
  return { value: (value / divisor).toString(), scale: Number(normalizedScale) }
}

export function normalizeTime(input) {
  if (!record(input) || !/^-?(?:0|[1-9]\d*)$/.test(input.value)) throw new Error("Time value must be a canonical integer string")
  if (!Number.isSafeInteger(input.scale) || input.scale <= 0) throw new Error("Time scale must be a positive safe integer")
  const value = BigInt(input.value)
  return normalizedBigTime(value, BigInt(input.scale))
}

export function time(value = 0n, scale = 1) {
  return normalizeTime({ value: BigInt(value).toString(), scale })
}

export function compareTime(left, right) {
  const a = normalizeTime(left)
  const b = normalizeTime(right)
  const difference = BigInt(a.value) * BigInt(b.scale) - BigInt(b.value) * BigInt(a.scale)
  return difference < 0n ? -1 : difference > 0n ? 1 : 0
}

export function addTime(left, right) {
  const a = normalizeTime(left)
  const b = normalizeTime(right)
  const aScale = BigInt(a.scale)
  const bScale = BigInt(b.scale)
  const commonDivisor = gcd(aScale, bScale)
  const aMultiplier = bScale / commonDivisor
  const bMultiplier = aScale / commonDivisor
  return normalizedBigTime(
    BigInt(a.value) * aMultiplier + BigInt(b.value) * bMultiplier,
    aScale * aMultiplier,
  )
}

export function subtractTime(left, right) {
  const b = normalizeTime(right)
  return addTime(left, { value: (-BigInt(b.value)).toString(), scale: b.scale })
}

export function multiplyTime(value, ratio) {
  const source = normalizeTime(value)
  if (!record(ratio) || !Number.isSafeInteger(ratio.numerator) || !Number.isSafeInteger(ratio.denominator) || ratio.denominator <= 0) {
    throw new Error("Playback rate must be a finite rational")
  }
  return normalizedBigTime(
    BigInt(source.value) * BigInt(ratio.numerator),
    BigInt(source.scale) * BigInt(ratio.denominator),
  )
}

export function timeEnd(range) {
  return addTime(range.start, range.duration)
}

export function seconds(value) {
  const normalized = normalizeTime(value)
  return Number(BigInt(normalized.value)) / normalized.scale
}

export function timeFromSeconds(value, editRate) {
  if (!Number.isFinite(value)) throw new Error("Time must be finite")
  const rate = parseEditRate(editRate)
  const frames = Math.round((value * rate.numerator) / rate.denominator)
  return normalizedBigTime(BigInt(frames) * BigInt(rate.denominator), BigInt(rate.numerator))
}

export function timeFromMilliseconds(value, editRate) {
  return timeFromSeconds(Math.max(0, Number(value) || 0) / 1000, editRate)
}

export function snapTime(value, editRate) {
  return timeFromSeconds(seconds(value), editRate)
}

export function createId(prefix = "id") {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${uuid}`
}

export function createEmptyState(options = {}) {
  return {
    schema: STATE_SCHEMA,
    schemaVersion: STATE_VERSION,
    composition: {
      id: options.compositionId ?? createId("composition"),
      name: options.name ?? "Untitled Timeline",
      settings: {
        width: 1920,
        height: 1080,
        editRate: { numerator: 30, denominator: 1 },
        sampleRate: 48000,
        channelLayout: "stereo",
        background: "#090b10",
        ...(options.settings ?? {}),
      },
      trackOrder: [],
      tracksById: {},
      itemsById: {},
    },
    sourceBindingsByNodeId: {},
  }
}

function parseEditRate(value) {
  if (
    !record(value) ||
    !Number.isSafeInteger(value.numerator) ||
    value.numerator <= 0 ||
    !Number.isSafeInteger(value.denominator) ||
    value.denominator <= 0
  ) {
    throw new Error("Composition edit rate is invalid")
  }
  return { numerator: value.numerator, denominator: value.denominator }
}

function requireString(value, label, maximum = 2048) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} is invalid`)
  }
  return value
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} is invalid`)
  return value
}

function requireRange(value, label, positive = true) {
  if (!record(value)) throw new Error(`${label} is invalid`)
  const start = normalizeTime(value.start)
  const duration = normalizeTime(value.duration)
  if (compareTime(start, time()) < 0 || compareTime(duration, time()) < (positive ? 1 : 0)) throw new Error(`${label} is invalid`)
  return { start, duration }
}

function rejectForbiddenState(value, seen = new Set()) {
  if (!record(value) && !Array.isArray(value)) return
  if (seen.has(value)) throw new Error("Composition state must not contain cycles")
  seen.add(value)
  if (record(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenStateKeys.has(key)) throw new Error(`Composition state must not persist ${key}`)
      rejectForbiddenState(child, seen)
    }
  } else {
    value.forEach((child) => rejectForbiddenState(child, seen))
  }
  seen.delete(value)
}

export function validateState(input) {
  rejectForbiddenState(input)
  if (!record(input) || input.schema !== STATE_SCHEMA || input.schemaVersion !== STATE_VERSION) throw new Error("Composition state schema is invalid")
  const composition = input.composition
  if (!record(composition)) throw new Error("Composition is invalid")
  const settings = composition.settings
  if (!record(settings)) throw new Error("Composition settings are invalid")
  const parsed = createEmptyState({
    compositionId: requireString(composition.id, "Composition id", 256),
    name: requireString(composition.name, "Composition name", 256),
    settings: {
      width: settings.width,
      height: settings.height,
      editRate: parseEditRate(settings.editRate),
      sampleRate: settings.sampleRate,
      channelLayout: settings.channelLayout,
      background: settings.background,
    },
  })
  if (!Number.isSafeInteger(settings.width) || settings.width < 1 || settings.width > 16384) throw new Error("Composition width is invalid")
  if (!Number.isSafeInteger(settings.height) || settings.height < 1 || settings.height > 16384) throw new Error("Composition height is invalid")
  if (!Number.isSafeInteger(settings.sampleRate) || settings.sampleRate < 8000 || settings.sampleRate > 384000) throw new Error("Composition sample rate is invalid")
  if (settings.channelLayout !== "mono" && settings.channelLayout !== "stereo") throw new Error("Composition channel layout is invalid")
  parsed.composition.settings = {
    width: settings.width,
    height: settings.height,
    editRate: parseEditRate(settings.editRate),
    sampleRate: settings.sampleRate,
    channelLayout: settings.channelLayout,
    background: requireString(settings.background, "Composition background", 64),
  }
  if (!record(composition.tracksById) || !record(composition.itemsById) || !Array.isArray(composition.trackOrder)) {
    throw new Error("Composition collections are invalid")
  }
  for (const [id, track] of Object.entries(composition.tracksById)) {
    if (!record(track) || id !== track.id || (track.kind !== "video" && track.kind !== "audio")) throw new Error(`Track is invalid: ${id}`)
    parsed.composition.tracksById[id] = {
      id: requireString(track.id, "Track id", 256),
      kind: track.kind,
      name: requireString(track.name, "Track name", 256),
      enabled: requireBoolean(track.enabled, "Track enabled"),
      locked: requireBoolean(track.locked, "Track locked"),
      muted: requireBoolean(track.muted, "Track muted"),
      ...(track.originNodeId === undefined ? {} : { originNodeId: requireString(track.originNodeId, "Track origin", 2048) }),
    }
  }
  const trackOrder = composition.trackOrder.map((id) => requireString(id, "Track order id", 256))
  if (new Set(trackOrder).size !== trackOrder.length || trackOrder.length !== Object.keys(parsed.composition.tracksById).length) throw new Error("Track order is invalid")
  if (trackOrder.some((id) => !parsed.composition.tracksById[id])) throw new Error("Track order references a missing track")
  parsed.composition.trackOrder = trackOrder
  for (const [id, item] of Object.entries(composition.itemsById)) {
    if (!record(item) || item.type !== "media" || id !== item.id) throw new Error(`Timeline item is invalid: ${id}`)
    if (!parsed.composition.tracksById[item.trackId]) throw new Error(`Timeline item references a missing track: ${id}`)
    if (!record(item.sourceRef) || item.sourceRef.kind !== "canvas-node") throw new Error(`Timeline source reference is invalid: ${id}`)
    if (!record(item.playbackRate) || !Number.isSafeInteger(item.playbackRate.numerator) || !Number.isSafeInteger(item.playbackRate.denominator) || item.playbackRate.denominator <= 0 || item.playbackRate.numerator <= 0) {
      throw new Error(`Timeline playback rate is invalid: ${id}`)
    }
    const fit = item.fit === "cover" ? "cover" : item.fit === "contain" ? "contain" : undefined
    if (!fit || typeof item.opacity !== "number" || item.opacity < 0 || item.opacity > 1 || typeof item.gain !== "number" || item.gain < 0 || item.gain > 4) {
      throw new Error(`Timeline item presentation is invalid: ${id}`)
    }
    parsed.composition.itemsById[id] = {
      id: requireString(item.id, "Timeline item id", 256),
      type: "media",
      trackId: requireString(item.trackId, "Timeline track id", 256),
      sourceRef: { kind: "canvas-node", nodeId: requireString(item.sourceRef.nodeId, "Source node id", 2048) },
      sourceRange: requireRange(item.sourceRange, "Source range"),
      timelineRange: requireRange(item.timelineRange, "Timeline range"),
      playbackRate: { numerator: item.playbackRate.numerator, denominator: item.playbackRate.denominator },
      enabled: requireBoolean(item.enabled, "Timeline item enabled"),
      name: requireString(item.name, "Timeline item name", 256),
      fit,
      opacity: item.opacity,
      gain: item.gain,
    }
  }
  if (!record(input.sourceBindingsByNodeId)) throw new Error("Source bindings are invalid")
  for (const [nodeId, binding] of Object.entries(input.sourceBindingsByNodeId)) {
    if (!record(binding) || binding.nodeId !== nodeId || (binding.kind !== "video" && binding.kind !== "audio")) throw new Error(`Source binding is invalid: ${nodeId}`)
    const trackId = requireString(binding.trackId, "Binding track id", 256)
    const initialItemId = requireString(binding.initialItemId, "Binding item id", 256)
    if (!parsed.composition.tracksById[trackId]) throw new Error(`Source binding references a missing track: ${nodeId}`)
    parsed.sourceBindingsByNodeId[nodeId] = {
      nodeId: requireString(binding.nodeId, "Binding node id", 2048),
      kind: binding.kind,
      trackId,
      initialItemId,
      label: requireString(binding.label, "Binding label", 512),
      status: binding.status === "online" ? "online" : binding.status === "offline" ? "offline" : (() => { throw new Error(`Source binding status is invalid: ${nodeId}`) })(),
      ...(binding.mimeType === undefined ? {} : { mimeType: requireString(binding.mimeType, "Binding MIME", 256) }),
      ...(binding.duration === undefined ? {} : { duration: requireRange({ start: time(), duration: binding.duration }, "Binding duration").duration }),
      ...(binding.durationEstimated === undefined
        ? {}
        : { durationEstimated: requireBoolean(binding.durationEstimated, "Binding duration estimated") }),
      ...(binding.mediaRevision === undefined ? {} : { mediaRevision: requireString(binding.mediaRevision, "Binding media revision", 256) }),
    }
  }
  assertNoTrackOverlaps(parsed)
  return parsed
}

export function itemsForTrack(state, trackId) {
  return Object.values(state.composition.itemsById)
    .filter((item) => item.trackId === trackId)
    .sort((left, right) => compareTime(left.timelineRange.start, right.timelineRange.start) || left.id.localeCompare(right.id))
}

export function assertNoTrackOverlaps(state) {
  for (const trackId of state.composition.trackOrder) {
    const items = itemsForTrack(state, trackId)
    for (let index = 1; index < items.length; index += 1) {
      if (compareTime(timeEnd(items[index - 1].timelineRange), items[index].timelineRange.start) > 0) {
        throw new Error(`Timeline items overlap on track ${trackId}`)
      }
    }
  }
}

export function migrateState(raw) {
  if (!record(raw)) throw new Error("Composition state must be an object")
  if (raw.schema !== STATE_SCHEMA) throw new Error("Composition state belongs to another schema")
  if (!Number.isSafeInteger(raw.schemaVersion) || raw.schemaVersion < 1) throw new Error("Composition state version is invalid")
  if (raw.schemaVersion > STATE_VERSION) return { kind: "future", raw: structuredClone(raw), version: raw.schemaVersion }
  let current = structuredClone(raw)
  while (current.schemaVersion < STATE_VERSION) {
    throw new Error(`No migration exists from Composition schema ${current.schemaVersion}`)
  }
  return { kind: "ready", state: validateState(current) }
}

export function openState(raw) {
  if (raw === undefined || (record(raw) && Object.keys(raw).length === 0)) return { kind: "ready", state: createEmptyState(), created: true }
  try {
    return migrateState(raw)
  } catch (error) {
    return { kind: "invalid", error: error instanceof Error ? error.message : String(error), raw: structuredClone(raw) }
  }
}

export function serializedStateBytes(state) {
  return new TextEncoder().encode(JSON.stringify(state)).byteLength
}

export function prepareStateSave(state, maximum = MAX_STATE_BYTES) {
  const parsed = validateState(state)
  const serialized = JSON.stringify(parsed)
  const bytes = new TextEncoder().encode(serialized).byteLength
  return bytes > maximum
    ? { ok: false, bytes, maximum, state: parsed, error: `Timeline state is ${bytes} bytes and exceeds the ${maximum} byte safety limit.` }
    : { ok: true, bytes, maximum, serialized, state: parsed }
}

export function cloneState(state) {
  return structuredClone(state)
}
