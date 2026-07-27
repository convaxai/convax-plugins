import {
  addTime,
  assertNoTrackOverlaps,
  cloneState,
  compareTime,
  createId,
  multiplyTime,
  snapTime,
  subtractTime,
  time,
  timeEnd,
} from "./model.js"

function editableItem(state, itemId) {
  const item = state.composition.itemsById[itemId]
  if (!item) throw new Error(`Timeline item was not found: ${itemId}`)
  const track = state.composition.tracksById[item.trackId]
  if (!track) throw new Error(`Timeline track was not found: ${item.trackId}`)
  if (track.locked) throw new Error(`Timeline track is locked: ${track.name}`)
  return { item, track }
}

function commit(state, mutate) {
  const next = cloneState(state)
  mutate(next)
  assertNoTrackOverlaps(next)
  return next
}

export function moveClip(state, itemId, start, trackId) {
  return commit(state, (next) => {
    const { item } = editableItem(next, itemId)
    const targetTrackId = trackId ?? item.trackId
    const target = next.composition.tracksById[targetTrackId]
    if (!target || target.kind !== next.composition.tracksById[item.trackId].kind || target.locked) throw new Error("Clip cannot move to that track")
    const snapped = snapTime(start, next.composition.settings.editRate)
    if (compareTime(snapped, time()) < 0) throw new Error("Clip cannot start before the Timeline")
    item.trackId = targetTrackId
    item.timelineRange.start = snapped
  })
}

export function trimClipLeft(state, itemId, start) {
  return commit(state, (next) => {
    const { item } = editableItem(next, itemId)
    const snapped = snapTime(start, next.composition.settings.editRate)
    const delta = subtractTime(snapped, item.timelineRange.start)
    const duration = subtractTime(item.timelineRange.duration, delta)
    if (compareTime(snapped, time()) < 0 || compareTime(duration, time()) <= 0) throw new Error("Left trim must leave a positive Clip duration")
    const sourceDelta = multiplyTime(delta, item.playbackRate)
    const sourceStart = addTime(item.sourceRange.start, sourceDelta)
    const sourceDuration = subtractTime(item.sourceRange.duration, sourceDelta)
    if (compareTime(sourceStart, time()) < 0 || compareTime(sourceDuration, time()) <= 0) throw new Error("Left trim exceeds the source range")
    item.timelineRange = { start: snapped, duration }
    item.sourceRange = { start: sourceStart, duration: sourceDuration }
  })
}

export function trimClipRight(state, itemId, endExclusive) {
  return commit(state, (next) => {
    const { item } = editableItem(next, itemId)
    const snapped = snapTime(endExclusive, next.composition.settings.editRate)
    const duration = subtractTime(snapped, item.timelineRange.start)
    if (compareTime(duration, time()) <= 0) throw new Error("Right trim must leave a positive Clip duration")
    const delta = subtractTime(duration, item.timelineRange.duration)
    const sourceDuration = addTime(item.sourceRange.duration, multiplyTime(delta, item.playbackRate))
    if (compareTime(sourceDuration, time()) <= 0) throw new Error("Right trim exceeds the source range")
    item.timelineRange.duration = duration
    item.sourceRange.duration = sourceDuration
  })
}

export function splitClip(state, itemId, playhead, options = {}) {
  let createdItemId
  const next = commit(state, (draft) => {
    const { item } = editableItem(draft, itemId)
    const split = snapTime(playhead, draft.composition.settings.editRate)
    const end = timeEnd(item.timelineRange)
    if (compareTime(split, item.timelineRange.start) <= 0 || compareTime(split, end) >= 0) throw new Error("Playhead must be inside the Clip")
    const leftDuration = subtractTime(split, item.timelineRange.start)
    const rightDuration = subtractTime(end, split)
    const sourceLeftDuration = multiplyTime(leftDuration, item.playbackRate)
    const rightSourceStart = addTime(item.sourceRange.start, sourceLeftDuration)
    const rightSourceDuration = subtractTime(item.sourceRange.duration, sourceLeftDuration)
    createdItemId = (options.createId ?? createId)("clip")
    item.timelineRange.duration = leftDuration
    item.sourceRange.duration = sourceLeftDuration
    draft.composition.itemsById[createdItemId] = {
      ...structuredClone(item),
      id: createdItemId,
      sourceRange: { start: rightSourceStart, duration: rightSourceDuration },
      timelineRange: { start: split, duration: rightDuration },
      name: `${item.name} · split`,
    }
  })
  return { createdItemId, state: next }
}

export function removeClip(state, itemId) {
  return commit(state, (next) => {
    editableItem(next, itemId)
    delete next.composition.itemsById[itemId]
  })
}

export function duplicateClip(state, itemId, options = {}) {
  let createdItemId
  const next = commit(state, (draft) => {
    const { item } = editableItem(draft, itemId)
    createdItemId = (options.createId ?? createId)("clip")
    draft.composition.itemsById[createdItemId] = {
      ...structuredClone(item),
      id: createdItemId,
      timelineRange: { start: timeEnd(item.timelineRange), duration: structuredClone(item.timelineRange.duration) },
      name: `${item.name} · copy`,
    }
  })
  return { createdItemId, state: next }
}

export function reorderTrack(state, trackId, direction) {
  return commit(state, (next) => {
    const index = next.composition.trackOrder.indexOf(trackId)
    if (index < 0) throw new Error("Track was not found")
    const target = index + (direction < 0 ? -1 : 1)
    if (target < 0 || target >= next.composition.trackOrder.length) return
    ;[next.composition.trackOrder[index], next.composition.trackOrder[target]] = [next.composition.trackOrder[target], next.composition.trackOrder[index]]
  })
}

export function updateTrack(state, trackId, patch) {
  return commit(state, (next) => {
    const track = next.composition.tracksById[trackId]
    if (!track) throw new Error("Track was not found")
    for (const key of ["enabled", "locked", "muted"]) if (key in patch) track[key] = Boolean(patch[key])
  })
}

export function updateClipPresentation(state, itemId, patch) {
  return commit(state, (next) => {
    const { item } = editableItem(next, itemId)
    if (patch.fit === "contain" || patch.fit === "cover") item.fit = patch.fit
    if (typeof patch.opacity === "number" && patch.opacity >= 0 && patch.opacity <= 1) item.opacity = patch.opacity
    if (typeof patch.gain === "number" && patch.gain >= 0 && patch.gain <= 4) item.gain = patch.gain
  })
}

export function playbackSourceTime(item, playhead) {
  const offset = subtractTime(playhead, item.timelineRange.start)
  if (compareTime(offset, time()) < 0 || compareTime(playhead, timeEnd(item.timelineRange)) >= 0) return null
  return addTime(item.sourceRange.start, multiplyTime(offset, item.playbackRate))
}
