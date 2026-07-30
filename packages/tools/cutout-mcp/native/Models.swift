import CoreFoundation
import Foundation

let protocolVersion = "2025-03-26"
let generationCallSchema = "convax.generation-call/1"
let generationResultSchema = "convax.generation-result/1"
let maximumArtifactBytes: Int64 = 128 * 1024 * 1024

struct PublicInputError: Error {
  let message: String
}

struct ExecutionError: Error {}
struct CancellationError: Error {}

struct GenerationReference {
  let mimeType: String
  let name: String
  let nodeID: String
  let path: String
  let role: String
}

struct GenerationCall {
  let operationID: String
  let outputDirectory: String
  let prompt: String
  let references: [GenerationReference]
}

struct GenerationArtifact {
  let mimeType: String
  let name: String
  let path: String

  var json: [String: Any] {
    ["mimeType": mimeType, "name": name, "path": path]
  }
}

let cutoutTool: [String: Any] = [
  "description": "Remove one staged image background locally with U-2-Netp ONNX and return a transparent PNG.",
  "inputSchema": [
    "additionalProperties": false,
    "properties": [
      "operation_id": ["maxLength": 256, "minLength": 1, "type": "string"],
      "output": ["const": "image", "type": "string"],
      "output_directory": ["maxLength": 4_096, "minLength": 1, "type": "string"],
      "prompt": ["maxLength": 20_000, "minLength": 1, "type": "string"],
      "references": [
        "items": ["type": "object"],
        "maxItems": 1,
        "minItems": 1,
        "type": "array",
      ],
      "schema": ["const": generationCallSchema, "type": "string"],
    ],
    "required": ["schema", "operation_id", "prompt", "output", "output_directory", "references"],
    "type": "object",
  ],
  "name": "background.remove",
]

func requireObject(_ value: Any?, _ label: String) throws -> [String: Any] {
  guard let object = value as? [String: Any] else {
    throw PublicInputError(message: "\(label) must be an object.")
  }
  return object
}

private func requireExactKeys(_ object: [String: Any], _ keys: Set<String>, _ label: String) throws {
  guard Set(object.keys) == keys else {
    throw PublicInputError(message: "\(label) contains unsupported fields.")
  }
}

private func requiredString(_ value: Any?, _ label: String, maximumLength: Int) throws -> String {
  guard let string = value as? String,
        !string.isEmpty,
        string.count <= maximumLength,
        string == string.trimmingCharacters(in: .whitespacesAndNewlines),
        !string.unicodeScalars.contains(where: { $0.value <= 0x1f || $0.value == 0x7f })
  else {
    throw PublicInputError(message: "\(label) must be a non-empty trimmed string.")
  }
  return string
}

func parseGenerationCall(_ value: Any?) throws -> GenerationCall {
  let input = try requireObject(value, "generation call")
  try requireExactKeys(
    input,
    Set(["operation_id", "output", "output_directory", "prompt", "references", "schema"]),
    "generation call"
  )
  guard input["schema"] as? String == generationCallSchema else {
    throw PublicInputError(message: "generation call schema is not supported.")
  }
  guard input["output"] as? String == "image" else {
    throw PublicInputError(message: "background.remove returns image output.")
  }
  guard let values = input["references"] as? [Any], values.count == 1 else {
    throw PublicInputError(message: "background.remove requires exactly one reference image.")
  }
  let reference = try requireObject(values[0], "generation reference")
  try requireExactKeys(
    reference,
    Set(["kind", "mime_type", "name", "node_id", "path", "role"]),
    "generation reference"
  )
  guard reference["kind"] as? String == "file",
        reference["role"] as? String == "reference_image"
  else {
    throw PublicInputError(message: "background.remove requires one staged reference_image file.")
  }
  return GenerationCall(
    operationID: try requiredString(input["operation_id"], "operation_id", maximumLength: 256),
    outputDirectory: try requiredString(input["output_directory"], "output_directory", maximumLength: 4_096),
    prompt: try requiredString(input["prompt"], "prompt", maximumLength: 20_000),
    references: [GenerationReference(
      mimeType: try requiredString(reference["mime_type"], "reference mime_type", maximumLength: 256),
      name: try requiredString(reference["name"], "reference name", maximumLength: 512),
      nodeID: try requiredString(reference["node_id"], "reference node_id", maximumLength: 256),
      path: try requiredString(reference["path"], "reference path", maximumLength: 4_096),
      role: "reference_image"
    )]
  )
}

func normalizeMimeType(_ value: String) -> String {
  value.split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false)[0]
    .trimmingCharacters(in: .whitespacesAndNewlines)
    .lowercased()
}
