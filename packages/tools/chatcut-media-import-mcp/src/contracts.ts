import path from "node:path"

export const generationCallSchema = "convax.generation-call/1" as const
export const mediaImportResultSchema = "convax.chatcut-media-import-result/1" as const

export type MediaAssetType = "audio" | "gif" | "image" | "video"
export type MediaReferenceRole = "audio" | "reference_image" | "reference_video"

export interface MediaReference {
  kind: "file"
  mime_type: string
  name: string
  node_id: string
  path: string
  role: MediaReferenceRole
}

export interface MediaImportCall {
  endpoint: string
  operation_id: string
  output: "text"
  output_directory: string
  prompt: string
  references: MediaReference[]
  schema: typeof generationCallSchema
  session_token: string
}

export interface ImportedAsset {
  assetId: string
  assetType: MediaAssetType
  nodeId: string
}

export interface MediaImportResult {
  assetIds: string[]
  assets: ImportedAsset[]
  schema: typeof mediaImportResultSchema
}

export interface JsonRpcRequest {
  id?: number | string | null
  jsonrpc: "2.0"
  method: string
  params?: unknown
}

export interface ToolResult {
  content: Array<{ text: string; type: "text" }>
  isError?: boolean
  structuredContent?: MediaImportResult
}

export class MediaImportInputError extends Error {
  constructor(readonly publicMessage: string) {
    super(publicMessage)
    this.name = "MediaImportInputError"
  }
}

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MediaImportInputError(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string) {
  const expected = new Set(keys)
  if (
    Object.keys(value).length !== expected.size
    || Object.keys(value).some((key) => !expected.has(key))
  ) {
    throw new MediaImportInputError(`${label} contains unsupported fields.`)
  }
}

function requiredString(value: unknown, label: string, minimum: number, maximum: number) {
  if (
    typeof value !== "string"
    || value.length < minimum
    || value.length > maximum
    || value !== value.trim()
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new MediaImportInputError(`${label} is invalid.`)
  }
  return value
}

function referenceRole(value: unknown, index: number): MediaReferenceRole {
  if (
    value !== "audio"
    && value !== "reference_image"
    && value !== "reference_video"
  ) {
    throw new MediaImportInputError(`media reference ${index} has an unsupported role.`)
  }
  return value
}

function validateMimeForRole(mimeType: string, role: MediaReferenceRole, index: number) {
  const expectedPrefix =
    role === "reference_image"
      ? "image/"
      : role === "reference_video"
        ? "video/"
        : "audio/"
  if (!mimeType.toLowerCase().startsWith(expectedPrefix)) {
    throw new MediaImportInputError(`media reference ${index} MIME type does not match its role.`)
  }
}

export function parseMediaImportCall(value: unknown): MediaImportCall {
  const input = asRecord(value, "media import call")
  exactKeys(input, [
    "endpoint",
    "operation_id",
    "output",
    "output_directory",
    "prompt",
    "references",
    "schema",
    "session_token",
  ], "media import call")
  if (input.schema !== generationCallSchema) {
    throw new MediaImportInputError("media import call schema is not supported.")
  }
  if (input.output !== "text") {
    throw new MediaImportInputError("media import output must be text.")
  }
  if (!Array.isArray(input.references) || input.references.length < 1 || input.references.length > 4) {
    throw new MediaImportInputError("media import requires between one and four staged references.")
  }
  const references = input.references.map((raw, index): MediaReference => {
    const reference = asRecord(raw, `media reference ${index}`)
    exactKeys(
      reference,
      ["kind", "mime_type", "name", "node_id", "path", "role"],
      `media reference ${index}`,
    )
    if (reference.kind !== "file") {
      throw new MediaImportInputError(`media reference ${index} must be a staged file.`)
    }
    const role = referenceRole(reference.role, index)
    const mimeType = requiredString(reference.mime_type, `media reference ${index} mime_type`, 3, 256)
      .toLowerCase()
      .split(";", 1)[0]!
    validateMimeForRole(mimeType, role, index)
    const stagedPath = requiredString(reference.path, `media reference ${index} path`, 1, 4_096)
    if (!path.isAbsolute(stagedPath)) {
      throw new MediaImportInputError(`media reference ${index} path must be host-staged.`)
    }
    return {
      kind: "file",
      mime_type: mimeType,
      name: requiredString(reference.name, `media reference ${index} name`, 1, 512),
      node_id: requiredString(reference.node_id, `media reference ${index} node_id`, 1, 256),
      path: stagedPath,
      role,
    }
  })
  return {
    endpoint: requiredString(input.endpoint, "endpoint", 1, 2_048),
    operation_id: requiredString(input.operation_id, "operation_id", 1, 256),
    output: "text",
    output_directory: requiredString(input.output_directory, "output_directory", 1, 4_096),
    prompt: requiredString(input.prompt, "prompt", 1, 20_000),
    references,
    schema: generationCallSchema,
    session_token: requiredString(input.session_token, "session_token", 16, 4_096),
  }
}

export function mediaImportResult(assets: ImportedAsset[]): MediaImportResult {
  return {
    assetIds: assets.map((asset) => asset.assetId),
    assets,
    schema: mediaImportResultSchema,
  }
}
