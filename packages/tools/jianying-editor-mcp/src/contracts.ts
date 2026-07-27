import path from "node:path"

export const generationCallSchema = "convax.generation-call/1" as const
export type DraftStatus = "active" | "ambiguous" | "no_active_draft" | "not_running" | "unsupported"
export type ExportTarget = "auto" | "current" | "new"

export interface StagedReference {
  kind: "file"
  mimeType: string
  name: string
  nodeId: string
  path: string
  role: "reference_image" | "reference_video"
}

export interface GenerationCall {
  draftToken?: string
  output: "text"
  outputDirectory: string
  prompt: string
  references: StagedReference[]
  schema: typeof generationCallSchema
  target: ExportTarget
}

export interface DraftObservation {
  draft?: { name: string; path: string; pid: number }
  processIds: number[]
  reason?: string
  status: DraftStatus
}

export interface PublicDraftStatus {
  draftName?: string
  draftToken?: string
  reason?: string
  schema: "convax.jianying-draft-status/1"
  status: DraftStatus
}

export interface ExportResult {
  createdDraft: boolean
  draftName: string
  importedMediaCount: number
  schema: "convax.jianying-export-result/1"
  transferStatus: "verified"
}

export class InputError extends Error {
  constructor(readonly publicMessage: string) {
    super(publicMessage)
    this.name = "InputError"
  }
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const keys = new Set(allowed)
  if (Object.keys(value).some((key) => !keys.has(key))) throw new InputError(`${label} contains unsupported fields.`)
}

function text(value: unknown, label: string, maximum: number) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new InputError(`${label} is invalid.`)
  }
  return value
}

export function parseGenerationCall(value: unknown, operation: "draft.status" | "media.export"): GenerationCall {
  const input = record(value, "generation call")
  exactKeys(
    input,
    ["draft_token", "output", "output_directory", "prompt", "references", "schema", "target"],
    "generation call",
  )
  if (input.schema !== generationCallSchema || input.output !== "text") {
    throw new InputError("generation call contract is not supported.")
  }
  if (!Array.isArray(input.references)) throw new InputError("generation references must be an array.")
  const minimum = operation === "media.export" ? 1 : 0
  const maximum = operation === "media.export" ? 32 : 0
  if (input.references.length < minimum || input.references.length > maximum) {
    throw new InputError(operation === "media.export"
      ? "JianYing export requires between one and 32 staged references."
      : "JianYing status does not accept media references.")
  }
  const references = input.references.map((raw, index): StagedReference => {
    const reference = record(raw, `reference ${index}`)
    exactKeys(reference, ["kind", "mime_type", "name", "node_id", "path", "role"], `reference ${index}`)
    if (reference.kind !== "file") throw new InputError(`reference ${index} must be a staged file.`)
    if (reference.role !== "reference_image" && reference.role !== "reference_video") {
      throw new InputError(`reference ${index} has an unsupported role.`)
    }
    const mimeType = text(reference.mime_type, `reference ${index} mime_type`, 256).toLowerCase().split(";", 1)[0]!
    const expectedPrefix = reference.role === "reference_image" ? "image/" : "video/"
    if (!mimeType.startsWith(expectedPrefix)) throw new InputError(`reference ${index} MIME type does not match its role.`)
    const stagedPath = text(reference.path, `reference ${index} path`, 4_096)
    if (!path.isAbsolute(stagedPath)) throw new InputError(`reference ${index} path must be host-staged.`)
    return {
      kind: "file",
      mimeType,
      name: text(reference.name, `reference ${index} name`, 512),
      nodeId: text(reference.node_id, `reference ${index} node_id`, 256),
      path: stagedPath,
      role: reference.role,
    }
  })
  const target = input.target === undefined ? "auto" : input.target
  if (target !== "auto" && target !== "current" && target !== "new") {
    throw new InputError("JianYing target must be auto, current, or new.")
  }
  const draftToken = input.draft_token === undefined ? undefined : text(input.draft_token, "draft_token", 256)
  if (operation === "draft.status" && (target !== "auto" || draftToken !== undefined)) {
    throw new InputError("JianYing status does not accept target fields.")
  }
  if (operation === "media.export" && target !== "auto" && draftToken === undefined) {
    throw new InputError("Explicit JianYing export requires draft_token.")
  }
  return {
    ...(draftToken ? { draftToken } : {}),
    output: "text",
    outputDirectory: text(input.output_directory, "output_directory", 4_096),
    prompt: text(input.prompt, "prompt", 20_000),
    references,
    schema: generationCallSchema,
    target,
  }
}
