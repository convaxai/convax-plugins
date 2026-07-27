import { describe, expect, mock, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  duplicateClip,
  moveClip,
  playbackSourceTime,
  removeClip,
  splitClip,
  trimClipLeft,
  trimClipRight,
} from "../package/assets/edit.js"
import { TimelineSaveController } from "../package/assets/host.js"
import {
  MAX_STATE_BYTES,
  addTime,
  compareTime,
  createEmptyState,
  normalizeTime,
  openState,
  prepareStateSave,
  seconds,
  time,
  timeEnd,
  timeFromSeconds,
  validateState,
} from "../package/assets/model.js"
import { exportOtio, importOtio } from "../package/assets/otio.js"
import { activePlaybackItems, firstPlayableTimelineStart, playbackTimelineEnd } from "../package/assets/playback.js"
import {
  applyDetectedSourceDuration,
  ConnectedInputReconciler,
  reconcileConnectedInputs,
} from "../package/assets/reconcile.js"
import {
  anchoredScrollLeft,
  clampPixelsPerSecond,
  fitPixelsPerSecond,
  resolveWheelPan,
} from "../package/assets/viewport.js"

const ids = (() => {
  let value = 0
  return (prefix) => `${prefix}-${++value}`
})()

function connectedState(inputs = [{ id: "video-one", kind: "video", label: "One", durationMs: 10000 }]) {
  return reconcileConnectedInputs(createEmptyState({ compositionId: "composition-test" }), inputs, { createId: ids }).state
}

describe("Composition runtime", () => {
  test("normalizes rational time and keeps half-open arithmetic exact", () => {
    expect(normalizeTime({ value: "60", scale: 30 })).toEqual({ value: "2", scale: 1 })
    expect(addTime({ value: "1", scale: 24 }, { value: "1", scale: 30 })).toEqual({ value: "3", scale: 40 })
    expect(addTime({ value: "1", scale: Number.MAX_SAFE_INTEGER }, { value: "1", scale: Number.MAX_SAFE_INTEGER })).toEqual({
      value: "2",
      scale: Number.MAX_SAFE_INTEGER,
    })
    expect(compareTime(timeEnd({ start: time(), duration: { value: "1", scale: 30 } }), { value: "1", scale: 30 })).toBe(0)
  })

  test("opens unknown future versions read-only and preserves damaged raw state", () => {
    const future = { schema: "convax.video-timeline", schemaVersion: 7, opaque: { keep: true } }
    expect(openState(future)).toEqual({ kind: "future", raw: future, version: 7 })
    const damaged = { schema: "convax.video-timeline", schemaVersion: 1, composition: null }
    expect(openState(damaged)).toMatchObject({ kind: "invalid", raw: damaged })
  })

  test("refuses a state above the 240 KiB envelope without changing the snapshot", () => {
    const state = reconcileConnectedInputs(
      createEmptyState({ compositionId: "composition-large" }),
      Array.from({ length: 700 }, (_, index) => ({
        durationMs: 10_000,
        id: `video-${index}`,
        kind: "video",
        label: `Source ${index} ${"x".repeat(180)}`,
      })),
      { createId: ids },
    ).state
    const before = structuredClone(state)
    const result = prepareStateSave(state)
    expect(result.ok).toBeFalse()
    expect(result.bytes).toBeGreaterThan(MAX_STATE_BYTES)
    expect(state).toEqual(before)
  })

  test("rejects paths, preview URLs, tokens and overlapping Clips in persistent state", () => {
    const state = connectedState()
    state.sourceBindingsByNodeId["video-one"].path = "/private/project.mov"
    expect(() => validateState(state)).toThrow("must not persist path")
    delete state.sourceBindingsByNodeId["video-one"].path
    const original = Object.values(state.composition.itemsById)[0]
    const duplicate = structuredClone(original)
    duplicate.id = "overlap"
    state.composition.itemsById[duplicate.id] = duplicate
    expect(() => validateState(state)).toThrow("overlap")
  })
})

describe("Timeline viewport", () => {
  test("keeps the same Timeline time under the zoom anchor", () => {
    expect(anchoredScrollLeft({
      anchorX: 500,
      headerWidth: 200,
      newPixelsPerSecond: 200,
      oldPixelsPerSecond: 100,
      scrollLeft: 300,
    })).toBe(900)
    expect(clampPixelsPerSecond(10)).toBe(40)
    expect(clampPixelsPerSecond(1000)).toBe(480)
    expect(fitPixelsPerSecond({ duration: 8, headerWidth: 200, viewportWidth: 1000 })).toBe(100)
  })

  test("maps trackpad and mouse-wheel input without stealing vertical track scrolling", () => {
    expect(resolveWheelPan({
      deltaX: 45,
      deltaY: 4,
      horizontalOverflow: true,
      shiftKey: false,
      verticalOverflow: true,
    })).toEqual({ handled: true, left: 45, top: 0 })
    expect(resolveWheelPan({
      deltaX: 0,
      deltaY: 80,
      horizontalOverflow: true,
      shiftKey: false,
      verticalOverflow: false,
    })).toEqual({ handled: true, left: 80, top: 0 })
    expect(resolveWheelPan({
      deltaX: 0,
      deltaY: 80,
      horizontalOverflow: true,
      shiftKey: false,
      verticalOverflow: true,
    })).toEqual({ handled: false, left: 0, top: 0 })
  })
})

describe("connected input reconciliation", () => {
  test("materializes one track per unique video/audio node and ignores duplicate events", () => {
    const first = reconcileConnectedInputs(createEmptyState({ compositionId: "composition-reconcile" }), [
      { id: "video-a", kind: "video", label: "A", durationMs: 5000 },
      { id: "video-a", kind: "video", label: "A duplicate", durationMs: 5000 },
      { id: "audio-a", kind: "audio", label: "Music", durationMs: 6000 },
      { id: "text-a", kind: "text", label: "Notes" },
    ], { createId: ids })
    expect(first.state.composition.trackOrder).toHaveLength(2)
    expect(Object.values(first.state.composition.tracksById).map((track) => track.kind)).toEqual(["video", "audio"])
    expect(first.diagnostics).toEqual([expect.objectContaining({ code: "unsupported-input", nodeId: "text-a" })])
    const repeated = reconcileConnectedInputs(first.state, [
      { id: "video-a", kind: "video", label: "A", durationMs: 5000 },
      { id: "audio-a", kind: "audio", label: "Music", durationMs: 6000 },
    ], { createId: ids })
    expect(repeated.state.composition.trackOrder).toEqual(first.state.composition.trackOrder)
    expect(Object.keys(repeated.state.composition.itemsById)).toEqual(Object.keys(first.state.composition.itemsById))
  })

  test("disconnects offline, reconnects by node id, and preserves edits on replacement", () => {
    const initial = connectedState()
    const item = Object.values(initial.composition.itemsById)[0]
    const moved = moveClip(initial, item.id, timeFromSeconds(2, initial.composition.settings.editRate))
    const disconnected = reconcileConnectedInputs(moved, []).state
    expect(disconnected.sourceBindingsByNodeId["video-one"].status).toBe("offline")
    expect(disconnected.composition.itemsById[item.id].timelineRange).toEqual(moved.composition.itemsById[item.id].timelineRange)
    const reconnected = reconcileConnectedInputs(disconnected, [{ id: "video-one", kind: "video", label: "Replacement", durationMs: 1000 }]).state
    expect(reconnected.sourceBindingsByNodeId["video-one"]).toMatchObject({ label: "Replacement", status: "online" })
    expect(reconnected.composition.itemsById[item.id].timelineRange).toEqual(moved.composition.itemsById[item.id].timelineRange)
  })

  test("replaces the one-second placeholder with detected media duration and keeps it across edge refreshes", () => {
    const initial = reconcileConnectedInputs(
      createEmptyState({ compositionId: "composition-duration" }),
      [{ id: "video-metadata", kind: "video", label: "Metadata pending" }],
      { createId: ids },
    ).state
    const initialItem = Object.values(initial.composition.itemsById)[0]
    expect(initial.sourceBindingsByNodeId["video-metadata"].durationEstimated).toBeTrue()
    expect(seconds(initialItem.timelineRange.duration)).toBe(1)

    const detected = applyDetectedSourceDuration(initial, "video-metadata", 8_400)
    expect(detected.changed).toBeTrue()
    expect(detected.state.sourceBindingsByNodeId["video-metadata"].durationEstimated).toBeFalse()
    expect(seconds(detected.state.sourceBindingsByNodeId["video-metadata"].duration)).toBe(8.4)
    expect(seconds(detected.state.composition.itemsById[initialItem.id].timelineRange.duration)).toBe(8.4)

    const refreshed = reconcileConnectedInputs(
      detected.state,
      [{ id: "video-metadata", kind: "video", label: "Metadata pending" }],
      { createId: ids },
    ).state
    expect(seconds(refreshed.sourceBindingsByNodeId["video-metadata"].duration)).toBe(8.4)
    expect(refreshed.sourceBindingsByNodeId["video-metadata"].durationEstimated).toBeFalse()
  })

  test("drops stale asynchronous list responses", async () => {
    const reconciler = new ConnectedInputReconciler()
    const state = createEmptyState({ compositionId: "composition-stale" })
    let release
    const first = reconciler.refresh(() => new Promise((resolve) => { release = resolve }), state, { createId: ids })
    const second = await reconciler.refresh(async () => ({ inputs: [{ id: "new", kind: "video", durationMs: 1000 }] }), state, { createId: ids })
    release({ inputs: [{ id: "old", kind: "video", durationMs: 1000 }] })
    expect(await first).toMatchObject({ stale: true })
    expect(second.state.sourceBindingsByNodeId.new).toBeDefined()
    expect(second.state.sourceBindingsByNodeId.old).toBeUndefined()
  })
})

describe("Timeline edits and playback", () => {
  test("moves, trims, splits, duplicates and removes without mutating Canvas bindings", () => {
    let state = connectedState()
    const item = Object.values(state.composition.itemsById)[0]
    state = moveClip(state, item.id, timeFromSeconds(1, state.composition.settings.editRate))
    state = trimClipLeft(state, item.id, timeFromSeconds(2, state.composition.settings.editRate))
    state = trimClipRight(state, item.id, timeFromSeconds(7, state.composition.settings.editRate))
    const split = splitClip(state, item.id, timeFromSeconds(4, state.composition.settings.editRate), { createId: () => "clip-split" })
    expect(Object.keys(split.state.sourceBindingsByNodeId)).toEqual(["video-one"])
    expect(seconds(split.state.composition.itemsById[item.id].timelineRange.duration)).toBe(2)
    expect(seconds(split.state.composition.itemsById["clip-split"].sourceRange.start)).toBe(3)
    const duplicated = duplicateClip(split.state, "clip-split", { createId: () => "clip-copy" })
    expect(duplicated.state.composition.itemsById["clip-copy"].sourceRef.nodeId).toBe("video-one")
    const removed = removeClip(duplicated.state, item.id)
    expect(removed.sourceBindingsByNodeId["video-one"]).toBeDefined()
    expect(() => validateState(removed)).not.toThrow()
  })

  test("maps Timeline playhead to source time without persisting media currentTime", () => {
    const state = connectedState()
    const item = Object.values(state.composition.itemsById)[0]
    item.sourceRange.start = timeFromSeconds(3, state.composition.settings.editRate)
    item.timelineRange.start = timeFromSeconds(5, state.composition.settings.editRate)
    item.playbackRate = { numerator: 2, denominator: 1 }
    expect(seconds(playbackSourceTime(item, timeFromSeconds(7, state.composition.settings.editRate)))).toBe(7)
    expect(playbackSourceTime(item, timeFromSeconds(4, state.composition.settings.editRate))).toBeNull()
  })

  test("selects stable simultaneous video/audio layers and advances through their longest enabled range", () => {
    const state = connectedState([
      { id: "video-bottom", kind: "video", label: "Bottom", durationMs: 5000 },
      { id: "video-top", kind: "video", label: "Top", durationMs: 3000 },
      { id: "audio-mix", kind: "audio", label: "Mix", durationMs: 7000 },
    ])
    const atOneSecond = timeFromSeconds(1, state.composition.settings.editRate)
    expect(activePlaybackItems(state, atOneSecond).map((item) => item.sourceRef.nodeId)).toEqual([
      "video-bottom",
      "video-top",
      "audio-mix",
    ])
    expect(seconds(playbackTimelineEnd(state, atOneSecond))).toBe(7)

    const audioTrack = Object.values(state.composition.tracksById).find((track) => track.kind === "audio")
    audioTrack.muted = true
    expect(activePlaybackItems(state, timeFromSeconds(6, state.composition.settings.editRate))).toEqual([])
    expect(seconds(playbackTimelineEnd(state, time()))).toBe(5)
  })

  test("starts card playback from the first enabled online Clip without requiring editor selection", () => {
    const state = connectedState([
      { id: "video-late", kind: "video", label: "Late", durationMs: 5000 },
      { id: "audio-first", kind: "audio", label: "First", durationMs: 3000 },
    ])
    const videoItem = Object.values(state.composition.itemsById).find((item) => item.sourceRef.nodeId === "video-late")
    const audioItem = Object.values(state.composition.itemsById).find((item) => item.sourceRef.nodeId === "audio-first")
    videoItem.timelineRange.start = timeFromSeconds(4, state.composition.settings.editRate)
    audioItem.timelineRange.start = timeFromSeconds(2, state.composition.settings.editRate)
    expect(seconds(firstPlayableTimelineStart(state))).toBe(2)
    state.composition.tracksById[audioItem.trackId].muted = true
    expect(seconds(firstPlayableTimelineStart(state))).toBe(4)
  })
})

describe("OTIO subset", () => {
  test("covers empty and multitrack video/audio golden projections deterministically", async () => {
    const empty = JSON.parse(await readFile(path.join(import.meta.dir, "fixtures/empty.otio.json"), "utf8"))
    const emptyImported = importOtio(empty, { createId: ids })
    expect(emptyImported.state.composition.trackOrder).toEqual([])
    expect(exportOtio(emptyImported.state).tracks.children).toEqual([])

    const fixture = JSON.parse(await readFile(path.join(import.meta.dir, "fixtures/multitrack.otio.json"), "utf8"))
    const imported = importOtio(fixture, { createId: ids })
    expect(imported.state.composition.trackOrder.map((trackId) => imported.state.composition.tracksById[trackId].kind)).toEqual([
      "video",
      "video",
      "audio",
    ])
    expect(Object.keys(imported.state.composition.itemsById)).toHaveLength(3)
    expect(imported.diagnostics).toHaveLength(3)
    const projected = exportOtio(imported.state)
    expect(JSON.stringify(projected)).not.toContain("file:///")
    expect(projected.tracks.children.map((track) => track.children.map((child) => child.OTIO_SCHEMA))).toEqual([
      ["Clip.2"],
      ["Gap.1", "Clip.2"],
      ["Gap.1", "Clip.2"],
    ])
    const roundTrip = importOtio(projected, { createId: ids }).state
    const semanticItems = (state) => state.composition.trackOrder.map((trackId) =>
      Object.values(state.composition.itemsById)
        .filter((item) => item.trackId === trackId)
        .map((item) => [seconds(item.timelineRange.start), seconds(item.timelineRange.duration), seconds(item.sourceRange.start)]),
    )
    expect(semanticItems(roundTrip)).toEqual(semanticItems(imported.state))
  })

  test("imports Gap + Clip with an explicit Timeline range and round-trips through MissingReference", async () => {
    const fixture = JSON.parse(await readFile(path.join(import.meta.dir, "fixtures/single-video.otio.json"), "utf8"))
    const imported = importOtio(fixture, { createId: ids })
    const item = Object.values(imported.state.composition.itemsById)[0]
    expect(seconds(item.timelineRange.start)).toBe(1)
    expect(seconds(item.sourceRange.start)).toBe(.5)
    expect(imported.state.sourceBindingsByNodeId["video-source"].status).toBe("offline")
    const exported = exportOtio(imported.state)
    expect(exported.tracks.children[0].children.map((child) => child.OTIO_SCHEMA)).toEqual(["Gap.1", "Clip.2"])
    expect(exported.tracks.children[0].children[1].media_reference).toMatchObject({
      OTIO_SCHEMA: "MissingReference.1",
      metadata: { convax: { sourceNodeId: "video-source" } },
    })
    expect(JSON.stringify(exported)).not.toContain("/private/")
  })

  test("rejects Transition, nested Stack and overlapping internal tracks", () => {
    const state = connectedState()
    const item = Object.values(state.composition.itemsById)[0]
    const overlap = structuredClone(item)
    overlap.id = "overlap"
    state.composition.itemsById[overlap.id] = overlap
    expect(() => exportOtio(state)).toThrow("overlap")
    expect(() => importOtio({ OTIO_SCHEMA: "Timeline.1", tracks: { OTIO_SCHEMA: "Stack.1", children: [{ OTIO_SCHEMA: "Track.1", kind: "Video", children: [{ OTIO_SCHEMA: "Transition.1" }] }] } })).toThrow("Transition")
  })
})

describe("save controller", () => {
  test("retries bounded failures, never reports a failed write as saved, and flushes the latest snapshot", async () => {
    const originalWindow = globalThis.window
    globalThis.window = {
      clearTimeout,
      setTimeout,
    }
    try {
      const statuses = []
      const save = mock(async () => { throw new Error("disk full") })
      const controller = new TimelineSaveController(save, { delayMs: 10000, maximumAttempts: 2, onStatus: (status) => statuses.push(status) })
      const initial = createEmptyState({ compositionId: "save-test" })
      controller.hydrate(initial)
      expect(statuses.at(-1)).toBe("saved")
      expect(controller.persisted).toBe(JSON.stringify(initial))
      controller.mark(initial)
      expect(await controller.flush()).toBeFalse()
      expect(save).toHaveBeenCalledTimes(2)
      expect(statuses.at(-1)).toBe("failed")
      expect(controller.pending).not.toBeNull()
    } finally {
      globalThis.window = originalWindow
    }
  })
})
