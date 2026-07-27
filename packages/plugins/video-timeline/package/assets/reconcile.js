import { cloneState, compareTime, createId, time, timeFromMilliseconds, timeEnd } from "./model.js"

function descriptor(input) {
  if (!input || typeof input.id !== "string" || !input.id) return null
  const kind = input.kind === "video" || input.kind === "audio" ? input.kind : "unsupported"
  return {
    id: input.id,
    kind,
    label: typeof input.name === "string" && input.name ? input.name : typeof input.label === "string" && input.label ? input.label : "Untitled source",
    ...(typeof input.mimeType === "string" ? { mimeType: input.mimeType } : {}),
    ...(typeof input.durationMs === "number" && Number.isFinite(input.durationMs) && input.durationMs > 0 ? { durationMs: input.durationMs } : {}),
    ...(typeof input.mediaRevision === "string" ? { mediaRevision: input.mediaRevision } : {}),
  }
}

export function reconcileConnectedInputs(state, rawInputs, options = {}) {
  const next = cloneState(state)
  const id = options.createId ?? createId
  const inputs = []
  const seen = new Set()
  const diagnostics = []
  for (const raw of Array.isArray(rawInputs) ? rawInputs : []) {
    const input = descriptor(raw)
    if (!input || seen.has(input.id)) continue
    seen.add(input.id)
    inputs.push(input)
  }
  for (const binding of Object.values(next.sourceBindingsByNodeId)) {
    if (!seen.has(binding.nodeId)) binding.status = "offline"
  }
  for (const input of inputs) {
    if (input.kind === "unsupported") {
      diagnostics.push({ code: "unsupported-input", nodeId: input.id, message: `${input.label} is not a video or audio source.` })
      continue
    }
    const existing = next.sourceBindingsByNodeId[input.id]
    const reportedDuration = input.durationMs
      ? timeFromMilliseconds(input.durationMs, next.composition.settings.editRate)
      : null
    const duration =
      reportedDuration ??
      existing?.duration ??
      timeFromMilliseconds(1000, next.composition.settings.editRate)
    if (existing) {
      existing.status = "online"
      existing.label = input.label
      if (input.mimeType) existing.mimeType = input.mimeType
      if (input.mediaRevision) existing.mediaRevision = input.mediaRevision
      if (reportedDuration) {
        existing.duration = reportedDuration
        existing.durationEstimated = false
      } else if (existing.durationEstimated === undefined) {
        existing.durationEstimated = true
      }
      for (const item of Object.values(next.composition.itemsById).filter((candidate) => candidate.sourceRef.nodeId === input.id)) {
        if (compareTime(timeEnd(item.sourceRange), duration) > 0) {
          diagnostics.push({ code: "source-out-of-range", itemId: item.id, nodeId: input.id, message: `${item.name} extends beyond the current source duration.` })
        }
      }
      if (existing.durationEstimated) {
        diagnostics.push({ code: "estimated-duration", nodeId: input.id, message: `${input.label} is resolving media duration metadata in the background.` })
      }
      continue
    }
    const trackId = id(input.kind === "video" ? "video-track" : "audio-track")
    const itemId = id("clip")
    next.composition.tracksById[trackId] = {
      id: trackId,
      kind: input.kind,
      name: input.kind === "video" ? `Video · ${input.label}` : `Audio · ${input.label}`,
      enabled: true,
      locked: false,
      muted: false,
      originNodeId: input.id,
    }
    next.composition.trackOrder.push(trackId)
    next.composition.itemsById[itemId] = {
      id: itemId,
      type: "media",
      trackId,
      sourceRef: { kind: "canvas-node", nodeId: input.id },
      sourceRange: { start: time(), duration },
      timelineRange: { start: time(), duration },
      playbackRate: { numerator: 1, denominator: 1 },
      enabled: true,
      name: input.label,
      fit: "contain",
      opacity: 1,
      gain: 1,
    }
    next.sourceBindingsByNodeId[input.id] = {
      nodeId: input.id,
      kind: input.kind,
      trackId,
      initialItemId: itemId,
      label: input.label,
      status: "online",
      duration,
      durationEstimated: !reportedDuration,
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      ...(input.mediaRevision ? { mediaRevision: input.mediaRevision } : {}),
    }
    if (!input.durationMs) diagnostics.push({ code: "estimated-duration", nodeId: input.id, message: `${input.label} has no duration metadata; its one-second placeholder is being resolved from the media.` })
  }
  return { changed: JSON.stringify(next) !== JSON.stringify(state), diagnostics, state: next }
}

export function applyDetectedSourceDuration(state, nodeId, durationMs) {
  if (typeof nodeId !== "string" || !nodeId || !Number.isFinite(durationMs) || durationMs <= 0) {
    return { changed: false, state }
  }
  const currentBinding = state.sourceBindingsByNodeId[nodeId]
  if (!currentBinding) return { changed: false, state }
  const next = cloneState(state)
  const binding = next.sourceBindingsByNodeId[nodeId]
  const previousDuration = binding.duration
  const duration = timeFromMilliseconds(durationMs, next.composition.settings.editRate)
  const wasEstimated = binding.durationEstimated !== false
  binding.duration = duration
  binding.durationEstimated = false
  const item = next.composition.itemsById[binding.initialItemId]
  if (
    wasEstimated &&
    item &&
    compareTime(item.sourceRange.start, time()) === 0 &&
    compareTime(item.sourceRange.duration, previousDuration) === 0 &&
    compareTime(item.timelineRange.duration, previousDuration) === 0
  ) {
    item.sourceRange.duration = structuredClone(duration)
    item.timelineRange.duration = structuredClone(duration)
  }
  return { changed: JSON.stringify(next) !== JSON.stringify(state), state: next }
}

export class ConnectedInputReconciler {
  #generation = 0

  invalidate() {
    this.#generation += 1
    return this.#generation
  }

  async refresh(load, currentState, options = {}) {
    const generation = this.invalidate()
    const result = await load()
    if (generation !== this.#generation) return { stale: true, state: currentState, diagnostics: [] }
    return { stale: false, ...reconcileConnectedInputs(currentState, result?.inputs ?? [], options) }
  }
}
