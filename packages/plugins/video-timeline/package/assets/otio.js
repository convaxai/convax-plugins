import {
  addTime,
  assertNoTrackOverlaps,
  compareTime,
  createEmptyState,
  createId,
  itemsForTrack,
  normalizeTime,
  subtractTime,
  time,
  timeEnd,
  validateState,
} from "./model.js"

function rational(value) {
  const normalized = normalizeTime(value)
  const numericValue = Number(normalized.value)
  if (!Number.isSafeInteger(numericValue)) throw new Error("Timeline time exceeds the exact OTIO numeric subset")
  return { OTIO_SCHEMA: "RationalTime.1", value: numericValue, rate: normalized.scale }
}

function range(value) {
  return { OTIO_SCHEMA: "TimeRange.1", start_time: rational(value.start), duration: rational(value.duration) }
}

function fromRational(value, label) {
  if (!value || value.OTIO_SCHEMA !== "RationalTime.1" || !Number.isFinite(value.value) || !Number.isFinite(value.rate) || value.rate <= 0) {
    throw new Error(`${label} is not a supported RationalTime`)
  }
  if (!Number.isSafeInteger(value.value) || !Number.isSafeInteger(value.rate)) throw new Error(`${label} exceeds the exact rational subset`)
  return normalizeTime({ value: String(value.value), scale: value.rate })
}

function fromRange(value, label) {
  if (!value || value.OTIO_SCHEMA !== "TimeRange.1") throw new Error(`${label} is not a supported TimeRange`)
  return { start: fromRational(value.start_time, `${label} start`), duration: fromRational(value.duration, `${label} duration`) }
}

function missingReference(item) {
  return {
    OTIO_SCHEMA: "MissingReference.1",
    name: item.name,
    available_range: range(item.sourceRange),
    metadata: { convax: { sourceKind: "canvas-node", sourceNodeId: item.sourceRef.nodeId } },
  }
}

export function exportOtio(state) {
  const parsed = validateState(state)
  assertNoTrackOverlaps(parsed)
  const tracks = parsed.composition.trackOrder.map((trackId) => {
    const track = parsed.composition.tracksById[trackId]
    let cursor = time()
    const children = []
    for (const item of itemsForTrack(parsed, trackId)) {
      if (compareTime(item.timelineRange.start, cursor) < 0) throw new Error(`Cannot export overlapping track ${track.name}`)
      if (compareTime(item.timelineRange.start, cursor) > 0) {
        children.push({
          OTIO_SCHEMA: "Gap.1",
          name: "Gap",
          source_range: range({ start: time(), duration: subtractTime(item.timelineRange.start, cursor) }),
          metadata: {},
          effects: [],
          markers: [],
        })
      }
      children.push({
        OTIO_SCHEMA: "Clip.2",
        name: item.name,
        source_range: range(item.sourceRange),
        media_reference: missingReference(item),
        metadata: {
          convax: {
            enabled: item.enabled,
            fit: item.fit,
            gain: item.gain,
            itemId: item.id,
            opacity: item.opacity,
          },
        },
        effects: [],
        markers: [],
      })
      cursor = timeEnd(item.timelineRange)
    }
    return {
      OTIO_SCHEMA: "Track.1",
      name: track.name,
      kind: track.kind === "video" ? "Video" : "Audio",
      children,
      metadata: { convax: { enabled: track.enabled, locked: track.locked, muted: track.muted, trackId: track.id } },
      effects: [],
      markers: [],
    }
  })
  return {
    OTIO_SCHEMA: "Timeline.1",
    name: parsed.composition.name,
    global_start_time: null,
    metadata: {
      convax: {
        compositionId: parsed.composition.id,
        editRate: parsed.composition.settings.editRate,
        schema: "convax.video-timeline.otio-subset/1",
      },
    },
    tracks: { OTIO_SCHEMA: "Stack.1", name: "Tracks", children: tracks, metadata: {}, effects: [], markers: [] },
  }
}

function rejectUnsupported(value, path = "Timeline") {
  if (!value || typeof value !== "object") return
  const schema = value.OTIO_SCHEMA
  if (typeof schema === "string" && (schema.startsWith("Transition.") || schema.startsWith("TimeEffect.") || schema.startsWith("LinearTimeWarp.") || schema.startsWith("FreezeFrame."))) {
    throw new Error(`${path} contains unsupported ${schema}`)
  }
  if (schema === "Stack.1" && path !== "Timeline.tracks") throw new Error(`${path} contains an unsupported nested composition`)
  for (const [key, child] of Object.entries(value)) {
    if (key === "metadata") continue
    if (Array.isArray(child)) child.forEach((entry, index) => rejectUnsupported(entry, `${path}.${key}[${index}]`))
    else rejectUnsupported(child, `${path}.${key}`)
  }
}

export function importOtio(input, options = {}) {
  if (!input || input.OTIO_SCHEMA !== "Timeline.1" || input.tracks?.OTIO_SCHEMA !== "Stack.1" || !Array.isArray(input.tracks.children)) {
    throw new Error("OTIO document must contain Timeline > Stack")
  }
  rejectUnsupported(input)
  const id = options.createId ?? createId
  const state = createEmptyState({ compositionId: id("composition"), name: typeof input.name === "string" && input.name ? input.name : "Imported Timeline" })
  const diagnostics = []
  for (const [trackIndex, sourceTrack] of input.tracks.children.entries()) {
    if (!sourceTrack || sourceTrack.OTIO_SCHEMA !== "Track.1" || !Array.isArray(sourceTrack.children)) throw new Error(`OTIO track ${trackIndex} is invalid`)
    const kind = sourceTrack.kind === "Audio" ? "audio" : sourceTrack.kind === "Video" ? "video" : null
    if (!kind) throw new Error(`OTIO track ${trackIndex} has an unsupported kind`)
    const trackId = id(`${kind}-track`)
    state.composition.trackOrder.push(trackId)
    state.composition.tracksById[trackId] = {
      id: trackId,
      kind,
      name: typeof sourceTrack.name === "string" && sourceTrack.name ? sourceTrack.name : `${kind} ${trackIndex + 1}`,
      enabled: sourceTrack.metadata?.convax?.enabled !== false,
      locked: sourceTrack.metadata?.convax?.locked === true,
      muted: sourceTrack.metadata?.convax?.muted === true,
    }
    let cursor = time()
    for (const [childIndex, child] of sourceTrack.children.entries()) {
      const path = `Track ${trackIndex + 1} item ${childIndex + 1}`
      if (child?.OTIO_SCHEMA === "Gap.1") {
        const gap = fromRange(child.source_range, `${path} Gap range`)
        cursor = addTime(cursor, gap.duration)
        continue
      }
      if (child?.OTIO_SCHEMA !== "Clip.2" && child?.OTIO_SCHEMA !== "Clip.1") throw new Error(`${path} is not a supported Clip or Gap`)
      if (Array.isArray(child.effects) && child.effects.length) throw new Error(`${path} contains unsupported time effects`)
      const sourceRange = fromRange(child.source_range, `${path} source range`)
      const reference = child.media_reference
      if (!reference || (reference.OTIO_SCHEMA !== "MissingReference.1" && !String(reference.OTIO_SCHEMA).startsWith("ExternalReference."))) {
        throw new Error(`${path} has an unsupported media reference`)
      }
      const metadataNodeId = reference.metadata?.convax?.sourceNodeId
      const nodeId = typeof metadataNodeId === "string" && metadataNodeId ? metadataNodeId : `offline:${id("source")}`
      const binding = state.sourceBindingsByNodeId[nodeId]
      const itemId = id("clip")
      state.composition.itemsById[itemId] = {
        id: itemId,
        type: "media",
        trackId,
        sourceRef: { kind: "canvas-node", nodeId },
        sourceRange,
        timelineRange: { start: cursor, duration: sourceRange.duration },
        playbackRate: { numerator: 1, denominator: 1 },
        enabled: child.metadata?.convax?.enabled !== false,
        name: typeof child.name === "string" && child.name ? child.name : `Clip ${childIndex + 1}`,
        fit: child.metadata?.convax?.fit === "cover" ? "cover" : "contain",
        opacity: typeof child.metadata?.convax?.opacity === "number" ? Math.min(1, Math.max(0, child.metadata.convax.opacity)) : 1,
        gain: typeof child.metadata?.convax?.gain === "number" ? Math.min(4, Math.max(0, child.metadata.convax.gain)) : 1,
      }
      if (!binding) {
        state.sourceBindingsByNodeId[nodeId] = {
          nodeId,
          kind,
          trackId,
          initialItemId: itemId,
          label: typeof child.name === "string" && child.name ? child.name : "Offline source",
          status: "offline",
          duration: timeEnd(sourceRange),
        }
        diagnostics.push({ code: "offline-import", nodeId, message: `${child.name || "Clip"} requires a Canvas source binding.` })
      }
      cursor = addTime(cursor, sourceRange.duration)
    }
  }
  return { diagnostics, state: validateState(state) }
}
