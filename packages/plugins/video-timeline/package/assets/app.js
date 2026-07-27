import {
  duplicateClip,
  moveClip,
  playbackSourceTime,
  removeClip,
  reorderTrack,
  splitClip,
  trimClipLeft,
  trimClipRight,
  updateClipPresentation,
  updateTrack,
} from "./edit.js"
import { TimelineHostClient, TimelineSaveController } from "./host.js"
import {
  MAX_STATE_BYTES,
  compareTime,
  openState,
  prepareStateSave,
  seconds,
  time,
  timeEnd,
  timeFromSeconds,
} from "./model.js"
import { applyDetectedSourceDuration, ConnectedInputReconciler } from "./reconcile.js"
import { exportOtio, importOtio } from "./otio.js"
import { activePlaybackItems, firstPlayableTimelineStart, playbackTimelineEnd } from "./playback.js"
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  ZOOM_STEP,
  anchoredScrollLeft,
  clampPixelsPerSecond,
  fitPixelsPerSecond,
  resolveWheelPan,
} from "./viewport.js"

const elements = Object.fromEntries(
  [
    "audio-monitor", "card-export-otio", "clip-fit", "clip-gain", "clip-opacity", "composition-name", "composition-summary", "diagnostics", "duplicate-clip", "duration",
    "edit-timeline", "empty-state", "export-otio", "fullscreen", "import-otio", "mini-playhead", "mini-timeline", "mini-tracks", "monitor", "monitor-badge", "monitor-empty", "otio-file", "play", "playhead", "remove-clip", "ruler",
    "save-state", "split-clip", "timecode", "timeline-scroll", "tracks", "video-monitor", "zoom", "zoom-fit", "zoom-in", "zoom-out", "zoom-value",
  ].map((id) => [id, document.getElementById(id)]),
)

const host = new TimelineHostClient()
const reconciler = new ConnectedInputReconciler()
let state
let rawInvalidState = null
let readOnly = false
let selectedItemId = null
let playhead = time()
let pixelsPerSecond = Number(elements.zoom.value)
let diagnostics = []
let mediaSessions = []
let playing = false
let animationFrame = null
let lastFrameAt = 0
let playbackGeneration = 0
let playbackRefresh = null
let previewRefreshQueued = false
let gesture = null
let panGesture = null
let rulerGesture = null
let miniScrubPointerId = null
let connectedMediaOpenQueue = Promise.resolve()
let durationProbeGeneration = 0

const saver = new TimelineSaveController(async (snapshot) => {
  const prepared = prepareStateSave(snapshot, MAX_STATE_BYTES)
  if (!prepared.ok) throw new Error(prepared.error)
  await host.request("canvas.node.updateState", { state: prepared.state })
}, {
  onStatus(status, error) {
    elements["save-state"].dataset.state = status
    elements["save-state"].textContent = status === "saved" ? "Saved" : status === "saving" ? "Saving…" : status === "unsaved" ? "Unsaved" : `Save failed · ${error?.message ?? "retry available"}`
    if (status === "failed") addDiagnostic("save-failed", error?.message ?? "Timeline changes could not be saved.", "error")
  },
})

window.addEventListener("message", (event) => {
  if (host.acceptConnect(event)) void initialize()
})

window.setTimeout(() => {
  if (!state) {
    readOnly = true
    state = openState(undefined).state
    addDiagnostic("incompatible-host", "This Convax host does not support convax.plugin-capability/2. Timeline is read-only.", "error")
    render()
  }
}, 5000)

host.onCommand((command) => {
  if (command === "canvas.connectedInputs.changed") void reconcileInputs()
})

async function initialize() {
  try {
    const node = await host.request("canvas.node.get")
    const persisted = node?.data?.metadata?.convaxPluginState
    const opened = openState(persisted)
    if (opened.kind === "future") {
      state = opened.raw
      rawInvalidState = opened.raw
      readOnly = true
      addDiagnostic("future-state", `This Timeline uses newer schema ${opened.version}; it is open read-only.`, "error")
    } else if (opened.kind === "invalid") {
      state = openState(undefined).state
      rawInvalidState = opened.raw
      readOnly = true
      addDiagnostic("invalid-state", `Stored Timeline is damaged and was preserved: ${opened.error}`, "error")
    } else {
      state = opened.state
      if (opened.created) saver.mark(state)
      else saver.hydrate(state)
    }
    await reconcileInputs()
    render()
  } catch (error) {
    readOnly = true
    state = openState(undefined).state
    addDiagnostic("host-error", `Timeline host connection failed: ${message(error)}`, "error")
    render()
  }
}

async function reconcileInputs() {
  if (!state || readOnly) return
  try {
    const result = await reconciler.refresh(() => host.request("canvas.connectedInputs.list"), state)
    if (result.stale) return
    diagnostics = diagnostics.filter((entry) => !["unsupported-input", "source-out-of-range", "estimated-duration", "inputs-failed"].includes(entry.code))
    result.diagnostics.forEach((entry) => addDiagnostic(entry.code, entry.message))
    if (result.changed) {
      state = result.state
      saver.mark(state)
    }
    render()
    requestDurationResolution()
    if (mediaSessions.length > 0 || playing) requestPreviewRefresh()
  } catch (error) {
    addDiagnostic("inputs-failed", `Connected inputs could not be refreshed: ${message(error)}`, "error")
    render()
  }
}

function addDiagnostic(code, text, severity = "warning") {
  diagnostics = diagnostics.filter((entry) => entry.code !== code)
  diagnostics.push({ code, text, severity })
}

function message(error) {
  return error instanceof Error ? error.message : String(error)
}

function commit(next, options = {}) {
  if (readOnly) return
  state = next
  if (!options.local) saver.mark(state)
  render()
  requestPreviewRefresh()
}

function compositionDuration() {
  if (!state) return 0
  return Object.values(state.composition.itemsById).reduce(
    (maximum, item) => Math.max(maximum, seconds(timeEnd(item.timelineRange))),
    0,
  )
}

function timelineDuration() {
  return Math.max(8, Math.ceil(compositionDuration() + 2))
}

function trackHeaderWidth() {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--track-header"))
  return Number.isFinite(value) ? value : 210
}

function viewportAnchorX(clientX) {
  const scroll = elements["timeline-scroll"]
  const rect = scroll.getBoundingClientRect()
  const header = trackHeaderWidth()
  if (Number.isFinite(clientX)) return Math.min(scroll.clientWidth, Math.max(header, clientX - rect.left))
  return header + Math.max(0, scroll.clientWidth - header) / 2
}

function setTimelineZoom(value, options = {}) {
  const scroll = elements["timeline-scroll"]
  const next = clampPixelsPerSecond(value)
  const anchorX = viewportAnchorX(options.clientX)
  const nextScrollLeft = anchoredScrollLeft({
    anchorX,
    headerWidth: trackHeaderWidth(),
    newPixelsPerSecond: next,
    oldPixelsPerSecond: pixelsPerSecond,
    scrollLeft: scroll.scrollLeft,
  })
  pixelsPerSecond = next
  elements.zoom.value = String(next)
  render()
  scroll.scrollLeft = Math.min(nextScrollLeft, Math.max(0, scroll.scrollWidth - scroll.clientWidth))
}

function fitTimeline() {
  const scroll = elements["timeline-scroll"]
  setTimelineZoom(fitPixelsPerSecond({
    duration: timelineDuration(),
    headerWidth: trackHeaderWidth(),
    viewportWidth: scroll.clientWidth,
  }))
  scroll.scrollLeft = 0
}

function selectedItem() {
  return selectedItemId ? state?.composition.itemsById[selectedItemId] ?? null : null
}

function bindingFor(item) {
  return item ? state.sourceBindingsByNodeId[item.sourceRef.nodeId] : null
}

function isOutOfRange(item) {
  const binding = bindingFor(item)
  return Boolean(binding?.duration && compareTime(timeEnd(item.sourceRange), binding.duration) > 0)
}

function render() {
  if (!state) return
  const composition = state.composition
  elements["composition-name"].textContent = composition.name
  const tracks = Object.values(composition.tracksById)
  const videoTracks = tracks.filter((track) => track.kind === "video").length
  const audioTracks = tracks.filter((track) => track.kind === "audio").length
  elements["composition-summary"].textContent = `${videoTracks}V · ${audioTracks}A`
  elements.diagnostics.replaceChildren(...diagnostics.map((entry) => {
    const node = document.createElement("div")
    node.className = `diagnostic ${entry.severity === "error" ? "error" : ""}`
    node.textContent = entry.text
    return node
  }))
  const duration = timelineDuration()
  const width = Math.round(duration * pixelsPerSecond)
  elements["timeline-scroll"].style.setProperty("--timeline-width", `${width}px`)
  document.documentElement.style.setProperty("--px-per-second", `${pixelsPerSecond}px`)
  elements.ruler.replaceChildren(...Array.from({ length: Math.ceil(duration) + 1 }, (_, second) => {
    const tick = document.createElement("span")
    tick.className = "ruler-tick"
    tick.style.left = `${second * pixelsPerSecond}px`
    tick.textContent = `${second}s`
    return tick
  }))
  elements.ruler.setAttribute("aria-valuemax", String(duration))
  elements.ruler.setAttribute("aria-valuenow", String(seconds(playhead)))
  elements["zoom-value"].value = `${pixelsPerSecond} px/s`
  elements["zoom-out"].disabled = pixelsPerSecond <= MIN_PIXELS_PER_SECOND
  elements["zoom-in"].disabled = pixelsPerSecond >= MAX_PIXELS_PER_SECOND
  elements.tracks.replaceChildren(...composition.trackOrder.map(renderTrack))
  elements["empty-state"].hidden = composition.trackOrder.length > 0
  renderMiniTimeline()
  renderSelection()
  renderPlayhead()
  renderMonitorEmpty()
  syncActiveMedia(false)
}

function renderTrack(trackId) {
  const track = state.composition.tracksById[trackId]
  const row = document.createElement("div")
  row.className = "track-row"
  row.dataset.trackId = track.id
  row.dataset.kind = track.kind
  row.dataset.muted = String(track.muted || !track.enabled)
  const title = document.createElement("div")
  title.className = "track-title"
  title.innerHTML = `<div><strong></strong><small>${track.kind}</small></div>`
  title.querySelector("strong").textContent = track.name
  const buttons = document.createElement("div")
  buttons.className = "track-buttons"
  buttons.append(
    trackButton("↑", "Move track up", "track-up", track.id),
    trackButton("↓", "Move track down", "track-down", track.id),
    trackButton(track.locked ? "🔒" : "◻", track.locked ? "Unlock track" : "Lock track", "track-lock", track.id),
    trackButton(track.muted ? "M" : "S", track.muted ? "Unmute track" : "Mute track", "track-mute", track.id),
  )
  title.append(buttons)
  const lane = document.createElement("div")
  lane.className = "track-lane"
  lane.dataset.trackId = track.id
  for (const item of Object.values(state.composition.itemsById).filter((candidate) => candidate.trackId === trackId).sort((a, b) => compareTime(a.timelineRange.start, b.timelineRange.start) || a.id.localeCompare(b.id))) {
    lane.append(renderClip(item, track))
  }
  row.append(title, lane)
  return row
}

function trackButton(text, label, action, trackId) {
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = text
  button.ariaLabel = label
  button.dataset.action = action
  button.dataset.trackId = trackId
  button.disabled = readOnly
  return button
}

function renderClip(item, track) {
  const clip = document.createElement("button")
  clip.type = "button"
  clip.className = "clip"
  clip.dataset.itemId = item.id
  clip.dataset.trackId = item.trackId
  clip.dataset.offline = String(bindingFor(item)?.status !== "online")
  clip.dataset.outOfRange = String(isOutOfRange(item))
  clip.setAttribute("aria-selected", String(item.id === selectedItemId))
  clip.ariaLabel = `${item.name}, ${seconds(item.timelineRange.duration).toFixed(2)} seconds${bindingFor(item)?.status !== "online" ? ", offline" : ""}`
  clip.style.left = `${seconds(item.timelineRange.start) * pixelsPerSecond}px`
  clip.style.width = `${Math.max(6, seconds(item.timelineRange.duration) * pixelsPerSecond)}px`
  clip.disabled = readOnly
  const left = document.createElement("span")
  left.className = "trim-handle left"
  left.dataset.trim = "left"
  const right = document.createElement("span")
  right.className = "trim-handle right"
  right.dataset.trim = "right"
  const name = document.createElement("span")
  name.className = "clip-name"
  name.textContent = item.name
  const duration = document.createElement("span")
  duration.className = "clip-duration"
  duration.textContent = `${seconds(item.timelineRange.duration).toFixed(2)}s${track.locked ? " · LOCKED" : ""}`
  clip.append(left, name, duration, right)
  return clip
}

function renderSelection() {
  const item = selectedItem()
  for (const id of ["duplicate-clip", "split-clip", "remove-clip", "clip-fit", "clip-opacity", "clip-gain"]) elements[id].disabled = !item || readOnly
  if (!item) return
  elements["clip-fit"].value = item.fit
  elements["clip-opacity"].value = String(item.opacity)
  elements["clip-gain"].value = String(item.gain)
  elements["clip-gain"].disabled = readOnly || state.composition.tracksById[item.trackId].kind !== "audio"
  elements["clip-fit"].disabled = readOnly || state.composition.tracksById[item.trackId].kind !== "video"
  elements["clip-opacity"].disabled = readOnly || state.composition.tracksById[item.trackId].kind !== "video"
}

function renderMonitorEmpty() {
  const strong = elements["monitor-empty"].querySelector("strong")
  const detail = elements["monitor-empty"].querySelector("span")
  const item = selectedItem()
  if (item) {
    strong.textContent = item.name
    detail.textContent =
      bindingFor(item)?.status === "online"
        ? "Press Play or scrub the Timeline to preview this Composition."
        : "Source is offline. Reconnect the same Canvas card to restore preview."
    return
  }
  const itemCount = Object.keys(state.composition.itemsById).length
  strong.textContent = itemCount ? state.composition.name : "Empty Composition"
  detail.textContent = itemCount
    ? "Press Play to preview the composed video and audio tracks."
    : "Connect video or audio cards to this Composition."
}

function renderMiniTimeline() {
  const duration = Math.max(compositionDuration(), 1 / 30)
  const lanes = state.composition.trackOrder.slice(0, 4).map((trackId) => {
    const track = state.composition.tracksById[trackId]
    const lane = document.createElement("div")
    lane.className = "mini-track"
    lane.dataset.kind = track.kind
    lane.ariaLabel = track.name
    for (const item of Object.values(state.composition.itemsById).filter((candidate) => candidate.trackId === trackId)) {
      const clip = document.createElement("span")
      clip.className = "mini-clip"
      clip.dataset.offline = String(bindingFor(item)?.status !== "online")
      clip.title = item.name
      clip.style.left = `${Math.max(0, Math.min(100, (seconds(item.timelineRange.start) / duration) * 100))}%`
      clip.style.width = `${Math.max(.4, Math.min(100, (seconds(item.timelineRange.duration) / duration) * 100))}%`
      lane.append(clip)
    }
    return lane
  })
  elements["mini-tracks"].replaceChildren(...lanes)
  elements["mini-timeline"].dataset.duration = formatClock(compositionDuration())
  elements["mini-timeline"].setAttribute("aria-valuemax", String(compositionDuration()))
}

function renderPlayhead() {
  const value = Math.max(0, seconds(playhead))
  const duration = compositionDuration()
  const editorMode = document.documentElement.classList.contains("is-editor-mode")
  elements.playhead.style.setProperty("--playhead-x", `${value * pixelsPerSecond}px`)
  elements["mini-timeline"].style.setProperty(
    "--mini-playhead-x",
    `${duration > 0 ? Math.max(0, Math.min(100, (value / duration) * 100)) : 0}%`,
  )
  elements.timecode.value = editorMode
    ? formatTimecode(value, state.composition.settings.editRate)
    : formatClock(value)
  elements.duration.value = editorMode
    ? `/ ${formatTimecode(duration, state.composition.settings.editRate)}`
    : `/ ${formatClock(duration)}`
  elements.ruler.setAttribute("aria-valuenow", String(value))
  elements["mini-timeline"].setAttribute("aria-valuenow", String(value))
}

function formatTimecode(value, rate) {
  const fps = Math.max(1, Math.round(rate.numerator / rate.denominator))
  const totalFrames = Math.max(0, Math.round(value * fps))
  const frames = totalFrames % fps
  const totalSeconds = Math.floor(totalFrames / fps)
  const secondsPart = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  return [hours, minutes, secondsPart, frames].map((part) => String(part).padStart(2, "0")).join(":")
}

function formatClock(value) {
  const centiseconds = Math.max(0, Math.round(value * 100))
  const fraction = centiseconds % 100
  const totalSeconds = Math.floor(centiseconds / 100)
  const secondsPart = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  const clock = `${String(minutes).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}.${String(fraction).padStart(2, "0")}`
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${clock}` : clock
}

function openConnectedMedia(nodeId) {
  const opened = connectedMediaOpenQueue.then(() => host.request("canvas.connectedMedia.open", { nodeId }))
  connectedMediaOpenQueue = opened.catch(() => undefined)
  return opened
}

function acceptDetectedDuration(nodeId, durationMs) {
  const detected = applyDetectedSourceDuration(state, nodeId, durationMs)
  if (!detected.changed) return false
  state = detected.state
  diagnostics = diagnostics.filter((entry) => !["duration-probe-failed", "estimated-duration"].includes(entry.code))
  const remaining = Object.values(state.sourceBindingsByNodeId).filter(
    (binding) => binding.status === "online" && binding.durationEstimated,
  ).length
  if (remaining > 0) {
    addDiagnostic(
      "estimated-duration",
      `Resolving the duration of ${remaining} connected media ${remaining === 1 ? "source" : "sources"}…`,
    )
  }
  saver.mark(state)
  render()
  return true
}

function requestDurationResolution() {
  const generation = ++durationProbeGeneration
  const nodeIds = Object.values(state.sourceBindingsByNodeId)
    .filter((binding) => binding.status === "online" && binding.durationEstimated)
    .map((binding) => binding.nodeId)
  if (nodeIds.length === 0) return
  void resolveEstimatedDurations(nodeIds, generation)
}

async function resolveEstimatedDurations(nodeIds, generation) {
  for (const nodeId of nodeIds) {
    if (generation !== durationProbeGeneration || !state.sourceBindingsByNodeId[nodeId]?.durationEstimated) continue
    let opened
    let media
    try {
      opened = await openConnectedMedia(nodeId)
      if (generation !== durationProbeGeneration) continue
      const probed = opened.probe?.duration
      if (probed && !probed.estimated && Number.isFinite(probed.milliseconds) && probed.milliseconds > 0) {
        acceptDetectedDuration(nodeId, probed.milliseconds)
        continue
      }
      const binding = state.sourceBindingsByNodeId[nodeId]
      media = document.createElement(binding.kind === "video" ? "video" : "audio")
      media.preload = "metadata"
      media.src = opened.url
      const durationMs = await mediaMetadataDuration(media)
      if (generation === durationProbeGeneration) acceptDetectedDuration(nodeId, durationMs)
    } catch (error) {
      if (generation === durationProbeGeneration) {
        addDiagnostic("duration-probe-failed", `Media duration could not be resolved yet: ${message(error)}`)
        render()
      }
    } finally {
      if (media) {
        media.removeAttribute("src")
        media.load()
      }
      if (opened?.sessionId) {
        await host.request("canvas.connectedMedia.close", { sessionId: opened.sessionId }).catch(() => undefined)
      }
    }
  }
}

function mediaMetadataDuration(media) {
  if (Number.isFinite(media.duration) && media.duration > 0) return Promise.resolve(media.duration * 1000)
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("Timed out while loading media metadata.")), 15_000)
    const finish = (error) => {
      window.clearTimeout(timeout)
      media.removeEventListener("loadedmetadata", onLoaded)
      media.removeEventListener("error", onError)
      if (error) reject(error)
      else resolve(media.duration * 1000)
    }
    const onLoaded = () => {
      if (!Number.isFinite(media.duration) || media.duration <= 0) {
        finish(new Error("The media did not expose a finite duration."))
        return
      }
      finish()
    }
    const onError = () => finish(new Error(media.error?.message || "The media metadata could not be loaded."))
    media.addEventListener("loadedmetadata", onLoaded)
    media.addEventListener("error", onError)
    media.load()
  })
}

elements.tracks.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")
  if (action) {
    const trackId = action.dataset.trackId
    const track = state.composition.tracksById[trackId]
    try {
      if (action.dataset.action === "track-up") commit(reorderTrack(state, trackId, -1))
      if (action.dataset.action === "track-down") commit(reorderTrack(state, trackId, 1))
      if (action.dataset.action === "track-lock") commit(updateTrack(state, trackId, { locked: !track.locked }))
      if (action.dataset.action === "track-mute") commit(updateTrack(state, trackId, { muted: !track.muted }))
    } catch (error) { addDiagnostic("edit-error", message(error), "error"); render() }
    return
  }
  const clip = event.target.closest(".clip")
  if (!clip) return
  selectedItemId = clip.dataset.itemId
  const item = selectedItem()
  if (
    item &&
    (compareTime(playhead, item.timelineRange.start) < 0 || compareTime(playhead, timeEnd(item.timelineRange)) >= 0)
  ) {
    playhead = structuredClone(item.timelineRange.start)
  }
  render()
  requestPreviewRefresh()
})

elements.tracks.addEventListener("pointerdown", (event) => {
  const clip = event.target.closest(".clip")
  if (!clip || readOnly) return
  const item = state.composition.itemsById[clip.dataset.itemId]
  const track = state.composition.tracksById[item.trackId]
  if (track.locked) return
  selectedItemId = item.id
  const mode = event.target.dataset.trim === "left" ? "trim-left" : event.target.dataset.trim === "right" ? "trim-right" : "move"
  gesture = { base: state, itemId: item.id, mode, pointerId: event.pointerId, startX: event.clientX, originalStart: item.timelineRange.start, originalEnd: timeEnd(item.timelineRange) }
  elements["timeline-scroll"].setPointerCapture(event.pointerId)
  event.preventDefault()
})

elements["timeline-scroll"].addEventListener("pointermove", (event) => {
  if (panGesture?.pointerId === event.pointerId) {
    elements["timeline-scroll"].scrollLeft = panGesture.scrollLeft - (event.clientX - panGesture.startX)
    elements["timeline-scroll"].scrollTop = panGesture.scrollTop - (event.clientY - panGesture.startY)
    return
  }
  if (rulerGesture?.pointerId === event.pointerId) {
    updatePlayheadFromPointer(event)
    return
  }
  if (!gesture || gesture.pointerId !== event.pointerId) return
  const delta = (event.clientX - gesture.startX) / pixelsPerSecond
  try {
    const next = gesture.mode === "move"
      ? moveClip(gesture.base, gesture.itemId, timeFromSeconds(Math.max(0, seconds(gesture.originalStart) + delta), state.composition.settings.editRate))
      : gesture.mode === "trim-left"
        ? trimClipLeft(gesture.base, gesture.itemId, timeFromSeconds(Math.max(0, seconds(gesture.originalStart) + delta), state.composition.settings.editRate))
        : trimClipRight(gesture.base, gesture.itemId, timeFromSeconds(Math.max(0, seconds(gesture.originalEnd) + delta), state.composition.settings.editRate))
    commit(next, { local: true })
  } catch {}
})

function finishPointerGesture(event) {
  const scroll = elements["timeline-scroll"]
  if (panGesture?.pointerId === event.pointerId) {
    panGesture = null
    scroll.dataset.panning = "false"
  }
  if (rulerGesture?.pointerId === event.pointerId) rulerGesture = null
  if (gesture?.pointerId === event.pointerId) {
    gesture = null
    saver.mark(state)
  }
  if (scroll.hasPointerCapture(event.pointerId)) scroll.releasePointerCapture(event.pointerId)
}

elements["timeline-scroll"].addEventListener("pointerup", finishPointerGesture)
elements["timeline-scroll"].addEventListener("pointercancel", finishPointerGesture)

elements["timeline-scroll"].addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest(".clip, .ruler, .track-title, button, input, select")) return
  const scroll = elements["timeline-scroll"]
  panGesture = {
    pointerId: event.pointerId,
    scrollLeft: scroll.scrollLeft,
    scrollTop: scroll.scrollTop,
    startX: event.clientX,
    startY: event.clientY,
  }
  scroll.dataset.panning = "true"
  scroll.setPointerCapture(event.pointerId)
  event.preventDefault()
})

elements["timeline-scroll"].addEventListener("wheel", (event) => {
  if (event.ctrlKey || event.metaKey) {
    const factor = Math.exp(-event.deltaY * .0025)
    setTimelineZoom(pixelsPerSecond * factor, { clientX: event.clientX })
    event.preventDefault()
    event.stopPropagation()
    return
  }
  const scroll = elements["timeline-scroll"]
  const pan = resolveWheelPan({
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    horizontalOverflow: scroll.scrollWidth > scroll.clientWidth + 1,
    shiftKey: event.shiftKey,
    verticalOverflow: scroll.scrollHeight > scroll.clientHeight + 1,
  })
  if (!pan.handled) return
  scroll.scrollLeft += pan.left
  scroll.scrollTop += pan.top
  event.preventDefault()
  event.stopPropagation()
}, { passive: false })

elements.ruler.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return
  rulerGesture = { pointerId: event.pointerId }
  elements["timeline-scroll"].setPointerCapture(event.pointerId)
  updatePlayheadFromPointer(event)
  event.preventDefault()
})

function updatePlayheadFromPointer(event) {
  const rect = elements.ruler.getBoundingClientRect()
  playhead = timeFromSeconds(Math.max(0, Math.min(timelineDuration(), (event.clientX - rect.left) / pixelsPerSecond)), state.composition.settings.editRate)
  renderPlayhead()
  requestPreviewRefresh()
}

elements.ruler.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
  const frame = state.composition.settings.editRate.denominator / state.composition.settings.editRate.numerator
  playhead = timeFromSeconds(Math.max(0, seconds(playhead) + (event.key === "ArrowLeft" ? -frame : frame)), state.composition.settings.editRate)
  renderPlayhead()
  requestPreviewRefresh()
  event.preventDefault()
})

function updatePlayheadFromMiniPointer(event) {
  const rect = elements["mini-timeline"].getBoundingClientRect()
  const duration = compositionDuration()
  const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0
  playhead = timeFromSeconds(duration * ratio, state.composition.settings.editRate)
  renderPlayhead()
  requestPreviewRefresh()
}

elements["mini-timeline"].addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !state) return
  pause()
  miniScrubPointerId = event.pointerId
  elements["mini-timeline"].setPointerCapture(event.pointerId)
  updatePlayheadFromMiniPointer(event)
  event.preventDefault()
})

elements["mini-timeline"].addEventListener("pointermove", (event) => {
  if (miniScrubPointerId !== event.pointerId) return
  updatePlayheadFromMiniPointer(event)
})

function finishMiniScrub(event) {
  if (miniScrubPointerId !== event.pointerId) return
  miniScrubPointerId = null
  if (elements["mini-timeline"].hasPointerCapture(event.pointerId)) {
    elements["mini-timeline"].releasePointerCapture(event.pointerId)
  }
}

elements["mini-timeline"].addEventListener("pointerup", finishMiniScrub)
elements["mini-timeline"].addEventListener("pointercancel", finishMiniScrub)
elements["mini-timeline"].addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
  pause()
  const frame = state.composition.settings.editRate.denominator / state.composition.settings.editRate.numerator
  playhead = timeFromSeconds(
    Math.max(0, Math.min(compositionDuration(), seconds(playhead) + (event.key === "ArrowLeft" ? -frame : frame))),
    state.composition.settings.editRate,
  )
  renderPlayhead()
  requestPreviewRefresh()
  event.preventDefault()
})

elements["duplicate-clip"].addEventListener("click", () => runEdit(() => {
  const result = duplicateClip(state, selectedItemId)
  selectedItemId = result.createdItemId
  return result.state
}))
elements["split-clip"].addEventListener("click", () => runEdit(() => {
  const result = splitClip(state, selectedItemId, playhead)
  selectedItemId = result.createdItemId
  return result.state
}))
elements["remove-clip"].addEventListener("click", () => runEdit(() => {
  const next = removeClip(state, selectedItemId)
  selectedItemId = null
  return next
}))
elements["clip-fit"].addEventListener("change", () => runEdit(() => updateClipPresentation(state, selectedItemId, { fit: elements["clip-fit"].value })))
elements["clip-opacity"].addEventListener("change", () => runEdit(() => updateClipPresentation(state, selectedItemId, { opacity: Number(elements["clip-opacity"].value) })))
elements["clip-gain"].addEventListener("change", () => runEdit(() => updateClipPresentation(state, selectedItemId, { gain: Number(elements["clip-gain"].value) })))

function runEdit(operation) {
  try { commit(operation()) } catch (error) { addDiagnostic("edit-error", message(error), "error"); render() }
}

elements.zoom.addEventListener("input", () => setTimelineZoom(Number(elements.zoom.value)))
elements["zoom-out"].addEventListener("click", () => setTimelineZoom(pixelsPerSecond - ZOOM_STEP))
elements["zoom-in"].addEventListener("click", () => setTimelineZoom(pixelsPerSecond + ZOOM_STEP))
elements["zoom-fit"].addEventListener("click", fitTimeline)

elements["timeline-scroll"].addEventListener("keydown", (event) => {
  if (event.target.closest("input, select, button")) return
  if (event.key === "+" || event.key === "=") setTimelineZoom(pixelsPerSecond + ZOOM_STEP)
  else if (event.key === "-") setTimelineZoom(pixelsPerSecond - ZOOM_STEP)
  else if (event.key === "0") fitTimeline()
  else return
  event.preventDefault()
})

elements["edit-timeline"].addEventListener("click", async () => {
  try {
    await document.documentElement.requestFullscreen()
  } catch (error) { addDiagnostic("fullscreen-error", message(error), "error"); render() }
})

elements.fullscreen.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
  } catch (error) { addDiagnostic("fullscreen-error", message(error), "error"); render() }
})

function updateSurfaceMode() {
  const editorMode = Boolean(document.fullscreenElement)
  document.documentElement.classList.toggle("is-editor-mode", editorMode)
  elements.fullscreen.textContent = "Close"
  elements.fullscreen.ariaLabel = "Close Timeline editor"
  window.requestAnimationFrame(() => {
    if (editorMode) fitTimeline()
    render()
  })
}

document.addEventListener("fullscreenchange", updateSurfaceMode)
updateSurfaceMode()

elements["import-otio"].addEventListener("click", () => {
  if (readOnly) return
  if (Object.keys(state.composition.itemsById).length > 0 && !window.confirm("Replace this Timeline with an imported OTIO document?")) return
  elements["otio-file"].click()
})

elements["otio-file"].addEventListener("change", async () => {
  const [file] = elements["otio-file"].files
  elements["otio-file"].value = ""
  if (!file) return
  try {
    const imported = importOtio(JSON.parse(await file.text()))
    await closeMediaSession()
    state = imported.state
    selectedItemId = null
    diagnostics = diagnostics.filter((entry) => entry.code !== "otio-import")
    imported.diagnostics.forEach((entry) => addDiagnostic("otio-import", entry.message))
    saver.mark(state)
    await reconcileInputs()
    render()
  } catch (error) {
    addDiagnostic("otio-import", `OTIO import failed: ${message(error)}`, "error")
    render()
  }
})

function exportComposition() {
  try {
    const blob = new Blob([`${JSON.stringify(exportOtio(state), null, 2)}\n`], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${state.composition.name.replaceAll(/[^a-z0-9._-]+/gi, "-").replaceAll(/^-|-$/g, "") || "timeline"}.otio.json`
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    addDiagnostic("otio-export", `OTIO export failed: ${message(error)}`, "error")
    render()
  }
}

elements["export-otio"].addEventListener("click", exportComposition)
elements["card-export-otio"].addEventListener("click", exportComposition)

elements.play.addEventListener("click", () => void (playing ? pause() : play()))

async function play() {
  if (playbackItemsAt(playhead).length === 0) {
    const firstStart = firstPlayableTimelineStart(state)
    if (firstStart) playhead = firstStart
  }
  if (playbackItemsAt(playhead).length === 0) {
    addDiagnostic("playback-offline", "Connect an online video or audio card before playback.", "error")
    render()
    return
  }
  try {
    await closeMediaSession()
    playing = true
    playbackGeneration += 1
    await refreshPlaybackMedia(playbackGeneration, true)
    if (mediaSessions.length === 0) throw new Error("No enabled online Clip is active at the playhead.")
    lastFrameAt = performance.now()
    elements.play.textContent = "❚❚"
    tick(lastFrameAt)
  } catch (error) {
    await closeMediaSession()
    addDiagnostic("playback-failed", `Preview session failed: ${message(error)}`, "error")
    render()
  }
}

function pause() {
  playing = false
  for (const { media } of mediaSessions) media.pause()
  if (animationFrame !== null) cancelAnimationFrame(animationFrame)
  animationFrame = null
  elements.play.textContent = "▶"
}

function tick(now) {
  if (!playing) return
  const delta = Math.max(0, Math.min(.25, (now - lastFrameAt) / 1000))
  lastFrameAt = now
  playhead = timeFromSeconds(seconds(playhead) + delta, state.composition.settings.editRate)
  const end = playbackEnd()
  if (compareTime(playhead, end) >= 0) {
    playhead = end
    renderPlayhead()
    pause()
    return
  }
  requestPreviewRefresh()
  syncActiveMedia(false)
  renderPlayhead()
  if (playing) animationFrame = requestAnimationFrame(tick)
}

function seekActiveMedia() {
  syncActiveMedia(true)
}

async function closeMediaSession() {
  previewRefreshQueued = false
  playbackGeneration += 1
  pause()
  const sessions = mediaSessions
  mediaSessions = []
  await disposeMediaSessions(sessions)
  renderPlaybackMonitor()
}

async function disposeMediaSessions(sessions) {
  for (const { media } of sessions) {
    media.pause()
    media.removeAttribute("src")
    media.load()
    media.remove()
  }
  await Promise.all(sessions.map((session) => host.request("canvas.connectedMedia.close", { sessionId: session.id }).catch(() => undefined)))
}

function playbackItemsAt(at) {
  return activePlaybackItems(state, at)
}

function playbackEnd() {
  return playbackTimelineEnd(state, playhead)
}

function requestPreviewRefresh() {
  if (!state) return
  previewRefreshQueued = true
  if (playbackRefresh) return
  const generation = playbackGeneration
  const refresh = (async () => {
    while (previewRefreshQueued && generation === playbackGeneration) {
      previewRefreshQueued = false
      await refreshPlaybackMedia(generation, playing)
    }
  })()
    .catch(async (error) => {
      if (generation !== playbackGeneration) return
      addDiagnostic("playback-failed", `Preview session failed: ${message(error)}`, "error")
      await closeMediaSession()
      render()
    })
    .finally(() => {
      if (playbackRefresh === refresh) playbackRefresh = null
    })
  playbackRefresh = refresh
}

async function refreshPlaybackMedia(generation, autoplay = false) {
  if (generation !== playbackGeneration) return
  const activeItems = playbackItemsAt(playhead)
  if (activeItems.length > 16) throw new Error("Preview supports at most 16 simultaneous Timeline Clips.")
  const activeIds = new Set(activeItems.map((item) => item.id))
  const staleSessions = mediaSessions.filter((session) => !activeIds.has(session.itemId))
  mediaSessions = mediaSessions.filter((session) => activeIds.has(session.itemId))
  await disposeMediaSessions(staleSessions)
  if (generation !== playbackGeneration) return

  const openIds = new Set(mediaSessions.map((session) => session.itemId))
  const openedSessions = []
  for (const activeItem of activeItems) {
    if (openIds.has(activeItem.id)) continue
    const opened = await openConnectedMedia(activeItem.sourceRef.nodeId)
    if (generation !== playbackGeneration || !playbackItemsAt(playhead).some((item) => item.id === activeItem.id)) {
      await host.request("canvas.connectedMedia.close", { sessionId: opened.sessionId }).catch(() => undefined)
      continue
    }
    const track = state.composition.tracksById[activeItem.trackId]
    const media = document.createElement(track.kind === "video" ? "video" : "audio")
    media.className = `preview-media preview-${track.kind}`
    media.preload = "metadata"
    media.playsInline = true
    media.src = opened.url
    media.hidden = track.kind === "audio"
    media.volume = track.muted || !track.enabled ? 0 : Math.min(1, activeItem.gain)
    media.style.objectFit = activeItem.fit
    media.style.opacity = String(activeItem.opacity)
    media.style.zIndex = String(state.composition.trackOrder.indexOf(activeItem.trackId) + 1)
    elements.monitor.insertBefore(media, elements["monitor-empty"])
    const session = { id: opened.sessionId, itemId: activeItem.id, media }
    mediaSessions.push(session)
    openedSessions.push(session)
    const acceptDuration = (milliseconds) => {
      if (!mediaSessions.some((candidate) => candidate.id === session.id && candidate.media === media)) return
      acceptDetectedDuration(activeItem.sourceRef.nodeId, milliseconds)
    }
    const probedDuration = opened.probe?.duration
    if (
      probedDuration &&
      !probedDuration.estimated &&
      Number.isFinite(probedDuration.milliseconds) &&
      probedDuration.milliseconds > 0
    ) {
      acceptDuration(probedDuration.milliseconds)
    } else {
      media.addEventListener("loadedmetadata", () => {
        if (Number.isFinite(media.duration) && media.duration > 0) acceptDuration(media.duration * 1000)
      }, { once: true })
    }
  }
  seekActiveMedia()
  renderPlaybackMonitor()
  if (autoplay && playing) await Promise.all(openedSessions.map(({ media }) => media.play()))
  else for (const { media } of mediaSessions) media.pause()
}

function renderPlaybackMonitor() {
  elements["monitor-empty"].hidden = mediaSessions.length > 0
  elements["monitor-badge"].textContent = mediaSessions.length > 0 ? "COMPOSITION LIVE" : "COMPOSITION"
}

function syncActiveMedia(force) {
  for (const session of mediaSessions) {
    const item = state.composition.itemsById[session.itemId]
    if (!item) continue
    const track = state.composition.tracksById[item.trackId]
    if (!track) continue
    session.media.volume = track.muted || !track.enabled ? 0 : Math.min(1, item.gain)
    session.media.style.objectFit = item.fit
    session.media.style.opacity = String(item.opacity)
    session.media.style.zIndex = String(state.composition.trackOrder.indexOf(item.trackId) + 1)
    const mapped = playbackSourceTime(item, playhead)
    if (!mapped) continue
    const expected = seconds(mapped)
    if (force || !Number.isFinite(session.media.currentTime) || Math.abs(session.media.currentTime - expected) > .15) {
      session.media.currentTime = expected
    }
  }
}

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
  if (event.code === "Space") { event.preventDefault(); void (playing ? pause() : play()) }
  if ((event.key === "Delete" || event.key === "Backspace") && selectedItemId) { event.preventDefault(); elements["remove-clip"].click() }
  if (event.key.toLowerCase() === "s" && selectedItemId) { event.preventDefault(); elements["split-clip"].click() }
  if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && selectedItemId && !readOnly) {
    const item = selectedItem()
    const frame = state.composition.settings.editRate.denominator / state.composition.settings.editRate.numerator
    runEdit(() => moveClip(state, item.id, timeFromSeconds(Math.max(0, seconds(item.timelineRange.start) + (event.key === "ArrowLeft" ? -frame : frame)), state.composition.settings.editRate)))
  }
})

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    void saver.flush()
    void closeMediaSession()
  }
})
window.addEventListener("pagehide", () => {
  void saver.flush()
  void closeMediaSession()
})
window.addEventListener("beforeunload", () => {
  void saver.flush()
  void closeMediaSession()
})
