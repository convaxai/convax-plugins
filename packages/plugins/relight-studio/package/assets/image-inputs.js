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
        height: Number.isSafeInteger(input.height) && input.height > 0 ? input.height : undefined,
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
        width: Number.isSafeInteger(input.width) && input.width > 0 ? input.width : undefined,
      }
    })
}

export function parseOpenedImageSession(result) {
  if (
    !isRecord(result) ||
    typeof result.sessionId !== "string" ||
    !result.sessionId ||
    typeof result.url !== "string" ||
    !result.url.startsWith("convax-connected-media://") ||
    !isRecord(result.probe) ||
    result.probe.kind !== "image" ||
    typeof result.probe.mimeType !== "string" ||
    !acceptedImageMimeTypes.has(result.probe.mimeType.toLowerCase())
  ) {
    throw new Error("宿主没有返回可用图片")
  }
  return {
    probe: result.probe,
    sessionId: result.sessionId,
    url: result.url,
  }
}

function abortReason(signal) {
  return signal?.reason instanceof Error ? signal.reason : new Error("图片读取已取消")
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal)
}

export async function withOpenedImageSession(input) {
  throwIfAborted(input.signal)
  let opened
  let openedSessionId
  let primaryError
  try {
    const response = await input.open(input.inputKey, input.signal)
    opened = parseOpenedImageSession(response)
    // The generated SDK rejects malformed Host results before returning them.
    // Only an admitted session can be explicitly closed by Plugin code; frame
    // revocation remains the final cleanup for transport/schema failures.
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
