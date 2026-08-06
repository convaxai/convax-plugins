/**
 * Portable Canvas-node state for storyai-3d-director-desk.
 *
 * Bounded-value cannot yet admit finite floats, so the Host-visible value is
 * either `{}` or this closed base64-json envelope. The decoded scene is checked
 * for finite numbers and size before encode and again after decode.
 */

export const ENVELOPE_SCHEMA_VERSION = 1
export const ENVELOPE_ENCODING = "base64-json-utf8"

/** Host portable plugin-state value ceiling. */
export const HOST_STATE_VALUE_BYTE_LIMIT = 256 * 1024

/**
 * Individual string fields in the bounded-value dialect cannot exceed 64 KiB.
 * Base64 expands 3:4, so raw UTF-8 JSON must stay under this ceiling.
 */
export const HOST_STRING_BYTE_LIMIT = 64 * 1024
export const HOST_RAW_STATE_BYTE_LIMIT = Math.floor((HOST_STRING_BYTE_LIMIT * 3) / 4)

const LEGACY_HOST_STATE_SCHEMA_VERSIONS = new Set([1, 2])
const MAXIMUM_VALUE_NODES = 4_096
const MAXIMUM_VALUE_DEPTH = 32

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function utf8ByteLength(text) {
  return textEncoder.encode(text).byteLength
}

function utf8ToBase64(text) {
  const bytes = textEncoder.encode(text)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToUtf8(payload) {
  if (typeof payload !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/u.test(payload)) {
    throw new TypeError("Envelope payload is not base64")
  }
  if (payload.length % 4 !== 0) throw new TypeError("Envelope payload is not base64")
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return textDecoder.decode(bytes)
}

export function assertFiniteJsonTree(value, depth = 1, budget = { nodes: 0 }) {
  if (depth > MAXIMUM_VALUE_DEPTH) {
    throw new TypeError("3D scene exceeds portable depth")
  }
  if (++budget.nodes > MAXIMUM_VALUE_NODES) {
    throw new TypeError("3D scene exceeds portable node budget")
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") return
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("3D scene contains a non-finite number")
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) assertFiniteJsonTree(item, depth + 1, budget)
    return
  }
  if (!isPlainRecord(value)) throw new TypeError("3D scene contains a non-JSON value")
  for (const key of Object.keys(value)) {
    assertFiniteJsonTree(value[key], depth + 1, budget)
  }
}

export function assertCompleteDirectorScene(value) {
  if (!isPlainRecord(value)) throw new TypeError("3D scene must be a plain object")
  if (!LEGACY_HOST_STATE_SCHEMA_VERSIONS.has(value.schemaVersion)) {
    throw new TypeError("3D scene schemaVersion is unsupported")
  }
  if (!isPlainRecord(value.directorProject)) {
    throw new TypeError("3D scene is missing directorProject")
  }
  if (value.schemaVersion === 2) {
    if (
      !isPlainRecord(value.presentation) ||
      !isPlainRecord(value.presentation.viewport) ||
      !isPlainRecord(value.presentation.viewport.directorView)
    ) {
      throw new TypeError("3D scene is missing presentation viewport")
    }
  }
  assertFiniteJsonTree(value)
  const raw = JSON.stringify(value)
  if (utf8ByteLength(raw) > HOST_RAW_STATE_BYTE_LIMIT) {
    throw new TypeError("3D scene exceeds raw JSON size limit")
  }
  return raw
}

export function isStateEnvelope(value) {
  return (
    isPlainRecord(value) &&
    value.schemaVersion === ENVELOPE_SCHEMA_VERSION &&
    value.encoding === ENVELOPE_ENCODING &&
    typeof value.payload === "string" &&
    Object.keys(value).length === 3
  )
}

export function isLegacyDirectorHostState(value) {
  return (
    isPlainRecord(value) &&
    LEGACY_HOST_STATE_SCHEMA_VERSIONS.has(value.schemaVersion) &&
    isPlainRecord(value.directorProject)
  )
}

/**
 * Validate the complete scene, then wrap it in the Host-admitted envelope.
 * Returns `null` when the raw JSON cannot fit under the base64 string ceiling.
 */
export function encodePersistedHostState(scene) {
  let raw
  try {
    raw = assertCompleteDirectorScene(scene)
  } catch (error) {
    if (error instanceof TypeError && /size limit/u.test(error.message)) return null
    throw error
  }
  const payload = utf8ToBase64(raw)
  if (utf8ByteLength(payload) > HOST_STRING_BYTE_LIMIT) return null
  const envelope = {
    encoding: ENVELOPE_ENCODING,
    payload,
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
  }
  if (utf8ByteLength(JSON.stringify(envelope)) > HOST_STATE_VALUE_BYTE_LIMIT) return null
  return envelope
}

/**
 * Decode a Host-persisted value into the in-memory director scene.
 * Accepts the closed envelope and legacy raw director state (migration).
 */
export function decodePersistedHostState(value) {
  if (value === undefined || (isPlainRecord(value) && Object.keys(value).length === 0)) {
    return { ok: true, kind: "absent" }
  }
  if (!isPlainRecord(value)) {
    return { ok: false, message: "3D 节点状态格式无效；原数据已保留且不会被覆盖。" }
  }
  if (isStateEnvelope(value)) {
    try {
      if (utf8ByteLength(value.payload) > HOST_STRING_BYTE_LIMIT) {
        return { ok: false, message: "3D 节点状态超过可解码上限；原数据已保留且不会被覆盖。" }
      }
      const raw = base64ToUtf8(value.payload)
      if (utf8ByteLength(raw) > HOST_RAW_STATE_BYTE_LIMIT) {
        return { ok: false, message: "3D 节点状态超过可解码上限；原数据已保留且不会被覆盖。" }
      }
      const scene = JSON.parse(raw)
      assertCompleteDirectorScene(scene)
      return { ok: true, kind: "ready", scene }
    } catch {
      return { ok: false, message: "3D 节点状态无法解码；原数据已保留且不会被覆盖。" }
    }
  }
  if (isLegacyDirectorHostState(value)) {
    try {
      assertCompleteDirectorScene(value)
      return { ok: true, kind: "ready", scene: value }
    } catch {
      return { ok: false, message: "3D 场景状态不完整；原数据已保留且不会被覆盖。" }
    }
  }
  return { ok: false, message: "此 3D 节点来自不兼容的状态版本；请升级插件后再打开。" }
}
