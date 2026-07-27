import { compareTime, timeEnd } from "./model.js"

function bindingFor(state, item) {
  return state.sourceBindingsByNodeId[item.sourceRef.nodeId]
}

function isOutOfRange(state, item) {
  const binding = bindingFor(state, item)
  return Boolean(binding?.duration && compareTime(timeEnd(item.sourceRange), binding.duration) > 0)
}

export function activePlaybackItems(state, at) {
  return state.composition.trackOrder.flatMap((trackId) => {
    const track = state.composition.tracksById[trackId]
    if (!track?.enabled || (track.kind === "audio" && track.muted)) return []
    return Object.values(state.composition.itemsById)
      .filter((item) =>
        item.trackId === trackId &&
        item.enabled &&
        bindingFor(state, item)?.status === "online" &&
        !isOutOfRange(state, item) &&
        compareTime(at, item.timelineRange.start) >= 0 &&
        compareTime(at, timeEnd(item.timelineRange)) < 0,
      )
      .sort((left, right) => left.id.localeCompare(right.id))
  })
}

export function firstPlayableTimelineStart(state) {
  const trackIndex = new Map(state.composition.trackOrder.map((trackId, index) => [trackId, index]))
  const candidates = Object.values(state.composition.itemsById)
    .filter((item) => {
      const track = state.composition.tracksById[item.trackId]
      return (
        track?.enabled &&
        !(track.kind === "audio" && track.muted) &&
        item.enabled &&
        bindingFor(state, item)?.status === "online" &&
        !isOutOfRange(state, item)
      )
    })
    .sort(
      (left, right) =>
        compareTime(left.timelineRange.start, right.timelineRange.start) ||
        (trackIndex.get(left.trackId) ?? Number.MAX_SAFE_INTEGER) -
          (trackIndex.get(right.trackId) ?? Number.MAX_SAFE_INTEGER) ||
        left.id.localeCompare(right.id),
    )
  return candidates[0] ? structuredClone(candidates[0].timelineRange.start) : null
}

export function playbackTimelineEnd(state, at) {
  return state.composition.trackOrder.reduce((latest, trackId) => {
    const track = state.composition.tracksById[trackId]
    if (!track?.enabled || (track.kind === "audio" && track.muted)) return latest
    return Object.values(state.composition.itemsById).reduce((itemLatest, item) => {
      if (
        item.trackId !== trackId ||
        !item.enabled ||
        bindingFor(state, item)?.status !== "online" ||
        isOutOfRange(state, item)
      ) {
        return itemLatest
      }
      const end = timeEnd(item.timelineRange)
      return compareTime(end, itemLatest) > 0 ? end : itemLatest
    }, latest)
  }, at)
}
