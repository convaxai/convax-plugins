export const MIN_PIXELS_PER_SECOND = 40
export const MAX_PIXELS_PER_SECOND = 480
export const ZOOM_STEP = 20

export function clampPixelsPerSecond(value) {
  if (!Number.isFinite(value)) return MIN_PIXELS_PER_SECOND
  return Math.min(MAX_PIXELS_PER_SECOND, Math.max(MIN_PIXELS_PER_SECOND, Math.round(value)))
}

/**
 * Preserve the Timeline time beneath one viewport point while the horizontal
 * scale changes. scrollLeft includes the sticky track header, while anchorX is
 * measured from the scroll viewport's left edge.
 */
export function anchoredScrollLeft({
  anchorX,
  headerWidth,
  newPixelsPerSecond,
  oldPixelsPerSecond,
  scrollLeft,
}) {
  const oldScale = clampPixelsPerSecond(oldPixelsPerSecond)
  const newScale = clampPixelsPerSecond(newPixelsPerSecond)
  const laneAnchor = Math.max(0, anchorX - headerWidth)
  const anchorTime = Math.max(0, (scrollLeft + laneAnchor) / oldScale)
  return Math.max(0, anchorTime * newScale - laneAnchor)
}

export function fitPixelsPerSecond({ duration, headerWidth, viewportWidth }) {
  const availableWidth = Math.max(1, viewportWidth - headerWidth)
  return clampPixelsPerSecond(availableWidth / Math.max(1, duration))
}

/**
 * Trackpads already provide deltaX. A mouse wheel is converted to horizontal
 * movement only when Shift is held or the Timeline has no vertical overflow,
 * so a long track list can still scroll vertically.
 */
export function resolveWheelPan({
  deltaX,
  deltaY,
  horizontalOverflow,
  shiftKey,
  verticalOverflow,
}) {
  if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX !== 0) {
    return { handled: true, left: deltaX, top: 0 }
  }
  if (shiftKey && deltaY !== 0) {
    return { handled: true, left: deltaY, top: 0 }
  }
  if (horizontalOverflow && !verticalOverflow && deltaY !== 0) {
    return { handled: true, left: deltaY, top: 0 }
  }
  return { handled: false, left: 0, top: 0 }
}
