import type { ProviderModel } from "shortdrama-router"

import { boundedCall } from "./bounded-call.ts"
import {
  asRecord,
  generationCallSchema,
  generationKinds,
  type GenerationKind,
  type McpTool,
  type ProviderId,
  type RouterPort,
} from "./contracts.ts"

const maximumModelsPerKind = 32
const modelCatalogTimeoutMs = 30_000
const modelIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u

export interface ValidatedModel {
  available: boolean
  capabilities: Readonly<Record<string, unknown>>
  description: string
  id: string
  kind: GenerationKind
  name: string
  provider: ProviderId
}

export type ModelsByKind = Readonly<
  Record<GenerationKind, readonly ValidatedModel[]>
>

function boundedText(value: unknown, maximum: number, label: string) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximum
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`Provider model ${label} is invalid`)
  }
  return value
}

function validateModel(value: ProviderModel, provider: ProviderId): ValidatedModel {
  const model = asRecord(value, "provider model")
  const id = boundedText(model.id, 256, "id")
  if (!modelIdPattern.test(id)) throw new Error("Provider model id is invalid")
  if (model.provider !== provider) {
    throw new Error("Provider model crossed the selected provider boundary")
  }
  if (
    typeof model.kind !== "string"
    || !generationKinds.includes(model.kind as GenerationKind)
  ) {
    throw new Error("Provider model kind is invalid")
  }
  const capabilities = asRecord(model.capabilities, "provider model capabilities")
  let available = true
  if (model.availability !== undefined) {
    const availability = asRecord(model.availability, "provider model availability")
    if (
      availability.state !== "available"
      && availability.state !== "unavailable"
      && availability.state !== "unknown"
    ) {
      throw new Error("Provider model availability is invalid")
    }
    if (availability.reason_code !== undefined) {
      boundedText(availability.reason_code, 160, "availability reason code")
    }
    available = availability.state === "available"
  }
  return {
    available,
    capabilities,
    description: boundedText(model.description, 1_024, "description"),
    id,
    kind: model.kind as GenerationKind,
    name: boundedText(model.name, 160, "name"),
    provider,
  }
}

export function validateModelCatalog(
  models: readonly ProviderModel[],
  provider: ProviderId,
): ModelsByKind {
  if (!Array.isArray(models) || models.length > maximumModelsPerKind * 3) {
    throw new Error("Provider model catalog is outside the bounded limit")
  }
  const result: Record<GenerationKind, ValidatedModel[]> = {
    audio: [],
    image: [],
    video: [],
  }
  const ids = new Set<string>()
  for (const value of models) {
    const model = validateModel(value, provider)
    if (ids.has(model.id)) throw new Error("Provider model ids are not unique")
    ids.add(model.id)
    if (!model.available) continue
    result[model.kind].push(model)
    if (result[model.kind].length > maximumModelsPerKind) {
      throw new Error("Provider model class is outside the bounded limit")
    }
  }
  for (const kind of generationKinds) {
    result[kind].sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    )
  }
  return result
}

type StringConstraint =
  | { kind: "enum"; values: readonly string[] }
  | { kind: "unknown" | "unsupported" }

type NumericConstraint =
  | { kind: "enum"; values: readonly number[] }
  | { kind: "range"; max: number; min: number; step?: number }
  | { kind: "unknown" | "unsupported" }

function modelConstraint(
  model: ValidatedModel,
  key: "aspect_ratio" | "duration" | "resolution" | "size",
  type: "number" | "string",
): NumericConstraint | StringConstraint | undefined {
  const rawConstraints = model.capabilities.constraints
  if (rawConstraints === undefined) return undefined
  const constraints = asRecord(rawConstraints, "provider model constraints")
  const raw = constraints[key]
  if (raw === undefined) return undefined
  const constraint = asRecord(raw, "provider model constraint")
  if (constraint.kind === "unknown" || constraint.kind === "unsupported") {
    return { kind: constraint.kind }
  }
  if (constraint.kind === "enum") {
    if (!Array.isArray(constraint.values) || constraint.values.length > 64) {
      throw new Error("Provider model constraint is invalid")
    }
    if (type === "string") {
      return {
        kind: "enum",
        values: constraint.values.map((value) =>
          boundedText(value, 32, "constraint value")),
      }
    }
    const values = constraint.values.map((value) => {
      if (!Number.isFinite(value) || Number(value) <= 0) {
        throw new Error("Provider model constraint is invalid")
      }
      return Number(value)
    })
    return { kind: "enum", values }
  }
  if (constraint.kind === "range" && type === "number") {
    const { max, min, step } = constraint
    if (
      !Number.isFinite(min)
      || !Number.isFinite(max)
      || Number(min) <= 0
      || Number(max) < Number(min)
      || (step !== undefined && (!Number.isFinite(step) || Number(step) <= 0))
    ) {
      throw new Error("Provider model constraint is invalid")
    }
    return {
      kind: "range",
      max: Number(max),
      min: Number(min),
      ...(step === undefined ? {} : { step: Number(step) }),
    }
  }
  throw new Error("Provider model constraint is invalid")
}

function stringValues(
  model: ValidatedModel,
  capabilityKey: string,
  constraintKey?: "aspect_ratio" | "resolution" | "size",
) {
  const constraint = constraintKey === undefined
    ? undefined
    : modelConstraint(model, constraintKey, "string") as StringConstraint | undefined
  if (constraint?.kind === "enum") return constraint.values
  if (constraint) return []
  const raw = model.capabilities[capabilityKey]
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > 64) {
    throw new Error("Provider model capability catalog is invalid")
  }
  return raw.map((item) => boundedText(item, 32, "capability"))
}

function stringCapabilityChoices(
  models: readonly ValidatedModel[],
  key: string,
  maximumLength: number,
  constraintKey?: "aspect_ratio" | "resolution" | "size",
) {
  const values = new Set<string>()
  for (const model of models) {
    for (const item of stringValues(model, key, constraintKey)) {
      values.add(boundedText(item, maximumLength, "capability"))
    }
  }
  if (values.size === 0) return undefined
  if (values.size > 64) throw new Error("Provider model capability catalog is too large")
  return {
    enum: [...values].sort(),
    type: "string",
  } as const
}

function numericCapabilityChoices(
  models: readonly ValidatedModel[],
  key: string,
) {
  const values = new Set<number>()
  const ranges: Array<{ max: number; min: number; step?: number }> = []
  for (const model of models) {
    const constraint = modelConstraint(model, "duration", "number") as
      | NumericConstraint
      | undefined
    if (constraint?.kind === "range") {
      ranges.push(constraint)
      continue
    }
    if (constraint?.kind === "enum") {
      for (const item of constraint.values) values.add(item)
      continue
    }
    if (constraint) continue
    const raw = model.capabilities[key]
    if (raw === undefined || raw === null) continue
    if (!Array.isArray(raw) || raw.length > 64) {
      throw new Error("Provider model capability catalog is invalid")
    }
    for (const item of raw) {
      if (!Number.isFinite(item) || Number(item) <= 0) {
        throw new Error("Provider model numeric capability is invalid")
      }
      values.add(Number(item))
    }
  }
  if (values.size === 0 && ranges.length === 0) return undefined
  if (values.size > 64) throw new Error("Provider model capability catalog is too large")
  if (ranges.length > 0) {
    const minimum = Math.min(
      ...ranges.map(({ min }) => min),
      ...values,
    )
    const maximum = Math.max(
      ...ranges.map(({ max }) => max),
      ...values,
    )
    const steps = new Set(ranges.flatMap(({ step }) =>
      step === undefined ? [] : [step]))
    const step = steps.size === 1 ? [...steps][0] : undefined
    const zeroAnchored = step !== undefined
      && ranges.every(({ min }) =>
        Math.abs(min / step - Math.round(min / step)) < 1e-9)
      && [...values].every((value) =>
        Math.abs(value / step - Math.round(value / step)) < 1e-9)
    return {
      maximum,
      minimum,
      ...(zeroAnchored ? { multipleOf: step } : {}),
      type: "number",
    } as const
  }
  return {
    enum: [...values].sort((left, right) => left - right),
    type: "number",
  } as const
}

function generationProperties(
  kind: GenerationKind,
  models: readonly ValidatedModel[],
) {
  const properties: Record<string, unknown> = {
    model: {
      oneOf: models.map(({ id, name }) => ({ const: id, title: name })),
      title: "Model",
      type: "string",
      "x-convax-role": "generation-model-id",
    },
    operation_id: {
      maxLength: 128,
      minLength: 1,
      pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
      type: "string",
    },
    output: { const: kind, type: "string" },
    output_directory: { maxLength: 4_096, minLength: 1, type: "string" },
    prompt: { maxLength: 20_000, minLength: 1, type: "string" },
    references: {
      description:
        "This adapter cannot consume Convax local media references.",
      maxItems: 0,
      type: "array",
    },
    schema: { const: generationCallSchema, type: "string" },
  }
  const ratios = stringCapabilityChoices(
    models,
    "aspect_ratios",
    16,
    "aspect_ratio",
  )
  const resolutions = stringCapabilityChoices(
    models,
    "resolutions",
    32,
    "resolution",
  )
  const sizes = stringCapabilityChoices(models, "sizes", 32, "size")
  if (ratios) properties.aspect_ratio = ratios
  if (resolutions) properties.resolution = resolutions
  if (kind === "audio") {
    const formats = stringCapabilityChoices(models, "audio_formats", 32)
    if (formats) properties.format = formats
  } else if (kind === "image") {
    if (sizes) properties.size = sizes
    properties.n = { maximum: 10, minimum: 1, type: "integer" }
  } else {
    const durations = numericCapabilityChoices(models, "durations")
    if (durations) properties.duration = durations
    if (models.some((model) => model.capabilities.seed === true)) {
      properties.seed = {
        maximum: 4_294_967_295,
        minimum: 0,
        type: "integer",
      }
    }
  }
  return properties
}

export function generationTools(models: ModelsByKind): McpTool[] {
  const tools: McpTool[] = []
  for (const kind of generationKinds) {
    const choices = models[kind]
    if (choices.length === 0) continue
    tools.push({
      description:
        `Generate ${kind} through the selected short-drama provider. `
        + "Local Canvas media references are not accepted.",
      inputSchema: {
        additionalProperties: false,
        properties: generationProperties(kind, choices),
        required: [
          "schema",
          "operation_id",
          "prompt",
          "output",
          "output_directory",
          "references",
          "model",
        ],
        type: "object",
      },
      name: `${kind}.generate`,
    })
  }
  return tools
}

export async function loadModelCatalog(
  router: RouterPort,
  provider: ProviderId,
  signal?: AbortSignal,
  timeoutMs = modelCatalogTimeoutMs,
) {
  return validateModelCatalog(
    await boundedCall(timeoutMs, signal, (attemptSignal) =>
      router.listProviderModels(provider, attemptSignal, true)),
    provider,
  )
}
