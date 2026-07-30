const acceptedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"])

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
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
        id: input.inputKey,
        mimeType,
        name: typeof input.name === "string" && input.name
          ? input.name
          : typeof input.label === "string" && input.label
            ? input.label
            : "未命名图片",
        readable: input.status !== "pending" &&
          input.status !== "error" &&
          (mimeType === undefined || acceptedImageMimeTypes.has(mimeType)),
      }
    })
}

export function parseOpenedImageStream(result) {
  if (
    !isRecord(result) ||
    typeof result.sessionId !== "string" ||
    !result.sessionId ||
    typeof result.url !== "string" ||
    !result.url.startsWith("convax-connected-media://") ||
    !isRecord(result.probe) ||
    typeof result.probe.mimeType !== "string" ||
    !acceptedImageMimeTypes.has(result.probe.mimeType.toLowerCase())
  ) {
    throw new Error("宿主没有返回可用图片")
  }
  return {
    mimeType: result.probe.mimeType.toLowerCase(),
    sessionId: result.sessionId,
    url: result.url,
  }
}
