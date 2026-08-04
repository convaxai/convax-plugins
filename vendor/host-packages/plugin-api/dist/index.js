// src/contracts.ts
var API_ID = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;
var ERROR_CODE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
var GRANT = /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+$/;
var SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
var AUDIENCES = new Set(["web-plugin", "agent-skill", "companion", "host"]);
var SCOPES = new Set(["connection", "plugin", "own-node", "project", "canvas"]);
var SIDE_EFFECTS = new Set(["none", "read", "write", "execute", "subscribe"]);
var COMPLETIONS = new Set(["cancelable", "commit-preserving"]);
function requireNonEmpty(value, label) {
  if (value.trim().length === 0)
    throw new TypeError(`${label} must not be empty`);
}
function assertVersion(value, label) {
  if (!SEMVER.test(value))
    throw new TypeError(`${label} must be a strict semantic version`);
}
function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0;index < 3; index += 1) {
    const comparison = leftParts[index] - rightParts[index];
    if (comparison !== 0)
      return comparison;
  }
  return 0;
}
function freezeDefinition(definition) {
  if (!API_ID.test(definition.id))
    throw new TypeError(`Plugin API id is invalid: ${definition.id}`);
  assertVersion(definition.contractSince, `${definition.id} contractSince`);
  if (definition.grant !== null && !GRANT.test(definition.grant)) {
    throw new TypeError(`Plugin API grant is invalid: ${definition.grant}`);
  }
  if (!SCOPES.has(definition.scope))
    throw new TypeError(`Plugin API scope is invalid: ${definition.scope}`);
  if (!SIDE_EFFECTS.has(definition.sideEffect)) {
    throw new TypeError(`Plugin API sideEffect is invalid: ${definition.sideEffect}`);
  }
  if (!COMPLETIONS.has(definition.completion)) {
    throw new TypeError(`Plugin API completion is invalid: ${definition.completion}`);
  }
  const audience = definition.audience ?? ["web-plugin"];
  if (audience.length === 0 || new Set(audience).size !== audience.length || audience.some((item) => !AUDIENCES.has(item))) {
    throw new TypeError(`Plugin API audience is invalid: ${definition.id}`);
  }
  requireNonEmpty(definition.docs.summary, `${definition.id} docs.summary`);
  requireNonEmpty(definition.docs.description, `${definition.id} docs.description`);
  requireNonEmpty(definition.docs.request, `${definition.id} docs.request`);
  requireNonEmpty(definition.docs.response, `${definition.id} docs.response`);
  const errorCodes = new Set;
  const errors = definition.errors.map((error) => {
    if (!ERROR_CODE.test(error.code) || errorCodes.has(error.code)) {
      throw new TypeError(`Plugin API error code is invalid or duplicated: ${definition.id}/${error.code}`);
    }
    errorCodes.add(error.code);
    requireNonEmpty(error.description, `${definition.id}/${error.code} description`);
    return Object.freeze({ ...error });
  });
  return Object.freeze({
    ...definition,
    audience: Object.freeze([...audience]),
    errors: Object.freeze(errors),
    docs: Object.freeze({ ...definition.docs })
  });
}
function definePluginApi(definition) {
  return freezeDefinition(definition);
}
function definePluginApiRelease(version, apis) {
  assertVersion(version, "Plugin API release version");
  return Object.freeze({ version, apis: Object.freeze([...apis]) });
}
function definePluginApiCatalog(...releases) {
  if (releases.length === 0)
    throw new TypeError("Plugin API catalog requires at least one release");
  const ids = new Set;
  const apis = [];
  const releaseVersions = new Set(releases.map((release) => release.version));
  let previous;
  for (const release of releases) {
    assertVersion(release.version, "Plugin API release version");
    if (previous && compareVersions(previous, release.version) >= 0) {
      throw new TypeError("Plugin API releases must be strictly increasing");
    }
    previous = release.version;
    for (const candidate of release.apis) {
      const definition = freezeDefinition(candidate);
      if (ids.has(definition.id))
        throw new TypeError(`Plugin API id is duplicated: ${definition.id}`);
      if (compareVersions(definition.contractSince, release.version) < 0) {
        throw new TypeError(`Plugin API ${definition.id} contractSince must not precede since`);
      }
      if (!releaseVersions.has(definition.contractSince)) {
        throw new TypeError(`Plugin API ${definition.id} contractSince must identify a Catalog release block`);
      }
      ids.add(definition.id);
      apis.push(Object.freeze({ ...definition, since: release.version }));
    }
  }
  if (apis.length === 0)
    throw new TypeError("Plugin API catalog must contain at least one API");
  return Object.freeze({
    version: releases[releases.length - 1].version,
    apis: Object.freeze(apis)
  });
}
var pluginApiContractInternals = Object.freeze({
  assertVersion,
  compareVersions
});

// src/method-schemas.ts
var pluginApiWireSchemaDialect = "convax.plugin-api-wire-schema/3";
var KiB = 1024;
var MiB = KiB * KiB;
var maximumPluginApiConnectedImageBytes = 16 * MiB;
var maximumPluginApiConnectedImageDimension = 8192;
var maximumPluginApiConnectedImagePixels = 33554432;
var none = { type: "none" };
var bool = { type: "boolean" };
var finite = { finite: true, type: "number" };
var integer = { finite: true, minimum: 0, type: "integer" };
var boundedPositiveInteger = (maximum) => ({ finite: true, maximum, minimum: 1, type: "integer" });
var nil = { type: "null" };
var literal = (value) => ({ const: value });
var string = (maxLength = 2048, options = {}) => ({
  controlCharacters: false,
  maxLength,
  minLength: options.allowEmpty ? 0 : 1,
  ...options.prefix ? { prefix: options.prefix } : {},
  ...options.refinement ? { refinement: options.refinement } : {},
  type: "string"
});
var array = (items, maxItems, minItems = 0, uniqueBy) => ({ items, maxItems, minItems, type: "array", ...uniqueBy ? { uniqueBy } : {} });
var object = (properties, required, products) => ({
  additionalProperties: false,
  properties,
  ...products ? { products } : {},
  required,
  type: "object"
});
var union = (...oneOf) => ({ oneOf });
var jsonObject = (maxBytes = MiB) => ({ keyMaxLength: 128, maxBytes, maxDepth: 32, type: "json-object" });
var enumString = (values) => ({
  controlCharacters: false,
  enum: values,
  maxLength: Math.max(...values.map((value) => value.length)),
  minLength: 1,
  type: "string"
});
var point = object({ x: finite, y: finite }, ["x", "y"]);
var size = object({ height: finite, width: finite }, ["height", "width"]);
var canvasRef = object({ canvasId: string(256), projectId: string(256) }, ["canvasId", "projectId"]);
var modality = enumString(["text", "image", "video", "audio"]);
var inputRole = enumString(["text", "reference_image", "reference_video", "first_frame", "last_frame", "audio"]);
var stringList = (maximum = 1000) => array(string(), maximum);
var availability = union(object({
  available: literal(true),
  catalogVersion: string(64),
  contractSince: string(64),
  id: string(128),
  since: string(64)
}, ["available", "catalogVersion", "contractSince", "id", "since"]), object({
  available: literal(false),
  contractSince: string(64),
  id: string(128),
  reason: enumString([
    "unsupported-host",
    "not-declared",
    "permission-denied",
    "wrong-surface",
    "missing-context",
    "setup-required",
    "disabled",
    "recovering"
  ]),
  recoverable: bool,
  since: string(64)
}, ["available", "id", "reason", "recoverable"]));
var hostNode = object({
  data: jsonObject(),
  id: string(),
  parentId: string(),
  position: point,
  style: jsonObject(),
  type: string(80)
}, ["data", "id", "position", "type"]);
var generationReference = object({ inputKey: string(), role: inputRole }, ["inputKey", "role"]);
var nodeQuery = object({
  ids: stringList(),
  kinds: stringList(),
  limit: integer,
  relatedToNodeIds: stringList(),
  text: string(2000, { allowEmpty: true })
}, []);
var connection = object({
  animated: bool,
  id: string(),
  source: string(),
  target: string(),
  type: string(80)
}, ["source", "target"]);
var geometryUpdate = object({ nodeId: string(), position: point, size }, ["nodeId", "position"]);
var autoLayoutOptions = object({
  componentGap: finite,
  componentPackingScale: finite,
  crossGap: finite,
  isolatedPlacement: enumString(["left", "preserve"]),
  mainGap: finite,
  nodeGap: finite,
  nodePackingScale: finite,
  strategy: enumString(["component-packing", "horizontal-directed-cluster", "vertical-directed-cluster"])
}, []);
var transactionCommand = union(object({ edgeIds: stringList(), nodeIds: stringList(), type: literal("elements.remove") }, ["type"]), object({
  direction: enumString(["left", "center", "right", "top", "middle", "bottom"]),
  nodeIds: stringList(),
  type: literal("nodes.align")
}, ["direction", "nodeIds", "type"]), object({ connection, type: literal("nodes.connect") }, ["connection", "type"]), object({
  axis: enumString(["horizontal", "vertical"]),
  nodeIds: stringList(),
  type: literal("nodes.distribute")
}, ["axis", "nodeIds", "type"]), object({ label: string(512), nodeIds: stringList(), type: literal("nodes.group") }, ["nodeIds", "type"]), object({
  gap: finite,
  layout: enumString(["grid", "horizontal", "vertical"]),
  nodeIds: stringList(),
  type: literal("nodes.layout")
}, ["nodeIds", "type"]), object({ delta: point, nodeIds: stringList(), type: literal("nodes.move") }, ["delta", "nodeIds", "type"]), object({ type: literal("nodes.setGeometry"), updates: array(geometryUpdate, 1000) }, ["type", "updates"]), object({ nodeId: string(), type: literal("nodes.ungroup") }, ["nodeId", "type"]), object({ nodeIds: stringList(), options: autoLayoutOptions, type: literal("canvas.auto-layout") }, ["type"]));
var connectedInput = object({
  durationMs: finite,
  height: finite,
  inputKey: string(),
  kind: string(80),
  label: string(512),
  mediaRevision: string(512),
  mimeType: string(512),
  name: string(512),
  status: enumString(["error", "idle", "pending"]),
  width: finite
}, ["inputKey", "kind", "label"]);
var connectedImageProbe = object({
  contentRevision: string(64, { refinement: "lowercase-sha256" }),
  height: boundedPositiveInteger(maximumPluginApiConnectedImageDimension),
  kind: literal("image"),
  mimeType: enumString(["image/jpeg", "image/png", "image/webp"]),
  size: boundedPositiveInteger(maximumPluginApiConnectedImageBytes),
  width: boundedPositiveInteger(maximumPluginApiConnectedImageDimension)
}, ["contentRevision", "height", "kind", "mimeType", "size", "width"], [{ fields: ["width", "height"], maximum: maximumPluginApiConnectedImagePixels }]);
var generationTool = object({
  acceptedInputs: array(inputRole, 6),
  description: string(2000),
  id: string(256),
  kind: enumString(["model", "operation"]),
  output: modality,
  title: string(120)
}, ["acceptedInputs", "description", "id", "kind", "output", "title"]);
var edge = object({ id: string(), source: string(), target: string() }, ["id", "source", "target"]);
var geometryNode = object({
  id: string(),
  kind: string(80),
  label: string(512),
  parentId: string(64 * KiB, { allowEmpty: true }),
  position: point,
  size,
  type: string(64 * KiB, { allowEmpty: true })
}, ["id", "kind", "label", "position", "size"]);
var structureNode = object({
  description: string(64 * KiB, { allowEmpty: true }),
  durationMs: finite,
  id: string(),
  kind: string(80),
  label: string(512),
  mimeType: string(64 * KiB, { allowEmpty: true }),
  name: string(64 * KiB, { allowEmpty: true }),
  parentId: string(64 * KiB, { allowEmpty: true }),
  position: point,
  resource: object({ kind: literal("project-file"), path: string(1024) }, ["kind", "path"]),
  size,
  status: string(64 * KiB, { allowEmpty: true }),
  text: string(64 * KiB, { allowEmpty: true }),
  type: string(64 * KiB, { allowEmpty: true })
}, ["id", "kind", "label", "position", "size"]);
var geometryDocument = object({
  edges: array(edge, 1e4),
  id: string(256),
  nodes: array(geometryNode, 1e4),
  title: string(512)
}, ["edges", "id", "nodes", "title"]);
var structureDocument = object({
  description: string(8000, { allowEmpty: true }),
  edges: array(edge, 1e4),
  id: string(256),
  nodes: array(structureNode, 1e4),
  tags: array(string(), 256),
  title: string(512)
}, ["edges", "id", "nodes", "title"]);
var operationReceipt = object({
  actorId: string(43),
  baseFrontierDigest: string(64, { refinement: "lowercase-sha256" }),
  format: literal("convax.canvas-operation-receipt/2"),
  historyMaterialDigest: union(nil, string(64, { refinement: "lowercase-sha256" })),
  intentDigest: string(64, { refinement: "lowercase-sha256" }),
  intentKind: string(256),
  operationId: string(22),
  resultEntities: array(object({
    id: string(256),
    incarnation: string(256),
    kind: enumString(["node", "edge"])
  }, ["id", "incarnation", "kind"]), 1e4),
  semanticRoot: bool
}, [
  "actorId",
  "baseFrontierDigest",
  "format",
  "historyMaterialDigest",
  "intentDigest",
  "intentKind",
  "operationId",
  "resultEntities",
  "semanticRoot"
]);
var nodeSummary = object({
  id: string(),
  incomingNodeIds: stringList(),
  kind: string(80),
  label: string(512),
  outgoingNodeIds: stringList(),
  parentId: string(64 * KiB, { allowEmpty: true }),
  position: point,
  text: string(64 * KiB, { allowEmpty: true }),
  type: string(64 * KiB, { allowEmpty: true })
}, ["id", "incomingNodeIds", "kind", "label", "outgoingNodeIds", "position"]);
var hostContextResult = object({
  canvas: object({ id: string(256), name: string(512) }, ["id"]),
  hostApi: object({ availability: array(availability, 256, 0, "id"), catalogVersion: string(64) }, [
    "availability",
    "catalogVersion"
  ]),
  node: hostNode,
  plugin: object({ id: string(128), name: string(512), version: string(128) }, ["id", "name", "version"]),
  project: object({ id: string(256), name: string(512) }, ["id"])
}, ["canvas", "hostApi", "node", "plugin", "project"]);
var contract = (request, result, limits = {}) => ({
  dialect: pluginApiWireSchemaDialect,
  request: { maxBytes: limits.request ?? 64 * KiB, schema: request },
  result: { maxBytes: limits.result ?? 64 * KiB, schema: result }
});
var pluginApiWireContracts = Object.freeze({
  "host.context.get": contract(none, hostContextResult, { result: MiB }),
  "canvas.inputs.list": contract(none, object({ inputs: array(connectedInput, 256) }, ["inputs"]), {
    result: MiB
  }),
  "canvas.inputs.image.open": contract(object({ inputKey: string() }, ["inputKey"]), object({
    probe: connectedImageProbe,
    sessionId: string(128),
    url: string(2048, { prefix: "convax-connected-media://" })
  }, ["probe", "sessionId", "url"])),
  "canvas.inputs.image.close": contract(object({ sessionId: string(128) }, ["sessionId"]), object({ closed: bool }, ["closed"])),
  "canvas.inputs.open": contract(object({ inputKey: string() }, ["inputKey"]), object({
    probe: object({
      duration: object({ estimated: bool, milliseconds: finite }, ["estimated", "milliseconds"]),
      height: finite,
      kind: enumString(["audio", "video"]),
      mediaRevision: string(128),
      mimeType: string(256),
      size: finite,
      width: finite
    }, ["duration", "kind", "mediaRevision", "mimeType", "size"]),
    sessionId: string(128),
    url: string(2048, { prefix: "convax-connected-media://" })
  }, ["probe", "sessionId", "url"])),
  "canvas.inputs.close": contract(object({ sessionId: string(128) }, ["sessionId"]), object({ closed: bool }, ["closed"])),
  "canvas.node.get": contract(none, hostNode, { result: MiB }),
  "canvas.node.state.replace": contract(object({ state: jsonObject(256 * KiB) }, ["state"]), object({ operationReceipt, projection: hostNode, updated: literal(true) }, [
    "operationReceipt",
    "projection",
    "updated"
  ]), { request: 256 * KiB + 4 * KiB }),
  "canvas.resource.image.create": contract(object({
    dataUrl: string(24 * MiB, { prefix: "data:image/png;base64," }),
    name: string(120, { refinement: "safe-png-file-name" })
  }, ["dataUrl", "name"]), object({ createdNodeId: string(), operationReceipt, projection: structureDocument }, [
    "createdNodeId",
    "operationReceipt",
    "projection"
  ]), { request: 24 * MiB + 4 * KiB }),
  "project.file.text.read": contract(object({ path: string(1024, { refinement: "portable-project-relative-path" }) }, ["path"]), object({
    content: string(MiB, { allowEmpty: true }),
    exists: bool,
    path: string(1024, { refinement: "portable-project-relative-path" })
  }, ["content", "exists", "path"]), { result: MiB + 4 * KiB }),
  "agent.prompt": contract(object({ text: string(20000, { refinement: "trimmed" }) }, ["text"]), object({ text: string(64 * KiB, { allowEmpty: true }) }, ["text"])),
  "generation.tools.list": contract(union(none, object({ output: modality }, [])), object({ tools: array(generationTool, 256) }, ["tools"]), { result: MiB }),
  "generation.execute": contract(object({
    output: modality,
    prompt: string(20000, { refinement: "trimmed" }),
    references: array(generationReference, 32),
    resultMode: enumString(["create-pending-node", "return"]),
    toolId: string(256)
  }, ["prompt"]), object({
    createdNodeIds: array(string(), 32),
    outputText: string(64 * KiB, { allowEmpty: true }),
    operationReceipt: union(nil, operationReceipt),
    projection: union(nil, structureDocument),
    toolId: string(256),
    warnings: array(string(), 32)
  }, ["createdNodeIds", "operationReceipt", "projection", "toolId", "warnings"]), { result: 256 * KiB }),
  "projects.list": contract(none, object({
    projects: array(object({ available: bool, id: string(256), name: string(512) }, ["available", "id", "name"]), 1000)
  }, ["projects"]), { result: MiB }),
  "canvas.catalog.list": contract(object({ projectId: string(256) }, ["projectId"]), object({
    canvases: array(object({ id: string(256), name: string(512) }, ["id", "name"]), 1e4),
    projectId: string(256)
  }, ["canvases", "projectId"]), { result: 8 * MiB }),
  "canvas.document.get": contract(object({ projection: enumString(["geometry", "structure"]), ref: canvasRef }, ["ref"]), union(object({
    document: geometryDocument,
    projection: literal("geometry"),
    ref: canvasRef
  }, ["document", "projection", "ref"]), object({
    document: structureDocument,
    projection: literal("structure"),
    ref: canvasRef
  }, ["document", "projection", "ref"])), { result: 8 * MiB }),
  "canvas.nodes.query": contract(object({ query: nodeQuery, ref: canvasRef }, ["ref"]), object({
    nodes: array(nodeSummary, 1000),
    projection: structureDocument,
    ref: canvasRef
  }, ["nodes", "projection", "ref"]), { request: MiB, result: 8 * MiB }),
  "canvas.transaction.execute": contract(object({
    command: transactionCommand,
    commandId: string(128),
    ref: canvasRef
  }, ["command", "commandId", "ref"]), object({
    affectedNodeIds: stringList(1e4),
    changed: bool,
    createdNodeIds: stringList(1e4),
    operationReceipt,
    projection: structureDocument,
    ref: canvasRef,
    summaryTruncated: bool,
    warnings: stringList()
  }, ["affectedNodeIds", "changed", "createdNodeIds", "operationReceipt", "projection", "ref", "warnings"]), { request: MiB, result: 2 * MiB }),
  "canvas.events.subscribe": contract(object({ ref: object({ canvasId: string(256), projectId: string(256) }, ["projectId"]) }, ["ref"]), object({ subscriptionId: string(128) }, ["subscriptionId"])),
  "canvas.events.unsubscribe": contract(object({ subscriptionId: string(128) }, ["subscriptionId"]), object({ removed: bool }, ["removed"]))
});
var maximumPluginApiRequestBytes = Math.max(...Object.values(pluginApiWireContracts).map(({ request }) => request.maxBytes));
var maximumPluginApiResultBytes = Math.max(...Object.values(pluginApiWireContracts).map(({ result }) => result.maxBytes));
function getPluginApiWireContract(id) {
  return pluginApiWireContracts[id];
}

// src/method-contracts.ts
function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
  return value;
}
var windowsReservedName = /^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]|CONIN\$|CONOUT\$)$/iu;
function hasOnlyUnicodeScalars(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 55296 && codePoint <= 57343)
      return false;
  }
  return true;
}
function isPortableNameSegment(value) {
  const stem = value.split(".", 1)[0] ?? "";
  return Boolean(value && value !== "." && value !== ".." && hasOnlyUnicodeScalars(value) && !/[\\/:*?"<>|\u0000-\u001f\u007f]/u.test(value) && !/[. ]$/u.test(value) && !windowsReservedName.test(stem));
}
function satisfiesStringRefinement(value, refinement) {
  if (refinement === undefined)
    return true;
  if (refinement === "lowercase-sha256")
    return /^[a-f0-9]{64}$/u.test(value);
  if (refinement === "trimmed")
    return value === value.trim();
  if (refinement === "safe-png-file-name") {
    return value === value.trim() && value.toLowerCase().endsWith(".png") && isPortableNameSegment(value);
  }
  if (refinement === "portable-project-relative-path") {
    if (value !== value.trim() || value.includes("\\") || value.startsWith("/") || value.startsWith("//") || /^[A-Za-z]:/u.test(value) || !hasOnlyUnicodeScalars(value)) {
      return false;
    }
    const segments = value.split("/");
    return segments[0]?.toLowerCase() !== ".convax" && segments.length > 0 && segments.every((segment) => isPortableNameSegment(segment));
  }
  return false;
}
function json(value, schema, label) {
  const seen = new Set;
  const visit = (entry, path, depth) => {
    if (entry === null || typeof entry === "string" || typeof entry === "boolean")
      return entry;
    if (typeof entry === "number") {
      if (!Number.isFinite(entry))
        throw new TypeError(`${path} must contain finite JSON numbers`);
      return entry;
    }
    if (!entry || typeof entry !== "object" || depth >= schema.maxDepth || seen.has(entry)) {
      throw new TypeError(`${path} must be bounded acyclic JSON`);
    }
    const prototype = Object.getPrototypeOf(entry);
    if (!Array.isArray(entry) && prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain plain JSON objects`);
    }
    seen.add(entry);
    let parsed;
    if (Array.isArray(entry)) {
      parsed = entry.map((item, index) => visit(item, `${path}[${index}]`, depth + 1));
    } else {
      const fields = Object.create(null);
      for (const [key, item] of Object.entries(entry)) {
        if (key.length < 1 || key.length > schema.keyMaxLength || /[\u0000-\u001f\u007f]/u.test(key)) {
          throw new TypeError(`${path} key is invalid`);
        }
        fields[key] = visit(item, `${path}.${key}`, depth + 1);
      }
      parsed = fields;
    }
    seen.delete(entry);
    return parsed;
  };
  const result = visit(record(value, label), label, 0);
  if (Array.isArray(result) || !result || typeof result !== "object") {
    throw new TypeError(`${label} must be an object`);
  }
  const serialized = JSON.stringify(result);
  if (new TextEncoder().encode(serialized).byteLength > schema.maxBytes) {
    throw new TypeError(`${label} exceeds ${schema.maxBytes} bytes`);
  }
  return result;
}
function enforceProductConstraints(value, products, label) {
  for (const constraint of products ?? []) {
    let product = 1;
    for (const field of constraint.fields) {
      const factor = value[field];
      if (typeof factor !== "number" || !Number.isFinite(factor) || factor < 0) {
        throw new TypeError(`${label}.${field} must be a non-negative finite product factor`);
      }
      if (factor !== 0 && product > constraint.maximum / factor) {
        throw new TypeError(`${label} must satisfy its numeric product limits`);
      }
      product *= factor;
    }
    if (product > constraint.maximum) {
      throw new TypeError(`${label} must satisfy its numeric product limits`);
    }
  }
  return value;
}
function parsePluginApiSchema(schema, value, label = "Plugin API value") {
  if ("oneOf" in schema) {
    const matches = [];
    for (const candidate of schema.oneOf) {
      try {
        matches.push(parsePluginApiSchema(candidate, value, label));
      } catch {}
    }
    if (matches.length !== 1)
      throw new TypeError(`${label} must match exactly one schema variant`);
    return matches[0];
  }
  if ("const" in schema) {
    if (value !== schema.const)
      throw new TypeError(`${label} must equal ${String(schema.const)}`);
    return value;
  }
  if ("type" in schema && schema.type === "none") {
    if (value !== undefined)
      throw new TypeError(`${label} does not accept a value`);
    return;
  }
  if ("type" in schema && schema.type === "null") {
    if (value !== null)
      throw new TypeError(`${label} must be null`);
    return null;
  }
  if ("type" in schema && schema.type === "boolean") {
    if (typeof value !== "boolean")
      throw new TypeError(`${label} must be boolean`);
    return value;
  }
  if ("type" in schema && (schema.type === "number" || schema.type === "integer")) {
    if (typeof value !== "number" || !Number.isFinite(value) || schema.type === "integer" && !Number.isSafeInteger(value) || schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum) {
      throw new TypeError(`${label} must be a valid ${schema.type}`);
    }
    return value;
  }
  if ("type" in schema && schema.type === "string") {
    if (typeof value !== "string" || value.length < schema.minLength || value.length > schema.maxLength || schema.controlCharacters === false && /[\u0000-\u001f\u007f]/u.test(value) || schema.enum !== undefined && !schema.enum.includes(value) || schema.prefix !== undefined && !value.startsWith(schema.prefix) || !satisfiesStringRefinement(value, schema.refinement)) {
      throw new TypeError(`${label} must satisfy its bounded string contract`);
    }
    return value;
  }
  if ("type" in schema && schema.type === "array") {
    if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) {
      throw new TypeError(`${label} must satisfy its bounded array contract`);
    }
    const parsed2 = value.map((entry, index) => parsePluginApiSchema(schema.items, entry, `${label}[${index}]`));
    if (schema.uniqueBy !== undefined) {
      const identities = parsed2.map((entry) => {
        const item = record(entry, `${label} unique item`);
        const identity = item[schema.uniqueBy];
        if (typeof identity !== "string" && typeof identity !== "number") {
          throw new TypeError(`${label} unique identity is invalid`);
        }
        return `${typeof identity}:${String(identity)}`;
      });
      if (new Set(identities).size !== identities.length) {
        throw new TypeError(`${label} contains duplicate ${schema.uniqueBy}`);
      }
    }
    return parsed2;
  }
  if ("type" in schema && schema.type === "json-object")
    return json(value, schema, label);
  if (!("properties" in schema))
    throw new TypeError(`${label} has an unsupported schema`);
  const input = record(value, label);
  const admitted = new Set(Object.keys(schema.properties));
  if (schema.required.some((key) => !Object.prototype.hasOwnProperty.call(input, key)) || Object.keys(input).some((key) => !admitted.has(key))) {
    throw new TypeError(`${label} contains unsupported or missing fields`);
  }
  const parsed = Object.fromEntries(Object.entries(input).map(([key, entry]) => [
    key,
    parsePluginApiSchema(schema.properties[key], entry, `${label}.${key}`)
  ]));
  return enforceProductConstraints(parsed, schema.products, label);
}
function objectShape(schema, label) {
  if ("oneOf" in schema) {
    const variants = schema.oneOf.map((entry) => objectShape(entry, label));
    const objectVariants = variants.filter((entry) => entry.type === "object");
    if (objectVariants.length === 0 && variants.some((entry) => entry.type === "none"))
      return { type: "none" };
    if (objectVariants.length === 0)
      throw new TypeError(`${label} is not an object schema`);
    const keys = new Set(objectVariants.flatMap(({ required: required2, optional }) => [...required2, ...optional]));
    const required = [...keys].filter((key) => objectVariants.every((entry) => entry.required.includes(key))).sort();
    return {
      additionalProperties: false,
      optional: [...keys].filter((key) => !required.includes(key)).sort(),
      required,
      type: "object"
    };
  }
  if ("type" in schema && schema.type === "none")
    return { type: "none" };
  if (!("properties" in schema))
    throw new TypeError(`${label} is not an object schema`);
  return {
    additionalProperties: false,
    optional: Object.keys(schema.properties).filter((key) => !schema.required.includes(key)).sort(),
    required: [...schema.required].sort(),
    type: "object"
  };
}
var pluginApiContractIds = Object.freeze(Object.keys(pluginApiWireContracts).sort());
var pluginApiMethodContracts = Object.freeze(Object.fromEntries(pluginApiContractIds.map((id) => {
  const wire = pluginApiWireContracts[id];
  const result = objectShape(wire.result.schema, `Plugin API ${id} result`);
  if (result.type !== "object")
    throw new TypeError(`Plugin API ${id} result must be an object`);
  return [
    id,
    {
      dialect: wire.dialect,
      params: objectShape(wire.request.schema, `Plugin API ${id} params`),
      request: wire.request,
      response: wire.result,
      result
    }
  ];
})));
function parsePluginApiParams(id, value) {
  return parsePluginApiSchema(pluginApiWireContracts[id].request.schema, value, `Plugin API ${id} params`);
}
function parsePluginApiResult(id, value) {
  return parsePluginApiSchema(pluginApiWireContracts[id].result.schema, value, `Plugin API ${id} result`);
}
function parsePluginApiCall(value) {
  const input = record(value, "Plugin API call");
  if (!Object.prototype.hasOwnProperty.call(input, "method") || Object.keys(input).some((key) => key !== "method" && key !== "params") || typeof input.method !== "string" || !pluginApiContractIds.includes(input.method)) {
    throw new TypeError(`Unknown or invalid Plugin API call: ${String(input.method)}`);
  }
  const method = input.method;
  const params = parsePluginApiParams(method, input.params);
  return {
    method,
    ...params === undefined ? {} : { params }
  };
}

// src/catalog.ts
var contextErrors = [
  {
    code: "stale-context",
    description: "The bound Project, Canvas, node, or connection changed before the call completed.",
    recoverable: true
  }
];
var permissionErrors = [
  {
    code: "permission-denied",
    description: "The installed Plugin principal does not currently hold the required grant.",
    recoverable: false
  }
];
var resourceErrors = [
  {
    code: "resource-unavailable",
    description: "The authoritative Project resource is missing, changed, or cannot be read safely.",
    recoverable: true
  }
];
var partialSuccessErrors = [
  {
    code: "partial-success",
    description: "A user-visible Project file was published, but the requested Canvas commit did not complete; retry is unsafe.",
    recoverable: false
  }
];
var defineV2Contract = (definition) => definePluginApi({
  ...definition,
  contractSince: "2.0.0"
});
var defineV3Contract = (definition) => definePluginApi({
  ...definition,
  contractSince: "3.0.0"
});
var pluginApiCatalog = definePluginApiCatalog(definePluginApiRelease("1.0.0", [
  defineV3Contract({
    id: "host.context.get",
    completion: "cancelable",
    grant: null,
    scope: "connection",
    sideEffect: "read",
    errors: contextErrors,
    docs: {
      summary: "Read the bounded context attached to the current Plugin connection.",
      description: "Returns only renderer-safe identifiers and feature metadata for the exact live connection; it grants no additional authority.",
      request: "No parameters.",
      response: "The current Plugin, Project, Canvas, node, and negotiated Host API context when present."
    }
  }),
  defineV2Contract({
    id: "canvas.inputs.list",
    completion: "cancelable",
    grant: "canvas.connectedInputs.read",
    scope: "own-node",
    sideEffect: "read",
    errors: [...contextErrors, ...permissionErrors],
    docs: {
      summary: "List direct incoming inputs of the owning Plugin node.",
      description: "Derives pathless input metadata from authoritative direct incoming Canvas edges and never reads resource bytes.",
      request: "No parameters; the owning node comes from the bound connection.",
      response: "A bounded list of direct incoming input descriptors and opaque input keys."
    }
  }),
  defineV2Contract({
    id: "canvas.inputs.open",
    completion: "cancelable",
    grant: "canvas.connectedMedia.stream",
    scope: "own-node",
    sideEffect: "read",
    errors: [...contextErrors, ...permissionErrors, ...resourceErrors],
    docs: {
      summary: "Open a bounded stream for one previously listed direct input.",
      description: "Opens host-owned access to the exact authoritative input after topology and resource identity are revalidated.",
      request: "`{ inputKey }`, using an opaque key returned by canvas.inputs.list.",
      response: "A connection-bound stream descriptor and safe media metadata.",
      remarks: "Call canvas.inputs.close when the stream is no longer needed."
    }
  }),
  defineV2Contract({
    id: "canvas.inputs.close",
    completion: "cancelable",
    grant: "canvas.connectedMedia.stream",
    scope: "own-node",
    sideEffect: "write",
    errors: [...contextErrors, ...permissionErrors],
    docs: {
      summary: "Close one connection-bound input stream.",
      description: "Releases a stream created by canvas.inputs.open without changing Canvas or Project state.",
      request: "The stream handle returned by canvas.inputs.open.",
      response: "An acknowledgement; closing an already closed handle is idempotent."
    }
  }),
  defineV3Contract({
    id: "canvas.node.get",
    completion: "cancelable",
    grant: "canvas.node.read",
    scope: "own-node",
    sideEffect: "read",
    errors: [...contextErrors, ...permissionErrors],
    docs: {
      summary: "Read the owning Plugin node projection.",
      description: "Returns a bounded renderer-safe projection of the exact node bound to the connection.",
      request: "No parameters; the owning node comes from the bound connection.",
      response: "The owning node identity, geometry, and Plugin state projection."
    }
  }),
  defineV3Contract({
    id: "canvas.node.state.replace",
    completion: "commit-preserving",
    grant: "canvas.node.write",
    scope: "own-node",
    sideEffect: "write",
    errors: [...contextErrors, ...permissionErrors, ...resourceErrors],
    docs: {
      summary: "Replace the owning node's bounded Plugin state.",
      description: "Commits only the namespaced Plugin state through one Canvas-owned semantic intent guarded by the current node incarnation.",
      request: "`{ state }`, where state is a bounded JSON value.",
      response: "The durable operation receipt and current owning-node projection after the replacement commits."
    }
  }),
  defineV3Contract({
    id: "canvas.resource.image.create",
    completion: "commit-preserving",
    grant: "canvas.image.write",
    scope: "own-node",
    sideEffect: "write",
    errors: [...contextErrors, ...permissionErrors, ...partialSuccessErrors],
    docs: {
      summary: "Create a Project-backed Canvas image through the host lifecycle.",
      description: "Admits bounded image content as a user-visible Project resource and commits its Canvas reference without exposing native paths.",
      request: "`{ dataUrl, name }`, containing a bounded validated image data URL and safe file name.",
      response: "The created renderer-safe image result after Project publication and Canvas commit."
    }
  }),
  defineV2Contract({
    id: "project.file.text.read",
    completion: "cancelable",
    grant: "project.files.read",
    scope: "project",
    sideEffect: "read",
    errors: [...contextErrors, ...permissionErrors],
    docs: {
      summary: "Read one bounded UTF-8 Project file.",
      description: "Reads through the scoped Project Files capability using a normalized Project-relative path and never exposes a native path.",
      request: "`{ path }`, using a normalized Project-relative portable path.",
      response: "The bounded UTF-8 file text."
    }
  }),
  defineV2Contract({
    id: "agent.prompt",
    completion: "commit-preserving",
    grant: "agent.prompt",
    scope: "connection",
    sideEffect: "execute",
    errors: [...contextErrors, ...permissionErrors],
    docs: {
      summary: "Submit a bounded prompt through the host Agent capability.",
      description: "Uses the current host-owned Agent context; it does not grant direct OpenCode, filesystem, model, or credential access.",
      request: "`{ text }`, containing the bounded prompt text.",
      response: "`{ text }`, containing the bounded host acknowledgement."
    }
  }),
  defineV2Contract({
    id: "generation.tools.list",
    completion: "cancelable",
    grant: "generation.execute",
    scope: "plugin",
    sideEffect: "read",
    errors: permissionErrors,
    docs: {
      summary: "List generation tools available to the installed Plugin principal.",
      description: "Returns normalized tool metadata derived from active verified contributions without exposing executable paths or credentials.",
      request: "Optional `{ output }` modality filter; omitting params lists every admitted modality.",
      response: "A bounded list of available generation tools and their public input contracts."
    }
  }),
  defineV3Contract({
    id: "generation.execute",
    completion: "commit-preserving",
    grant: "generation.execute",
    scope: "plugin",
    sideEffect: "execute",
    errors: [...contextErrors, ...permissionErrors, ...resourceErrors, ...partialSuccessErrors],
    docs: {
      summary: "Execute one selected generation tool through the shared host executor.",
      description: "Revalidates the active Plugin, authorized executable, inputs, cancellation, and live resource guards immediately before execution.",
      request: "`{ output?, prompt, references?: Array<{ inputKey, role }>, resultMode?, toolId? }`; every opaque input key must come from the current owning node's canvas.inputs.list result.",
      response: "The bounded selected tool result, created node ids, optional committed operation receipt/projection, and warnings."
    }
  }),
  defineV2Contract({
    id: "projects.list",
    completion: "cancelable",
    audience: ["web-plugin", "companion"],
    grant: "projects.read",
    scope: "plugin",
    sideEffect: "read",
    errors: permissionErrors,
    docs: {
      summary: "List Projects visible to the installed Plugin principal.",
      description: "Returns portable Project identities and display metadata without native paths or private Project state.",
      request: "No parameters.",
      response: "A bounded list of renderer-safe Project summaries."
    }
  }),
  defineV3Contract({
    id: "canvas.catalog.list",
    completion: "cancelable",
    audience: ["web-plugin", "companion"],
    grant: "canvas.catalog.read",
    scope: "project",
    sideEffect: "read",
    errors: [...contextErrors, ...permissionErrors],
    docs: {
      summary: "List Canvas catalog entries for one authorized Project.",
      description: "Reads the Project-owned Canvas catalog without selecting a Project or Canvas in the Workbench.",
      request: "`{ projectId }`, naming one explicit portable Project.",
      response: "A bounded list of portable Canvas catalog entries."
    }
  }),
  defineV3Contract({
    id: "canvas.document.get",
    completion: "cancelable",
    audience: ["web-plugin", "companion"],
    grant: "canvas.document.read",
    scope: "canvas",
    sideEffect: "read",
    errors: [...contextErrors, ...permissionErrors],
    docs: {
      summary: "Read one authorized Canvas document projection.",
      description: "Returns a bounded portable structure or geometry projection from Main's authoritative Canvas application service.",
      request: "`{ ref, projection }`, using an explicit portable Project/Canvas reference and supported projection.",
      response: "The requested pathless document projection."
    }
  }),
  defineV3Contract({
    id: "canvas.nodes.query",
    completion: "cancelable",
    audience: ["web-plugin", "companion"],
    grant: "canvas.document.read",
    scope: "canvas",
    sideEffect: "read",
    errors: [...contextErrors, ...permissionErrors],
    docs: {
      summary: "Query bounded node projections in one authorized Canvas.",
      description: "Executes a host-defined bounded query without exposing native paths or resource bytes.",
      request: "`{ ref, query }`, using an explicit portable Project/Canvas reference and bounded query.",
      response: "Matching node summaries and the current pathless Canvas projection."
    }
  }),
  defineV3Contract({
    id: "canvas.transaction.execute",
    completion: "commit-preserving",
    audience: ["web-plugin", "companion"],
    grant: "canvas.document.write",
    scope: "canvas",
    sideEffect: "write",
    errors: [...contextErrors, ...permissionErrors],
    docs: {
      summary: "Commit one closed Canvas command through the authoritative application service.",
      description: "Maps one bounded command to a Canvas-owned semantic intent, commits it atomically, and returns its durable operation identity.",
      request: "`{ ref, command, commandId }` with one bounded closed command and an idempotency key.",
      response: "The durable operation receipt, current pathless projection, and bounded command result."
    }
  }),
  defineV2Contract({
    id: "canvas.events.subscribe",
    completion: "cancelable",
    audience: ["web-plugin", "companion"],
    grant: "canvas.events.subscribe",
    scope: "canvas",
    sideEffect: "subscribe",
    errors: [...contextErrors, ...permissionErrors],
    docs: {
      summary: "Subscribe to bounded events for one authorized Canvas.",
      description: "Creates a connection-scoped subscription; events carry operation receipts as invalidations or safe projections, never native data.",
      request: "`{ ref }`, using an explicit portable Project/Canvas reference.",
      response: "A connection-bound subscription identifier."
    }
  }),
  defineV2Contract({
    id: "canvas.events.unsubscribe",
    completion: "cancelable",
    audience: ["web-plugin", "companion"],
    grant: "canvas.events.subscribe",
    scope: "canvas",
    sideEffect: "subscribe",
    errors: [...contextErrors, ...permissionErrors],
    docs: {
      summary: "Close one connection-bound Canvas event subscription.",
      description: "Releases a subscription created by canvas.events.subscribe without changing Canvas state.",
      request: "The subscription identifier returned by canvas.events.subscribe.",
      response: "An acknowledgement; closing an already closed subscription is idempotent."
    }
  })
]), definePluginApiRelease("2.0.0", [
  defineV2Contract({
    id: "canvas.inputs.image.open",
    completion: "cancelable",
    grant: "canvas.connectedImages.read",
    scope: "own-node",
    sideEffect: "read",
    errors: [...contextErrors, ...permissionErrors, ...resourceErrors],
    docs: {
      summary: "Open one directly connected image through the owning Plugin node.",
      description: "Issues a revocable Host-owned session for signature-validated JPEG, PNG, or WebP content after validating the Plugin principal, owning node, direct edge, resource identity, and image limits. Every protocol read revalidates the issued principal and direct edge against current Host state.",
      request: "`{ inputKey }`, using an opaque image key returned by canvas.inputs.list.",
      response: "A connection-issued, revocable session with an opaque 128-bit bearer URL, bounded image probe, and lowercase SHA-256 content revision.",
      remarks: "Electron protocol GET/HEAD requests have no trusted sender or frame principal. Possession of the convax-connected-media URL therefore carries bearer authority until the Host revokes the session or its principal/edge revalidation fails; the URL must be kept secret and closed promptly. The response contains no image bytes, native path, or unrestricted URL. The Host rejects images above 16 MiB, dimensions above 8192 pixels, or more than 33,554,432 pixels."
    }
  }),
  defineV2Contract({
    id: "canvas.inputs.image.close",
    completion: "cancelable",
    grant: "canvas.connectedImages.read",
    scope: "own-node",
    sideEffect: "write",
    errors: [...contextErrors, ...permissionErrors],
    docs: {
      summary: "Close one revocable connected-image bearer session.",
      description: "Revokes a session and bearer URL created by canvas.inputs.image.open after validating the calling Plugin principal, without changing Canvas or Project state.",
      request: "`{ sessionId }`, using the opaque handle returned by canvas.inputs.image.open.",
      response: "An acknowledgement that the caller's image session is closed; repeated close calls are idempotent."
    }
  })
]), definePluginApiRelease("3.0.0", []));
var catalogIds = pluginApiCatalog.apis.map(({ id }) => id).sort();
if (catalogIds.length !== pluginApiContractIds.length || catalogIds.some((id, index) => id !== pluginApiContractIds[index])) {
  throw new TypeError("Plugin API Catalog and portable method contracts are incomplete or inconsistent");
}
var PLUGIN_API_CATALOG_VERSION = pluginApiCatalog.version;
var PLUGIN_API_CATALOG_MAJOR = Number(PLUGIN_API_CATALOG_VERSION.split(".")[0]);
var pluginApiDefinitionsById = new Map(pluginApiCatalog.apis.map((definition) => [definition.id, definition]));
var pluginApiIds = new Set(pluginApiDefinitionsById.keys());
function isPluginApiId(value) {
  return typeof value === "string" && pluginApiIds.has(value);
}
function getPluginApiDefinition(id) {
  return pluginApiDefinitionsById.get(id);
}
function isPluginApiCommitPreserving(id) {
  return getPluginApiDefinition(id).completion === "commit-preserving";
}
// src/catalog-artifact.ts
var PLUGIN_API_CATALOG_ARTIFACT_SCHEMA = "convax.plugin-api-catalog/3";
// src/declaration.ts
var API_ID2 = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseRuntimeIdList(value, label) {
  if (!Array.isArray(value))
    throw new TypeError(`${label} must be an array`);
  const result = [];
  const seen = new Set;
  for (const candidate of value) {
    if (typeof candidate !== "string" || !API_ID2.test(candidate)) {
      throw new TypeError(`${label} contains an invalid Plugin API id: ${String(candidate)}`);
    }
    if (seen.has(candidate))
      throw new TypeError(`${label} contains a duplicate Plugin API id: ${candidate}`);
    seen.add(candidate);
    result.push(candidate);
  }
  return result;
}
function definePluginApiDeclaration(declaration) {
  return parsePluginApiDeclaration(declaration);
}
function parsePluginApiDeclaration(value) {
  const declaration = parseRuntimePluginApiDeclaration(value);
  const required = [];
  const optional = [];
  for (const id of declaration.required) {
    if (!isPluginApiId(id))
      throw new TypeError(`Plugin API declaration contains an unknown Plugin API id: ${id}`);
    required.push(id);
  }
  for (const id of declaration.optional) {
    if (!isPluginApiId(id))
      throw new TypeError(`Plugin API declaration contains an unknown Plugin API id: ${id}`);
    optional.push(id);
  }
  return Object.freeze({
    major: PLUGIN_API_CATALOG_MAJOR,
    required: Object.freeze(required),
    optional: Object.freeze(optional)
  });
}
function parseRuntimePluginApiDeclaration(value) {
  if (!isRecord(value))
    throw new TypeError("Plugin API declaration must be an object");
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "major" && key !== "required" && key !== "optional")) {
    throw new TypeError("Plugin API declaration contains an unknown field");
  }
  if (value.major !== PLUGIN_API_CATALOG_MAJOR) {
    throw new TypeError(`Plugin API declaration major must be ${PLUGIN_API_CATALOG_MAJOR}`);
  }
  const required = parseRuntimeIdList(value.required, "Plugin API declaration required");
  const optional = parseRuntimeIdList(value.optional, "Plugin API declaration optional");
  const requiredIds = new Set(required);
  const overlap = optional.find((id) => requiredIds.has(id));
  if (overlap)
    throw new TypeError(`Plugin API cannot be both required and optional: ${overlap}`);
  return Object.freeze({
    major: PLUGIN_API_CATALOG_MAJOR,
    required: Object.freeze(required),
    optional: Object.freeze(optional)
  });
}
function getPluginApiRequirement(declaration, id) {
  if (declaration.required.includes(id))
    return "required";
  if (declaration.optional.includes(id))
    return "optional";
  return;
}
function isPluginApiDeclared(declaration, id) {
  return getPluginApiRequirement(declaration, id) !== undefined;
}
// src/availability.ts
function compareVersions2(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0;index < 3; index += 1) {
    const comparison = leftParts[index] - rightParts[index];
    if (comparison !== 0)
      return comparison;
  }
  return 0;
}
function unavailable(id, since, contractSince, reason, recoverable) {
  return {
    available: false,
    id,
    ...since ? { since } : {},
    ...contractSince ? { contractSince } : {},
    reason,
    recoverable
  };
}
function evaluatePluginApiAvailability(id, declaration, context) {
  if (!isPluginApiId(id))
    return unavailable(id, undefined, undefined, "unsupported-host", false);
  const definition = getPluginApiDefinition(id);
  if (context.catalogMajor !== PLUGIN_API_CATALOG_MAJOR || declaration.major !== context.catalogMajor || compareVersions2(context.catalogVersion, definition.contractSince) < 0) {
    return unavailable(id, definition.since, definition.contractSince, "unsupported-host", false);
  }
  if (!declaration.required.includes(id) && !declaration.optional.includes(id)) {
    return unavailable(id, definition.since, definition.contractSince, "not-declared", false);
  }
  if (!definition.audience.includes(context.audience)) {
    return unavailable(id, definition.since, definition.contractSince, "wrong-surface", false);
  }
  if (definition.grant !== null && !context.grants.includes(definition.grant)) {
    return unavailable(id, definition.since, definition.contractSince, "permission-denied", false);
  }
  if (!context.hasContext)
    return unavailable(id, definition.since, definition.contractSince, "missing-context", true);
  if (!context.setupComplete)
    return unavailable(id, definition.since, definition.contractSince, "setup-required", true);
  if (context.disabled)
    return unavailable(id, definition.since, definition.contractSince, "disabled", true);
  if (context.recovering)
    return unavailable(id, definition.since, definition.contractSince, "recovering", true);
  return {
    available: true,
    id,
    since: definition.since,
    contractSince: definition.contractSince,
    catalogVersion: context.catalogVersion
  };
}

class PluginApiUnavailableError extends Error {
  availability;
  constructor(availability2) {
    super(`Plugin API ${availability2.id} is unavailable: ${availability2.reason}`);
    this.name = "PluginApiUnavailableError";
    this.availability = availability2;
  }
}
function isPluginApiAvailable(availability2) {
  return availability2.available;
}
function requirePluginApi(availability2) {
  if (!availability2.available)
    throw new PluginApiUnavailableError(availability2);
  return availability2;
}
// src/remote-errors.ts
function isPluginApiErrorCode(id, value) {
  return typeof value === "string" && getPluginApiDefinition(id).errors.some((definition) => definition.code === value);
}
function parsePluginApiRemoteFailure(id, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Plugin API ${id} failure must be an object`);
  }
  const failure = value;
  if (Object.keys(failure).some((key) => !["code", "kind", "message", "recoverable"].includes(key)) || !Object.prototype.hasOwnProperty.call(failure, "code") || !Object.prototype.hasOwnProperty.call(failure, "message") || !Object.prototype.hasOwnProperty.call(failure, "recoverable") || failure.kind !== "api" || !isPluginApiErrorCode(id, failure.code) || typeof failure.message !== "string" || failure.message.length < 1 || failure.message.length > 4096 || typeof failure.recoverable !== "boolean") {
    throw new TypeError(`Plugin API ${id} failure is invalid`);
  }
  const definition = getPluginApiDefinition(id).errors.find(({ code }) => code === failure.code);
  if (failure.recoverable !== definition.recoverable) {
    throw new TypeError(`Plugin API ${id} failure recoverability does not match the Catalog`);
  }
  return Object.freeze({
    code: failure.code,
    kind: "api",
    message: failure.message,
    recoverable: failure.recoverable
  });
}
// src/reference.ts
function escapeCell(value) {
  return value.replaceAll("|", "\\|").replaceAll(`
`, " ");
}
function requireText(value, label) {
  const normalized = value.trim();
  if (normalized.length === 0)
    throw new TypeError(`${label} must not be empty`);
  return normalized;
}
function renderMethodShape(shape) {
  if (shape.type === "none")
    return "`none`";
  const fields = [
    ...shape.required.map((name) => `${name} (required)`),
    ...shape.optional.map((name) => `${name} (optional)`)
  ];
  return fields.length === 0 ? "`{}` (closed object)" : `closed object: ${fields.map((field) => `\`${field}\``).join(", ")}`;
}
function stableContractJson(value) {
  const sort = (entry) => {
    if (Array.isArray(entry))
      return entry.map(sort);
    if (!entry || typeof entry !== "object")
      return entry;
    return Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sort(item)]));
  };
  return JSON.stringify(sort(value), null, 2);
}
function renderPluginApiReference(input) {
  const declaration = parsePluginApiDeclaration({
    major: PLUGIN_API_CATALOG_MAJOR,
    required: input.requiredIds,
    optional: input.optionalIds
  });
  const definitionsById = new Map(pluginApiCatalog.apis.map((definition) => [definition.id, definition]));
  const selected = [
    ...declaration.required.map((id) => ({ id, requirement: "required" })),
    ...declaration.optional.map((id) => ({ id, requirement: "optional" }))
  ].sort((left, right) => left.id.localeCompare(right.id));
  for (const entry of selected) {
    const definition = definitionsById.get(entry.id);
    if (!definition?.audience.includes("agent-skill")) {
      throw new TypeError(`Plugin API ${entry.id} is not callable by agent-skill`);
    }
  }
  const pluginTools = [...input.pluginTools ?? []].map((tool) => {
    if (!/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(tool.id)) {
      throw new TypeError(`Plugin tool id is invalid: ${tool.id}`);
    }
    return {
      id: tool.id,
      summary: requireText(tool.summary, `${tool.id} summary`),
      ...tool.request ? { request: requireText(tool.request, `${tool.id} request`) } : {},
      ...tool.response ? { response: requireText(tool.response, `${tool.id} response`) } : {}
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(pluginTools.map((tool) => tool.id)).size !== pluginTools.length) {
    throw new TypeError("Plugin tool ids must be unique");
  }
  const lines = [
    "<!-- prettier-ignore-start -->",
    "",
    "# Convax capabilities",
    "",
    "<!-- Generated by @convax/plugin-api. Do not edit. -->",
    "",
    `Host API catalog: ${pluginApiCatalog.version}`,
    "",
    "Host API availability is connection-scoped. Required APIs must be available before the workflow starts.",
    "For every optional API, check runtime availability immediately before use and follow its unavailable fallback.",
    "An availability result is not authorization; the Host revalidates grants, scope, context, and active Plugin bytes on every call.",
    ""
  ];
  if (selected.length === 0) {
    lines.push("## Host APIs", "", "This Skill does not call a Convax Host API.", "");
  } else {
    lines.push("## Host APIs", "", "| API | Requirement | Introduced | Current contract | Grant | Scope | Side effect | Completion |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const entry of selected) {
      const definition = definitionsById.get(entry.id);
      lines.push(`| \`${definition.id}\` | ${entry.requirement} | ${definition.since} | ${definition.contractSince} | ${definition.grant ? `\`${definition.grant}\`` : "none"} | ${definition.scope} | ${definition.sideEffect} | ${definition.completion} |`);
    }
    lines.push("");
    for (const entry of selected) {
      const definition = definitionsById.get(entry.id);
      lines.push(`### \`${definition.id}\``, "", definition.docs.summary, "", definition.docs.description, "", `- Requirement: ${entry.requirement}`, `- API introduced: Host API ${definition.since}`, `- Current contract available since: Host API ${definition.contractSince}`, `- Required grant: ${definition.grant ? `\`${definition.grant}\`` : "none"}`, `- Scope: ${definition.scope}`, `- Side effect: ${definition.sideEffect}`, `- Completion: ${definition.completion}`, `- Request: ${definition.docs.request}`, `- Response: ${definition.docs.response}`, `- Request schema: ${renderMethodShape(pluginApiMethodContracts[definition.id].params)}`, `- Response schema: ${renderMethodShape(pluginApiMethodContracts[definition.id].result)}`, `- Request byte limit: ${pluginApiMethodContracts[definition.id].request.maxBytes}`, `- Response byte limit: ${pluginApiMethodContracts[definition.id].response.maxBytes}`, `- Contract dialect: \`${pluginApiMethodContracts[definition.id].dialect}\``);
      if (definition.docs.remarks)
        lines.push(`- Remarks: ${definition.docs.remarks}`);
      lines.push("", "Request contract:", "", "```json", stableContractJson(pluginApiMethodContracts[definition.id].request), "```", "", "Response contract:", "", "```json", stableContractJson(pluginApiMethodContracts[definition.id].response), "```");
      lines.push("", "Stable errors:", "");
      for (const error of definition.errors) {
        lines.push(`- \`${error.code}\` (${error.recoverable ? "recoverable" : "not recoverable"}): ${error.description}`);
      }
      lines.push("");
    }
  }
  if (pluginTools.length === 0) {
    lines.push("## Plugin tools", "", "This Skill does not declare a Plugin-owned tool.", "");
  } else {
    lines.push("## Plugin tools", "", "| Tool | Purpose | Request | Response |", "| --- | --- | --- | --- |");
    for (const tool of pluginTools) {
      lines.push(`| \`${escapeCell(tool.id)}\` | ${escapeCell(tool.summary)} | ${escapeCell(tool.request ?? "See tool schema.")} | ${escapeCell(tool.response ?? "See tool schema.")} |`);
    }
    lines.push("");
  }
  lines.push("<!-- prettier-ignore-end -->");
  return `${lines.join(`
`)}
`;
}
export {
  requirePluginApi,
  renderPluginApiReference,
  pluginApiWireSchemaDialect,
  pluginApiWireContracts,
  pluginApiMethodContracts,
  pluginApiContractIds,
  pluginApiCatalog,
  parseRuntimePluginApiDeclaration,
  parsePluginApiResult,
  parsePluginApiRemoteFailure,
  parsePluginApiParams,
  parsePluginApiDeclaration,
  parsePluginApiCall,
  maximumPluginApiResultBytes,
  maximumPluginApiRequestBytes,
  maximumPluginApiConnectedImagePixels,
  maximumPluginApiConnectedImageDimension,
  maximumPluginApiConnectedImageBytes,
  isPluginApiId,
  isPluginApiErrorCode,
  isPluginApiDeclared,
  isPluginApiCommitPreserving,
  isPluginApiAvailable,
  getPluginApiWireContract,
  getPluginApiRequirement,
  getPluginApiDefinition,
  evaluatePluginApiAvailability,
  definePluginApiRelease,
  definePluginApiDeclaration,
  definePluginApiCatalog,
  definePluginApi,
  PluginApiUnavailableError,
  PLUGIN_API_CATALOG_VERSION,
  PLUGIN_API_CATALOG_MAJOR,
  PLUGIN_API_CATALOG_ARTIFACT_SCHEMA
};

//# debugId=BEC6F5218241B6D264756E2164756E21
//# sourceMappingURL=index.js.map
