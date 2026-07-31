const acceptedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"])

export const MAX_PREVIEW_EDGE = 2048
export const MAX_PREVIEW_PIXELS = 4_194_304
export const MAX_PREVIEW_PIXEL_RATIO = 2

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function safePositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function abortReason(signal) {
  return signal?.reason instanceof Error ? signal.reason : new Error("图片读取已取消")
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal)
}

export function normalizeImageInputs(result) {
  if (!isRecord(result) || !Array.isArray(result.inputs)) return []
  return result.inputs
    .filter(function (input) {
      return isRecord(input) &&
        typeof input.inputKey === "string" &&
        input.inputKey.length > 0 &&
        input.kind === "image"
    })
    .map(function (input) {
      const mimeType = typeof input.mimeType === "string"
        ? input.mimeType.toLowerCase()
        : undefined
      return {
        height: safePositiveInteger(input.height),
        id: input.inputKey,
        mediaRevision: typeof input.mediaRevision === "string" && input.mediaRevision
          ? input.mediaRevision
          : undefined,
        mimeType,
        name: typeof input.name === "string" && input.name
          ? input.name
          : typeof input.label === "string" && input.label
            ? input.label
            : "未命名图片",
        readable: input.status !== "pending" &&
          input.status !== "error" &&
          (mimeType === undefined || acceptedImageMimeTypes.has(mimeType)),
        width: safePositiveInteger(input.width),
      }
    })
}

export function parseOpenedImageSession(result) {
  const probe = isRecord(result) && isRecord(result.probe) ? result.probe : null
  const mimeType = typeof probe?.mimeType === "string"
    ? probe.mimeType.toLowerCase()
    : ""
  const width = safePositiveInteger(probe?.width)
  const height = safePositiveInteger(probe?.height)
  if (
    !isRecord(result) ||
    typeof result.sessionId !== "string" ||
    !result.sessionId ||
    typeof result.url !== "string" ||
    !result.url.startsWith("convax-connected-media://") ||
    probe?.kind !== "image" ||
    !acceptedImageMimeTypes.has(mimeType) ||
    !Number.isSafeInteger(probe?.size) ||
    probe.size < 1 ||
    probe.size > 16 * 1024 * 1024 ||
    !width ||
    width > 8192 ||
    !height ||
    height > 8192 ||
    width * height > 33_554_432 ||
    typeof probe.contentRevision !== "string" ||
    !/^[a-f0-9]{64}$/u.test(probe.contentRevision)
  ) {
    throw new Error("宿主没有返回可预览的参考图")
  }
  return {
    probe: {
      contentRevision: probe.contentRevision,
      height,
      kind: "image",
      mimeType,
      size: probe.size,
      width,
    },
    sessionId: result.sessionId,
    url: result.url,
  }
}

export function computePreviewBackingSize(input) {
  const sourceWidth = safePositiveInteger(input?.sourceWidth)
  const sourceHeight = safePositiveInteger(input?.sourceHeight)
  if (!sourceWidth || !sourceHeight) throw new Error("图片尺寸无效")
  const viewportWidth = Math.max(1, Number.isFinite(input.viewportWidth) ? input.viewportWidth : sourceWidth)
  const viewportHeight = Math.max(1, Number.isFinite(input.viewportHeight) ? input.viewportHeight : sourceHeight)
  const pixelRatio = Math.min(
    MAX_PREVIEW_PIXEL_RATIO,
    Math.max(1, Number.isFinite(input.pixelRatio) ? input.pixelRatio : 1),
  )
  const fitScale = Math.min(viewportWidth / sourceWidth, viewportHeight / sourceHeight)
  const edgeScale = MAX_PREVIEW_EDGE / Math.max(sourceWidth, sourceHeight)
  const pixelScale = Math.sqrt(MAX_PREVIEW_PIXELS / (sourceWidth * sourceHeight))
  const scale = Math.min(1, fitScale * pixelRatio, edgeScale, pixelScale)
  const width = Math.max(1, Math.floor(sourceWidth * scale))
  const height = Math.max(1, Math.floor(sourceHeight * scale))
  if (
    width > sourceWidth ||
    height > sourceHeight ||
    width > MAX_PREVIEW_EDGE ||
    height > MAX_PREVIEW_EDGE ||
    width * height > MAX_PREVIEW_PIXELS
  ) {
    throw new Error("参考图预览尺寸超出预算")
  }
  return { height, pixelRatio, width }
}

export async function withOpenedImageSession(input) {
  throwIfAborted(input.signal)
  let opened
  let openedSessionId
  let primaryError
  try {
    const response = await input.open(input.inputKey, input.signal)
    opened = parseOpenedImageSession(response)
    // The SDK validates Host results before this helper sees them. Record only a
    // fully admitted session; malformed results are connection-fatal and are
    // reclaimed by Host frame revocation because no session id crosses the SDK.
    openedSessionId = opened.sessionId
    throwIfAborted(input.signal)
    const result = await input.use(opened, input.signal)
    throwIfAborted(input.signal)
    return result
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    if (openedSessionId) {
      try {
        await input.close(openedSessionId)
      } catch (closeError) {
        if (!primaryError) throw closeError
      }
    }
  }
}

export async function decodeImageSessionPreview(input) {
  throwIfAborted(input.signal)
  const image = input.createImage()
  const previewCanvas = input.createCanvas()
  const onAbort = function () {
    image.removeAttribute("src")
  }
  input.signal?.addEventListener("abort", onAbort, { once: true })
  try {
    image.decoding = "async"
    image.src = input.session.url
    await image.decode()
    throwIfAborted(input.signal)
    if (
      image.naturalWidth !== input.session.probe.width ||
      image.naturalHeight !== input.session.probe.height
    ) {
      throw new Error("参考图尺寸与宿主探测结果不一致")
    }
    const viewport = input.viewport.getBoundingClientRect()
    const backing = computePreviewBackingSize({
      pixelRatio: input.pixelRatio,
      sourceHeight: image.naturalHeight,
      sourceWidth: image.naturalWidth,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
    })
    previewCanvas.width = backing.width
    previewCanvas.height = backing.height
    const previewContext = previewCanvas.getContext("2d", { alpha: false })
    if (!previewContext) throw new Error("浏览器不支持安全的参考图预览")
    previewContext.drawImage(image, 0, 0, backing.width, backing.height)
    throwIfAborted(input.signal)

    input.target.width = backing.width
    input.target.height = backing.height
    const targetContext = input.target.getContext("2d", { alpha: false })
    if (!targetContext) throw new Error("浏览器不支持安全的参考图预览")
    targetContext.clearRect(0, 0, backing.width, backing.height)
    targetContext.drawImage(previewCanvas, 0, 0)
    return {
      contentRevision: input.session.probe.contentRevision,
      height: input.session.probe.height,
      inputKey: input.inputKey,
      mediaRevision: input.mediaRevision,
      mimeType: input.session.probe.mimeType,
      previewHeight: backing.height,
      previewWidth: backing.width,
      width: input.session.probe.width,
    }
  } finally {
    input.signal?.removeEventListener("abort", onAbort)
    image.removeAttribute("src")
    previewCanvas.width = 1
    previewCanvas.height = 1
  }
}

export function clearImagePreview(canvas) {
  const context = canvas.getContext("2d")
  context?.clearRect(0, 0, canvas.width, canvas.height)
  canvas.width = 1
  canvas.height = 1
}
