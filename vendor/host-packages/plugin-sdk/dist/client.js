// ../plugin-api/src/contracts.ts
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

// ../plugin-api/src/method-schemas.ts
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
  revision: integer,
  style: jsonObject(),
  type: string(80)
}, ["data", "id", "position", "revision", "type"]);
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
  revision: integer,
  title: string(512)
}, ["edges", "id", "nodes", "revision", "title"]);
var structureDocument = object({
  description: string(8000, { allowEmpty: true }),
  edges: array(edge, 1e4),
  id: string(256),
  nodes: array(structureNode, 1e4),
  revision: integer,
  tags: array(string(), 256),
  title: string(512)
}, ["edges", "id", "nodes", "revision", "title"]);
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
  "canvas.node.state.replace": contract(object({ state: jsonObject(256 * KiB) }, ["state"]), object({ updated: literal(true) }, ["updated"]), { request: 256 * KiB + 4 * KiB }),
  "canvas.resource.image.create": contract(object({
    dataUrl: string(24 * MiB, { prefix: "data:image/png;base64," }),
    name: string(120, { refinement: "safe-png-file-name" })
  }, ["dataUrl", "name"]), object({ createdNodeId: string(), revision: integer }, ["createdNodeId", "revision"]), { request: 24 * MiB + 4 * KiB }),
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
    revision: integer,
    toolId: string(256),
    warnings: array(string(), 32)
  }, ["createdNodeIds", "revision", "toolId", "warnings"]), { result: 256 * KiB }),
  "projects.list": contract(none, object({
    projects: array(object({ available: bool, id: string(256), name: string(512) }, ["available", "id", "name"]), 1000)
  }, ["projects"]), { result: MiB }),
  "canvas.catalog.list": contract(object({ projectId: string(256) }, ["projectId"]), object({
    canvases: array(object({ createdAt: finite, id: string(256), name: string(512), updatedAt: finite }, [
      "createdAt",
      "id",
      "name",
      "updatedAt"
    ]), 1e4),
    projectId: string(256)
  }, ["canvases", "projectId"]), { result: 8 * MiB }),
  "canvas.document.get": contract(object({ projection: enumString(["geometry", "structure"]), ref: canvasRef }, ["ref"]), union(object({
    document: geometryDocument,
    projection: literal("geometry"),
    ref: canvasRef,
    storageVersion: union(nil, string(256))
  }, ["document", "projection", "ref", "storageVersion"]), object({
    document: structureDocument,
    projection: literal("structure"),
    ref: canvasRef,
    storageVersion: union(nil, string(256))
  }, ["document", "projection", "ref", "storageVersion"])), { result: 8 * MiB }),
  "canvas.nodes.query": contract(object({ query: nodeQuery, ref: canvasRef }, ["ref"]), object({
    nodes: array(nodeSummary, 1000),
    ref: canvasRef,
    revision: integer,
    storageVersion: union(nil, string(256))
  }, ["nodes", "ref", "revision", "storageVersion"]), { request: MiB, result: 8 * MiB }),
  "canvas.transaction.execute": contract(object({
    commands: array(transactionCommand, 256, 1),
    expectedRevision: integer,
    ref: canvasRef,
    transactionId: string(128)
  }, ["commands", "expectedRevision", "ref", "transactionId"]), object({
    affectedNodeIds: stringList(1e4),
    changed: bool,
    createdNodeIds: stringList(1e4),
    ref: canvasRef,
    revision: integer,
    storageVersion: string(256),
    summaryTruncated: bool,
    warnings: stringList()
  }, ["affectedNodeIds", "changed", "createdNodeIds", "ref", "revision", "storageVersion", "warnings"]), { request: MiB, result: 2 * MiB }),
  "canvas.events.subscribe": contract(object({ ref: object({ canvasId: string(256), projectId: string(256) }, ["projectId"]) }, ["ref"]), object({ subscriptionId: string(128) }, ["subscriptionId"])),
  "canvas.events.unsubscribe": contract(object({ subscriptionId: string(128) }, ["subscriptionId"]), object({ removed: bool }, ["removed"]))
});
var maximumPluginApiRequestBytes = Math.max(...Object.values(pluginApiWireContracts).map(({ request }) => request.maxBytes));
var maximumPluginApiResultBytes = Math.max(...Object.values(pluginApiWireContracts).map(({ result }) => result.maxBytes));
function getPluginApiWireContract(id) {
  return pluginApiWireContracts[id];
}

// ../plugin-api/src/method-contracts.ts
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

// ../plugin-api/src/catalog.ts
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
var pluginApiCatalog = definePluginApiCatalog(definePluginApiRelease("1.0.0", [
  defineV2Contract({
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
  defineV2Contract({
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
      response: "The owning node identity, revision, geometry, and Plugin state projection."
    }
  }),
  defineV2Contract({
    id: "canvas.node.state.replace",
    completion: "commit-preserving",
    grant: "canvas.node.write",
    scope: "own-node",
    sideEffect: "write",
    errors: [...contextErrors, ...permissionErrors],
    docs: {
      summary: "Replace the owning node's bounded Plugin state.",
      description: "Commits only the namespaced Plugin state through the authoritative Canvas application service with revision checks.",
      request: "`{ state }`, where state is a bounded JSON value.",
      response: "`{ updated: true }` after the authoritative state replacement commits."
    }
  }),
  defineV2Contract({
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
  defineV2Contract({
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
      response: "The bounded selected tool result, created node ids, authoritative revision, and warnings."
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
  defineV2Contract({
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
  defineV2Contract({
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
      response: "The requested pathless document projection and authoritative revision."
    }
  }),
  defineV2Contract({
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
      response: "Matching node projections and the authoritative Canvas revision."
    }
  }),
  defineV2Contract({
    id: "canvas.transaction.execute",
    completion: "commit-preserving",
    audience: ["web-plugin", "companion"],
    grant: "canvas.document.write",
    scope: "canvas",
    sideEffect: "write",
    errors: [...contextErrors, ...permissionErrors],
    docs: {
      summary: "Commit one non-empty revision-bound Canvas transaction.",
      description: "Validates bounded commands against one authoritative revision and persists the accepted transaction atomically.",
      request: "`{ ref, expectedRevision, commands, transactionId }` with a bounded non-empty command list.",
      response: "The committed authoritative revision and bounded command results."
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
      description: "Creates a connection-scoped subscription; events are revisioned invalidations or safe projections, never native data.",
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
]));
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
// ../plugin-api/src/declaration.ts
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
// ../plugin-api/src/availability.ts
class PluginApiUnavailableError extends Error {
  availability;
  constructor(availability2) {
    super(`Plugin API ${availability2.id} is unavailable: ${availability2.reason}`);
    this.name = "PluginApiUnavailableError";
    this.availability = availability2;
  }
}
// ../plugin-api/src/remote-errors.ts
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
// src/capabilities.ts
var capabilityIdPattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/;
var operationIdPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
var propertyNamePattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
var semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
var sideEffects = new Set(["none", "read", "write", "execute", "subscribe"]);
var maximumCapabilities = 128;
var maximumProperties = 64;
var maximumSchemaDepth = 8;
var maximumStringLength = 16 * 1024;
var maximumArrayItems = 256;
function isPluginCapabilityId(value) {
  return typeof value === "string" && value.length <= 160 && capabilityIdPattern.test(value);
}
function record2(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${label} must be a plain object`);
  return value;
}
function exactKeys(value, required, optional, label) {
  const expected = new Set([...required, ...optional]);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) || Object.keys(value).some((key) => !expected.has(key))) {
    throw new TypeError(`${label} contains unsupported or missing fields`);
  }
}
function text(value, label, maximum = 2000) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${label} must be a bounded, trimmed string`);
  }
  return value;
}
function nonNegativeInteger(value, label, maximum) {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new TypeError(`${label} must be a bounded non-negative integer`);
  }
  return Number(value);
}
function version(value, label) {
  if (typeof value !== "string" || !semverPattern.test(value)) {
    throw new TypeError(`${label} must be a strict semantic version`);
  }
  return value;
}
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
function isPluginCapabilityVersionCompatible(candidate, range) {
  return compareVersions2(candidate, range.minimum) >= 0 && compareVersions2(candidate, range.maximumExclusive) < 0;
}
function normalizeSchema(value, label, depth) {
  if (depth > maximumSchemaDepth)
    throw new TypeError(`${label} exceeds the schema depth limit`);
  const input = record2(value, label);
  if (input.type === "null" || input.type === "boolean") {
    exactKeys(input, ["type"], [], label);
    return Object.freeze({ type: input.type });
  }
  if (input.type === "number" || input.type === "integer") {
    exactKeys(input, ["type"], ["minimum", "maximum"], label);
    const minimum = input.minimum;
    const maximum = input.maximum;
    if (minimum !== undefined && (typeof minimum !== "number" || !Number.isFinite(minimum))) {
      throw new TypeError(`${label}.minimum must be finite`);
    }
    if (maximum !== undefined && (typeof maximum !== "number" || !Number.isFinite(maximum))) {
      throw new TypeError(`${label}.maximum must be finite`);
    }
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      throw new TypeError(`${label} minimum exceeds maximum`);
    }
    return Object.freeze({
      type: input.type,
      ...minimum === undefined ? {} : { minimum },
      ...maximum === undefined ? {} : { maximum }
    });
  }
  if (input.type === "string") {
    if (!Object.prototype.hasOwnProperty.call(input, "maxLength")) {
      throw new TypeError(`${label}.maxLength is required to keep values bounded`);
    }
    exactKeys(input, ["type", "maxLength"], ["minLength", "enum"], label);
    const maxLength = nonNegativeInteger(input.maxLength, `${label}.maxLength`, maximumStringLength);
    const minLength = input.minLength === undefined ? undefined : nonNegativeInteger(input.minLength, `${label}.minLength`, maxLength);
    let enumeration;
    if (input.enum !== undefined) {
      if (!Array.isArray(input.enum) || input.enum.length < 1 || input.enum.length > 128 || input.enum.some((entry) => typeof entry !== "string" || entry.length > maxLength) || new Set(input.enum).size !== input.enum.length) {
        throw new TypeError(`${label}.enum must contain unique bounded strings`);
      }
      enumeration = Object.freeze([...input.enum]);
    }
    return Object.freeze({
      type: "string",
      maxLength,
      ...minLength === undefined ? {} : { minLength },
      ...enumeration === undefined ? {} : { enum: enumeration }
    });
  }
  if (input.type === "array") {
    exactKeys(input, ["type", "items", "maxItems"], ["minItems"], label);
    const maxItems = nonNegativeInteger(input.maxItems, `${label}.maxItems`, maximumArrayItems);
    const minItems = input.minItems === undefined ? undefined : nonNegativeInteger(input.minItems, `${label}.minItems`, maxItems);
    return Object.freeze({
      type: "array",
      items: normalizeSchema(input.items, `${label}.items`, depth + 1),
      maxItems,
      ...minItems === undefined ? {} : { minItems }
    });
  }
  if (input.type === "object") {
    exactKeys(input, ["type", "properties", "required", "additionalProperties"], [], label);
    if (input.additionalProperties !== false)
      throw new TypeError(`${label}.additionalProperties must be false`);
    const rawProperties = record2(input.properties, `${label}.properties`);
    const propertyNames = Object.keys(rawProperties);
    if (propertyNames.length > maximumProperties)
      throw new TypeError(`${label} has too many properties`);
    if (propertyNames.some((name) => !propertyNamePattern.test(name))) {
      throw new TypeError(`${label} contains an invalid property name`);
    }
    if (!Array.isArray(input.required) || input.required.some((name) => typeof name !== "string" || !propertyNames.includes(name)) || new Set(input.required).size !== input.required.length) {
      throw new TypeError(`${label}.required must contain unique declared properties`);
    }
    const properties = Object.fromEntries(propertyNames.sort().map((name) => [name, normalizeSchema(rawProperties[name], `${label}.properties.${name}`, depth + 1)]));
    return Object.freeze({
      type: "object",
      properties: Object.freeze(properties),
      required: Object.freeze([...input.required].sort()),
      additionalProperties: false
    });
  }
  throw new TypeError(`${label}.type is unsupported`);
}
function objectSchema(value, label) {
  const schema = normalizeSchema(value, label, 0);
  if (schema.type !== "object")
    throw new TypeError(`${label} must be a closed object schema`);
  return schema;
}
function normalizeImport(value, label) {
  const input = record2(value, label);
  exactKeys(input, ["id", "inputSchema", "outputSchema", "version"], [], label);
  const id = text(input.id, `${label}.id`, 160);
  if (!isPluginCapabilityId(id))
    throw new TypeError(`${label}.id is invalid`);
  const range = record2(input.version, `${label}.version`);
  exactKeys(range, ["minimum", "maximumExclusive"], [], `${label}.version`);
  const minimum = version(range.minimum, `${label}.version.minimum`);
  const maximumExclusive = version(range.maximumExclusive, `${label}.version.maximumExclusive`);
  if (compareVersions2(minimum, maximumExclusive) >= 0) {
    throw new TypeError(`${label}.version must be a non-empty half-open interval`);
  }
  return Object.freeze({
    id,
    inputSchema: objectSchema(input.inputSchema, `${label}.inputSchema`),
    outputSchema: objectSchema(input.outputSchema, `${label}.outputSchema`),
    version: Object.freeze({ minimum, maximumExclusive })
  });
}
function normalizeImports(value, label) {
  if (!Array.isArray(value) || value.length > maximumCapabilities) {
    throw new TypeError(`${label} must be a bounded array`);
  }
  const imports = value.map((entry, index) => normalizeImport(entry, `${label}[${index}]`)).sort((a, b) => a.id.localeCompare(b.id));
  if (imports.some((entry, index) => index > 0 && imports[index - 1].id === entry.id)) {
    throw new TypeError(`${label} contains a duplicate capability id`);
  }
  return Object.freeze(imports);
}
function normalizeExport(value, label) {
  const input = record2(value, label);
  exactKeys(input, ["id", "version", "operation", "sideEffect", "inputSchema", "outputSchema", "docs"], [], label);
  const id = text(input.id, `${label}.id`, 160);
  if (!isPluginCapabilityId(id))
    throw new TypeError(`${label}.id is invalid`);
  const operation = text(input.operation, `${label}.operation`, 128);
  if (!operationIdPattern.test(operation))
    throw new TypeError(`${label}.operation is invalid`);
  if (!sideEffects.has(input.sideEffect))
    throw new TypeError(`${label}.sideEffect is invalid`);
  const rawDocs = record2(input.docs, `${label}.docs`);
  exactKeys(rawDocs, ["summary", "request", "response"], ["remarks"], `${label}.docs`);
  const docs = Object.freeze({
    summary: text(rawDocs.summary, `${label}.docs.summary`),
    request: text(rawDocs.request, `${label}.docs.request`),
    response: text(rawDocs.response, `${label}.docs.response`),
    ...rawDocs.remarks === undefined ? {} : { remarks: text(rawDocs.remarks, `${label}.docs.remarks`) }
  });
  return Object.freeze({
    id,
    version: version(input.version, `${label}.version`),
    operation,
    sideEffect: input.sideEffect,
    inputSchema: objectSchema(input.inputSchema, `${label}.inputSchema`),
    outputSchema: objectSchema(input.outputSchema, `${label}.outputSchema`),
    docs
  });
}
function parsePluginCapabilityDeclaration(value) {
  const input = record2(value, "Plugin capability declaration");
  exactKeys(input, ["exports", "imports"], [], "Plugin capability declaration");
  if (!Array.isArray(input.exports) || input.exports.length > maximumCapabilities) {
    throw new TypeError("Plugin capability exports must be a bounded array");
  }
  const exports = input.exports.map((entry, index) => normalizeExport(entry, `Plugin capability exports[${index}]`)).sort((left, right) => left.id.localeCompare(right.id));
  if (exports.some((entry, index) => index > 0 && exports[index - 1].id === entry.id)) {
    throw new TypeError("Plugin capability exports contain a duplicate capability id");
  }
  if (new Set(exports.map((entry) => entry.operation)).size !== exports.length) {
    throw new TypeError("Plugin capability exports contain a duplicate provider operation");
  }
  const rawImports = record2(input.imports, "Plugin capability imports");
  exactKeys(rawImports, ["required", "optional"], [], "Plugin capability imports");
  const required = normalizeImports(rawImports.required, "Plugin required capability imports");
  const optional = normalizeImports(rawImports.optional, "Plugin optional capability imports");
  const requiredIds = new Set(required.map(({ id }) => id));
  const overlap = optional.find(({ id }) => requiredIds.has(id));
  if (overlap)
    throw new TypeError(`Plugin capability import cannot be both required and optional: ${overlap.id}`);
  return Object.freeze({
    exports: Object.freeze(exports),
    imports: Object.freeze({ required, optional })
  });
}
function sameSchema(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function isPluginCapabilityContractCompatible(imported, exported) {
  return imported.id === exported.id && isPluginCapabilityVersionCompatible(exported.version, imported.version) && sameSchema(imported.inputSchema, exported.inputSchema) && sameSchema(imported.outputSchema, exported.outputSchema);
}
function assertPluginCapabilityRuntimeTools(exports, tools) {
  const toolsByName = new Map;
  for (const tool of tools) {
    const name = text(tool.name, "Runtime MCP tool name", 128);
    if (!operationIdPattern.test(name)) {
      throw new TypeError(`Runtime MCP tool name is invalid: ${name}`);
    }
    const existing = toolsByName.get(name);
    if (existing)
      existing.push(tool);
    else
      toolsByName.set(name, [tool]);
  }
  for (const exported of exports) {
    const matches = toolsByName.get(exported.operation) ?? [];
    if (matches.length !== 1) {
      throw new TypeError(`Plugin capability operation must resolve to exactly one runtime MCP tool: ${exported.operation}`);
    }
    const runtimeTool = matches[0];
    const inputSchema = objectSchema(runtimeTool.inputSchema, `Runtime MCP tool ${exported.operation} inputSchema`);
    if (!sameSchema(exported.inputSchema, inputSchema)) {
      throw new TypeError(`Plugin capability input schema does not match runtime MCP tool: ${exported.operation}`);
    }
    if (runtimeTool.outputSchema === undefined) {
      throw new TypeError(`Plugin capability runtime MCP tool must declare outputSchema: ${exported.operation}`);
    }
    const outputSchema = objectSchema(runtimeTool.outputSchema, `Runtime MCP tool ${exported.operation} outputSchema`);
    if (!sameSchema(exported.outputSchema, outputSchema)) {
      throw new TypeError(`Plugin capability output schema does not match runtime MCP tool: ${exported.operation}`);
    }
  }
}
function validateValue(schema, value, label, seen) {
  if (schema.type === "null") {
    if (value !== null)
      throw new TypeError(`${label} must be null`);
    return;
  }
  if (schema.type === "boolean") {
    if (typeof value !== "boolean")
      throw new TypeError(`${label} must be boolean`);
    return;
  }
  if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || schema.type === "integer" && !Number.isSafeInteger(value)) {
      throw new TypeError(`${label} must be a finite ${schema.type === "integer" ? "safe integer" : "number"}`);
    }
    if (schema.minimum !== undefined && value < schema.minimum)
      throw new TypeError(`${label} is below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum)
      throw new TypeError(`${label} exceeds maximum`);
    return;
  }
  if (schema.type === "string") {
    if (typeof value !== "string" || value.length < (schema.minLength ?? 0) || value.length > schema.maxLength || schema.enum !== undefined && !schema.enum.includes(value)) {
      throw new TypeError(`${label} is not an admitted string`);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    throw new TypeError(`${label} must be ${schema.type}`);
  }
  if (seen.has(value))
    throw new TypeError(`${label} cannot be cyclic`);
  seen.add(value);
  try {
    if (schema.type === "array") {
      if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > schema.maxItems) {
        throw new TypeError(`${label} is not an admitted array`);
      }
      value.forEach((entry, index) => validateValue(schema.items, entry, `${label}[${index}]`, seen));
      return;
    }
    if (Array.isArray(value))
      throw new TypeError(`${label} must be an object`);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new TypeError(`${label} must be a plain object`);
    const object2 = value;
    for (const key of schema.required) {
      if (!Object.prototype.hasOwnProperty.call(object2, key))
        throw new TypeError(`${label}.${key} is required`);
    }
    for (const [key, child] of Object.entries(object2)) {
      const childSchema = schema.properties[key];
      if (!childSchema)
        throw new TypeError(`${label} contains unsupported property: ${key}`);
      validateValue(childSchema, child, `${label}.${key}`, seen);
    }
  } finally {
    seen.delete(value);
  }
}
function assertPluginCapabilityValue(schema, value, label = "Plugin capability value") {
  validateValue(schema, value, label, new Set);
}
function escapeCell(value) {
  return value.replaceAll("|", "\\|").replaceAll(`
`, " ");
}
function renderPluginCapabilityReference(declarationInput) {
  const declaration = parsePluginCapabilityDeclaration(declarationInput);
  const imports = [
    ...declaration.imports.required.map((entry) => ({ ...entry, requirement: "required" })),
    ...declaration.imports.optional.map((entry) => ({ ...entry, requirement: "optional" }))
  ].sort((left, right) => left.id.localeCompare(right.id));
  const lines = [
    "<!-- prettier-ignore-start -->",
    "",
    "# Convax Plugin capabilities",
    "",
    "<!-- Generated by @convax/plugin-sdk. Do not edit. -->",
    "",
    "Provider availability is bound to one immutable ActivePluginSet. Check optional imports immediately before use.",
    "The Host revalidates both snapshots and both schemas for every call; provider code runs only with provider grants.",
    "An exported operation is the exact MCP tool name of the provider's verified mcp-stdio sidecar. It becomes ready only after Main matches tools/list inputSchema and outputSchema to this closed manifest contract.",
    "",
    "## Agent Skill authority boundary",
    "",
    "This generated file is the sandboxed Web Plugin client reference embedded beside a Plugin-owned Skill. It is not an Agent tool surface.",
    "An Agent following the owning Skill cannot create the Web Plugin MessagePort, send `convax.plugin-host/8` envelopes, invoke inter-Plugin capabilities, or access the Host-internal `convax.plugin-capability/3` transport.",
    "Skill instructions and generated references grant no authority. The Agent may use only tools the Host separately exposes to that Agent and may consult `convax-capabilities.md` as the generated Host API reference.",
    "",
    "## Calling imported capabilities from a Web Plugin",
    "",
    "Use `createPluginHostClient` from `@convax/plugin-sdk/client` with the validated Plugin manifest and the Host-transferred MessagePort.",
    "A Web client requires `entry` and `hostApi.required` containing `host.context.get`; static Plugins that do not open a MessagePort do not create this client.",
    "`convax.plugin-host/8` is the only author-facing Web ABI. `convax.plugin-capability/3` is Host-internal renderer/Main and verified-sidecar transport and must never be authored or sent by a Plugin.",
    "Check Host API availability with `client.getHostApiAvailability(id)` or require it with `client.requireHostApi(id)`; pass `{ refresh: true }` to renegotiate `host.context.get` explicitly.",
    "Host API availability reports `since` for the API id's first introduction and `contractSince` for the currently published request/result contract; compatibility uses `contractSince`.",
    "Host API calls use `client.callHostApi(...)`. Inter-Plugin calls use only `client.getCapabilityAvailability(...)` and `client.invokeCapability(...)`; they never name a provider Plugin.",
    "Remote failures are closed `{ kind, code, message, recoverable }` objects. API codes come from the exact Catalog method; protocol and inter-Plugin failures use separate stable code sets.",
    "The client rejects undeclared imports, validates request and response values against the manifest schemas, bounds messages and in-flight calls, and sends a sender-scoped cancel envelope when the supplied `AbortSignal` aborts.",
    "Call `client.close()` during explicit Plugin teardown. It synchronously settles local calls, sends one payload-free sender-scoped disconnect control envelope, and closes the MessagePort without awaiting `beforeunload`.",
    "",
    "## Imported capabilities",
    ""
  ];
  if (imports.length === 0) {
    lines.push("This Plugin does not import another Plugin capability.", "");
  } else {
    lines.push("| Capability | Requirement | Compatible versions |", "| --- | --- | --- |");
    for (const entry of imports) {
      lines.push(`| \`${entry.id}\` | ${entry.requirement} | \`>=${entry.version.minimum} <${entry.version.maximumExclusive}\` |`);
    }
    lines.push("");
    for (const entry of imports) {
      lines.push(`### Imported \`${entry.id}\``, "", `Requirement: ${entry.requirement}. Compatible versions: \`>=${entry.version.minimum} <${entry.version.maximumExclusive}\`.`, "", "Input schema:", "", "```json", JSON.stringify(entry.inputSchema, null, 2), "```", "", "Output schema:", "", "```json", JSON.stringify(entry.outputSchema, null, 2), "```", "", "Typed Web client:", "", "```ts", `const availability = await client.getCapabilityAvailability("${entry.id}", { signal })`, "if (availability.available) {", `  const result = await client.invokeCapability("${entry.id}", input, { signal })`, "  // result is validated against the generated output contract.", "}", "```", "");
    }
  }
  lines.push("## Exported capabilities", "");
  if (declaration.exports.length === 0) {
    lines.push("This Plugin does not export an inter-Plugin capability.", "");
  } else {
    lines.push("| Capability | Version | Operation | Side effect | Summary |", "| --- | --- | --- | --- | --- |");
    for (const entry of declaration.exports) {
      lines.push(`| \`${entry.id}\` | ${entry.version} | \`${entry.operation}\` | ${entry.sideEffect} | ${escapeCell(entry.docs.summary)} |`);
    }
    lines.push("");
    for (const entry of declaration.exports) {
      lines.push(`### \`${entry.id}\``, "", entry.docs.summary, "", `- Version: ${entry.version}`, `- Provider operation: \`${entry.operation}\``, `- Side effect: ${entry.sideEffect}`, `- Request: ${entry.docs.request}`, `- Response: ${entry.docs.response}`);
      if (entry.docs.remarks)
        lines.push(`- Remarks: ${entry.docs.remarks}`);
      lines.push("", "Input schema:", "", "```json", JSON.stringify(entry.inputSchema, null, 2), "```", "");
      lines.push("Output schema:", "", "```json", JSON.stringify(entry.outputSchema, null, 2), "```", "");
    }
  }
  lines.push("<!-- prettier-ignore-end -->");
  return `${lines.join(`
`)}
`;
}

// src/primitives.ts
var semverPattern2 = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
var windowsReservedName2 = /^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]|CONIN\$|CONOUT\$)$/i;
function portableRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
  return value;
}
function assertPortableKeys(value, allowed, label) {
  const expected = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !expected.has(key));
  if (unknown)
    throw new TypeError(`${label} contains an unsupported field: ${unknown}`);
}
function portableText(value, label, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${label} must be a bounded, trimmed string`);
  }
  return value;
}
function portableArray(value, label, maximum, nonEmpty = false) {
  if (!Array.isArray(value) || value.length > maximum || nonEmpty && value.length === 0) {
    throw new TypeError(`${label} must be ${nonEmpty ? "a non-empty " : "a "}bounded array with at most ${maximum} items`);
  }
  return value;
}
function deepFreezePortable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value))
      deepFreezePortable(item);
    Object.freeze(value);
  }
  return value;
}
function compareNumericIdentifier(left, right) {
  if (left.length !== right.length)
    return left.length < right.length ? -1 : 1;
  return left === right ? 0 : left < right ? -1 : 1;
}
function splitSemver(value) {
  if (!semverPattern2.test(value))
    throw new TypeError("Plugin version must be valid SemVer");
  const withoutBuild = value.split("+", 1)[0];
  const prereleaseIndex = withoutBuild.indexOf("-");
  const core = (prereleaseIndex === -1 ? withoutBuild : withoutBuild.slice(0, prereleaseIndex)).split(".");
  const prerelease = prereleaseIndex === -1 ? [] : withoutBuild.slice(prereleaseIndex + 1).split(".");
  return { core, prerelease };
}
function parsePortablePluginVersion(value) {
  const version2 = portableText(value, "Plugin version", 128);
  if (!semverPattern2.test(version2))
    throw new TypeError("Plugin version must be valid SemVer");
  return version2;
}
function comparePortablePluginVersions(left, right) {
  const leftVersion = splitSemver(left);
  const rightVersion = splitSemver(right);
  for (let index = 0;index < 3; index += 1) {
    const compared = compareNumericIdentifier(leftVersion.core[index], rightVersion.core[index]);
    if (compared)
      return compared;
  }
  if (leftVersion.prerelease.length === 0 || rightVersion.prerelease.length === 0) {
    return leftVersion.prerelease.length === rightVersion.prerelease.length ? 0 : leftVersion.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0;index < length; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return leftIdentifier === rightIdentifier ? 0 : leftIdentifier === undefined ? -1 : 1;
    }
    if (leftIdentifier === rightIdentifier)
      continue;
    const leftNumeric = /^\d+$/u.test(leftIdentifier);
    const rightNumeric = /^\d+$/u.test(rightIdentifier);
    if (leftNumeric && rightNumeric)
      return compareNumericIdentifier(leftIdentifier, rightIdentifier);
    if (leftNumeric !== rightNumeric)
      return leftNumeric ? -1 : 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  return 0;
}
function validatePortablePluginSegment(value) {
  const stem = value.split(".")[0] ?? "";
  if (!value || value.length > 255 || value === "." || value === ".." || /[\\/:*?"<>|\u0000-\u001f\u007f]/u.test(value) || /[. ]$/u.test(value) || windowsReservedName2.test(stem)) {
    throw new TypeError(`Plugin path contains an invalid Windows filename: ${value}`);
  }
  return value;
}
function parsePortablePluginId(value) {
  const id = portableText(value, "Plugin id", 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) {
    throw new TypeError("Plugin id must use kebab-case");
  }
  validatePortablePluginSegment(id);
  return id;
}
function parsePortablePluginRelativePath(value, label = "Plugin path") {
  const input = portableText(value, label, 1024);
  if (input.includes("\\") || input.startsWith("/") || /^[A-Za-z]:/u.test(input) || input.startsWith("//")) {
    throw new TypeError(`${label} must be a portable relative path`);
  }
  const segments = input.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new TypeError(`${label} must be a portable relative path`);
  }
  segments.forEach(validatePortablePluginSegment);
  return input;
}
function parsePortableStringArray(value, label, validate) {
  if (value === undefined)
    return;
  const items = portableArray(value, label, 64).map((item) => validate(portableText(item, label, 128)));
  if (new Set(items).size !== items.length)
    throw new TypeError(`${label} contains duplicate values`);
  return items;
}
function parsePortableStableId(value, label, maximum = 80) {
  const id = portableText(value, label, maximum);
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u.test(id)) {
    throw new TypeError(`${label} is invalid: ${id}`);
  }
  return id;
}

// src/host-protocol.ts
var pluginHostProtocolV8 = "convax.plugin-host/8";
var maximumPluginHostRequestBytes = maximumPluginApiRequestBytes;
var maximumPluginHostResponseBytes = maximumPluginApiResultBytes;
var maximumPluginCapabilityRequestBytes = 1024 * 1024;
var maximumPluginCapabilityResponseBytes = 4 * 1024 * 1024;
var maximumPluginHostControlBytes = 128;
var maximumPluginHostInFlightRequests = 16;
var maximumPluginHostRequestIdLength = 128;
var maximumPluginHostIngressDepth = 64;
var maximumPluginHostIngressEntries = Math.ceil(maximumPluginHostRequestBytes / 2);
var pluginCapabilityVersions = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
var unavailableReasons = new Set([
  "not-declared",
  "provider-missing",
  "provider-incompatible",
  "provider-ambiguous",
  "self-provider",
  "dependency-cycle",
  "setup-required",
  "disabled",
  "recovering",
  "contract-mismatch"
]);
var pluginCapabilityRemoteErrors = Object.freeze({
  canceled: { recoverable: true },
  "contract-mismatch": { recoverable: false },
  "depth-exceeded": { recoverable: false },
  "duplicate-request": { recoverable: false },
  "execution-failed": { recoverable: false },
  "invalid-input": { recoverable: false },
  "invalid-output": { recoverable: false },
  overloaded: { recoverable: true },
  "provider-unavailable": { recoverable: true },
  "reentrant-call": { recoverable: false }
});
var capabilityRemoteErrorCodes = new Set(Object.keys(pluginCapabilityRemoteErrors));
var pluginHostProtocolRemoteErrors = Object.freeze({
  canceled: { recoverable: true },
  "internal-error": { recoverable: false },
  "invalid-request": { recoverable: false },
  overloaded: { recoverable: true },
  "transport-closed": { recoverable: true }
});
var protocolRemoteErrorCodes = new Set(Object.keys(pluginHostProtocolRemoteErrors));
var hostApiRemoteErrorCodes = new Set(pluginApiCatalog.apis.flatMap((definition) => definition.errors.map(({ code }) => code)));
function record3(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value : undefined;
}
function jsonStringByteLength(value) {
  let bytes = 2;
  for (let index = 0;index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit === 34 || unit === 92 || unit === 8 || unit === 9 || unit === 10 || unit === 12 || unit === 13) {
      bytes += 2;
    } else if (unit <= 31 || unit >= 55296 && unit <= 57343) {
      const next = value.charCodeAt(index + 1);
      if (unit >= 55296 && unit <= 56319 && next >= 56320 && next <= 57343) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 6;
      }
    } else if (unit < 128) {
      bytes += 1;
    } else if (unit < 2048) {
      bytes += 2;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
function assertPluginHostMessageByteLength(value, maximumBytes, label = "Plugin Host message") {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new TypeError(`${label} byte limit is invalid`);
  }
  const stack = [{ depth: 0, value }];
  const seen = new WeakSet;
  let bytes = 0;
  let entries = 0;
  const addBytes = (amount) => {
    bytes += amount;
    if (bytes > maximumBytes)
      throw new RangeError(`${label} exceeds ${maximumBytes} bytes`);
  };
  while (stack.length > 0) {
    const current = stack.pop();
    const entry = current.value;
    if (entry === null) {
      addBytes(4);
      continue;
    }
    if (typeof entry === "string") {
      addBytes(jsonStringByteLength(entry));
      continue;
    }
    if (typeof entry === "boolean") {
      addBytes(entry ? 4 : 5);
      continue;
    }
    if (typeof entry === "number") {
      if (!Number.isFinite(entry))
        throw new TypeError(`${label} must contain finite JSON numbers`);
      addBytes(Object.is(entry, -0) ? 1 : String(entry).length);
      continue;
    }
    if (!entry || typeof entry !== "object") {
      throw new TypeError(`${label} must be a JSON value`);
    }
    if (current.depth > maximumPluginHostIngressDepth || seen.has(entry)) {
      throw new TypeError(`${label} must be a bounded acyclic JSON tree`);
    }
    seen.add(entry);
    if (Array.isArray(entry)) {
      entries += entry.length;
      if (entries > maximumPluginHostIngressEntries) {
        throw new RangeError(`${label} exceeds ${maximumPluginHostIngressEntries} JSON entries`);
      }
      addBytes(2 + Math.max(0, entry.length - 1));
      if (Object.getOwnPropertySymbols(entry).length > 0) {
        throw new TypeError(`${label} arrays must not contain symbol properties`);
      }
      let itemCount = 0;
      for (const key in entry) {
        if (!Object.prototype.hasOwnProperty.call(entry, key))
          continue;
        if (!/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= entry.length) {
          throw new TypeError(`${label} arrays must contain only indexed entries`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(entry, key);
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw new TypeError(`${label} arrays must contain enumerable data properties`);
        }
        itemCount += 1;
        stack.push({ depth: current.depth + 1, value: descriptor.value });
      }
      if (itemCount !== entry.length)
        throw new TypeError(`${label} arrays must be dense JSON arrays`);
      continue;
    }
    const prototype = Object.getPrototypeOf(entry);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${label} must contain plain JSON objects`);
    }
    if (Object.getOwnPropertySymbols(entry).length > 0) {
      throw new TypeError(`${label} must not contain symbol properties`);
    }
    addBytes(2);
    let keyCount = 0;
    for (const key in entry) {
      if (!Object.prototype.hasOwnProperty.call(entry, key))
        continue;
      const descriptor = Object.getOwnPropertyDescriptor(entry, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new TypeError(`${label} objects must contain enumerable data properties`);
      }
      keyCount += 1;
      entries += 1;
      if (entries > maximumPluginHostIngressEntries) {
        throw new RangeError(`${label} exceeds ${maximumPluginHostIngressEntries} JSON entries`);
      }
      addBytes((keyCount === 1 ? 0 : 1) + jsonStringByteLength(key) + 1);
      stack.push({ depth: current.depth + 1, value: descriptor.value });
    }
  }
  return bytes;
}
function exactKeys2(value, required, optional = []) {
  const admitted = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) && Object.keys(value).every((key) => admitted.has(key));
}
function isPluginHostRequestId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= maximumPluginHostRequestIdLength && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value);
}
function isBoundedName(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value);
}
function isPluginHostConnect(value) {
  const input = record3(value);
  if (!input || !exactKeys2(input, ["pluginId", "protocol", "type"]) || input.protocol !== pluginHostProtocolV8 || input.type !== "connect") {
    return false;
  }
  try {
    parsePortablePluginId(input.pluginId);
    return true;
  } catch {
    return false;
  }
}
function isPluginHostRequest(value) {
  const input = record3(value);
  if (!input || !exactKeys2(input, ["id", "method", "protocol", "type"], ["params"]) || input.protocol !== pluginHostProtocolV8 || input.type !== "request" || !isPluginHostRequestId(input.id) || !isPluginApiId(input.method)) {
    return false;
  }
  try {
    parsePluginApiParams(input.method, input.params);
    return true;
  } catch {
    return false;
  }
}
function isPluginHostCapabilityInvokeRequest(value) {
  const input = record3(value);
  return Boolean(input && exactKeys2(input, ["capabilityId", "id", "input", "protocol", "type"]) && input.protocol === pluginHostProtocolV8 && input.type === "capability-invoke" && isPluginHostRequestId(input.id) && isPluginCapabilityId(input.capabilityId));
}
function isPluginHostCapabilityAvailabilityRequest(value) {
  const input = record3(value);
  return Boolean(input && exactKeys2(input, ["capabilityId", "id", "protocol", "type"]) && input.protocol === pluginHostProtocolV8 && input.type === "capability-availability" && isPluginHostRequestId(input.id) && isPluginCapabilityId(input.capabilityId));
}
function isPluginHostCancel(value) {
  const input = record3(value);
  return Boolean(input && exactKeys2(input, ["id", "protocol", "type"]) && input.protocol === pluginHostProtocolV8 && input.type === "cancel" && isPluginHostRequestId(input.id));
}
function isPluginHostDisconnect(value) {
  const input = record3(value);
  return Boolean(input && exactKeys2(input, ["protocol", "type"]) && input.protocol === pluginHostProtocolV8 && input.type === "disconnect");
}
function isPluginHostResponse(value) {
  const input = record3(value);
  if (!input || input.protocol !== pluginHostProtocolV8 || input.type !== "response" || !isPluginHostRequestId(input.id)) {
    return false;
  }
  if (input.ok === true)
    return exactKeys2(input, ["id", "ok", "protocol", "result", "type"]);
  if (input.ok !== false || !exactKeys2(input, ["error", "id", "ok", "protocol", "type"]))
    return false;
  const error = record3(input.error);
  return Boolean(error && exactKeys2(error, ["code", "kind", "message", "recoverable"]) && typeof error.code === "string" && (error.kind === "api" && hostApiRemoteErrorCodes.has(error.code) || error.kind === "capability" && capabilityRemoteErrorCodes.has(error.code) || error.kind === "protocol" && protocolRemoteErrorCodes.has(error.code)) && typeof error.message === "string" && error.message.length > 0 && error.message.length <= 4096 && typeof error.recoverable === "boolean");
}
function isPluginHostCommand(value) {
  const input = record3(value);
  return Boolean(input && exactKeys2(input, ["command", "protocol", "type"], ["params"]) && input.protocol === pluginHostProtocolV8 && input.type === "command" && isBoundedName(input.command));
}
function parsePluginHostCapabilityAvailability(value) {
  const input = record3(value);
  if (!input || typeof input.available !== "boolean") {
    throw new TypeError("Plugin capability availability must be a closed object");
  }
  const requirement = input.requirement;
  if (requirement !== "required" && requirement !== "optional") {
    throw new TypeError("Plugin capability availability requirement is invalid");
  }
  if (!isPluginCapabilityId(input.capabilityId)) {
    throw new TypeError("Plugin capability availability id is invalid");
  }
  if (input.available) {
    if (!exactKeys2(input, ["available", "capabilityId", "requirement", "version"]) || typeof input.version !== "string" || !pluginCapabilityVersions.test(input.version)) {
      throw new TypeError("Available Plugin capability result is invalid");
    }
    return Object.freeze({
      available: true,
      capabilityId: input.capabilityId,
      requirement,
      version: input.version
    });
  }
  if (!exactKeys2(input, ["available", "capabilityId", "reason", "recoverable", "requirement"]) || typeof input.reason !== "string" || !unavailableReasons.has(input.reason) || typeof input.recoverable !== "boolean") {
    throw new TypeError("Unavailable Plugin capability result is invalid");
  }
  return Object.freeze({
    available: false,
    capabilityId: input.capabilityId,
    reason: input.reason,
    recoverable: input.recoverable,
    requirement
  });
}
function parsePluginCapabilityRemoteFailure(value) {
  const input = record3(value);
  if (!input || !exactKeys2(input, ["code", "kind", "message", "recoverable"]) || input.kind !== "capability" || typeof input.code !== "string" || !capabilityRemoteErrorCodes.has(input.code) || typeof input.message !== "string" || input.message.length < 1 || input.message.length > 4096 || typeof input.recoverable !== "boolean") {
    throw new TypeError("Plugin capability failure is invalid");
  }
  const code = input.code;
  if (input.recoverable !== pluginCapabilityRemoteErrors[code].recoverable) {
    throw new TypeError("Plugin capability failure recoverability is invalid");
  }
  return Object.freeze({ code, kind: "capability", message: input.message, recoverable: input.recoverable });
}
function parsePluginHostProtocolRemoteFailure(value) {
  const input = record3(value);
  if (!input || !exactKeys2(input, ["code", "kind", "message", "recoverable"]) || input.kind !== "protocol" || typeof input.code !== "string" || !protocolRemoteErrorCodes.has(input.code) || typeof input.message !== "string" || input.message.length < 1 || input.message.length > 4096 || typeof input.recoverable !== "boolean") {
    throw new TypeError("Plugin Host protocol failure is invalid");
  }
  const code = input.code;
  if (input.recoverable !== pluginHostProtocolRemoteErrors[code].recoverable) {
    throw new TypeError("Plugin Host protocol failure recoverability is invalid");
  }
  return Object.freeze({ code, kind: "protocol", message: input.message, recoverable: input.recoverable });
}
function pluginHostConnect(pluginId) {
  const envelope = { pluginId, protocol: pluginHostProtocolV8, type: "connect" };
  if (!isPluginHostConnect(envelope))
    throw new TypeError("Plugin Host connect envelope is invalid");
  return envelope;
}
function pluginHostSuccess(id, result) {
  if (!isPluginHostRequestId(id))
    throw new TypeError("Plugin Host response id is invalid");
  return { id, ok: true, protocol: pluginHostProtocolV8, result, type: "response" };
}
function pluginHostFailure(id, error) {
  if (!isPluginHostRequestId(id))
    throw new TypeError("Plugin Host response id is invalid");
  const response = {
    error,
    id,
    ok: false,
    protocol: pluginHostProtocolV8,
    type: "response"
  };
  if (!isPluginHostResponse(response))
    throw new TypeError("Plugin Host failure is invalid");
  return response;
}

// src/ui.ts
var portablePluginUiIconTokens = [
  "download",
  "edit",
  "open",
  "play",
  "refresh",
  "settings",
  "sparkles",
  "upload"
];
var commandIdPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
var placementIdPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
var groupIdPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
var maximumCommands = 128;
var maximumPlacementsPerSurface = 128;
var maximumOrderMagnitude = 1e4;
function isRecord2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function record4(value, label) {
  if (!isRecord2(value))
    throw new TypeError(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${label} must be a plain object`);
  return value;
}
function exactKeys3(value, required, optional, label) {
  const expected = new Set([...required, ...optional]);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) || Object.keys(value).some((key) => !expected.has(key))) {
    throw new TypeError(`${label} contains unsupported or missing fields`);
  }
}
function text2(value, label, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${label} must be a bounded, trimmed string`);
  }
  return value;
}
function stableId(value, label, pattern, maximum) {
  const id = text2(value, label, maximum);
  if (!pattern.test(id))
    throw new TypeError(`${label} must be a stable Plugin-local id`);
  return id;
}
function order(value, label) {
  if (!Number.isSafeInteger(value) || Number(value) < -maximumOrderMagnitude || Number(value) > maximumOrderMagnitude) {
    throw new TypeError(`${label} must be a bounded safe integer`);
  }
  return Number(value);
}
function localizedText(value, label) {
  const input = record4(value, label);
  exactKeys3(input, ["default"], ["zh-CN"], label);
  return Object.freeze({
    default: text2(input.default, `${label}.default`, 120),
    ...input["zh-CN"] === undefined ? {} : { "zh-CN": text2(input["zh-CN"], `${label}.zh-CN`, 120) }
  });
}
function isPortablePluginUiIconToken(value) {
  return portablePluginUiIconTokens.some((token) => token === value);
}
function command(value, index) {
  const label = `Plugin UI commands[${index}]`;
  const input = record4(value, label);
  exactKeys3(input, ["id", "title", "target"], ["icon"], label);
  const target = record4(input.target, `${label}.target`);
  if (target.type !== "renderer-message") {
    throw new TypeError(`${label}.target.type must be renderer-message`);
  }
  exactKeys3(target, ["type", "message"], [], `${label}.target`);
  const icon = input.icon;
  if (icon !== undefined && !isPortablePluginUiIconToken(icon)) {
    throw new TypeError(`${label}.icon must be a supported Host icon token`);
  }
  return Object.freeze({
    id: stableId(input.id, `${label}.id`, commandIdPattern, 128),
    title: localizedText(input.title, `${label}.title`),
    target: Object.freeze({
      type: "renderer-message",
      message: text2(target.message, `${label}.target.message`, 128)
    }),
    ...icon === undefined ? {} : { icon }
  });
}
function placementBase(value, label, required, optional) {
  const input = record4(value, label);
  exactKeys3(input, required, optional, label);
  return {
    input,
    id: stableId(input.id, `${label}.id`, placementIdPattern, 128),
    command: stableId(input.command, `${label}.command`, commandIdPattern, 128),
    ...input.order === undefined ? {} : { order: order(input.order, `${label}.order`) }
  };
}
function toolbarItem(value, index) {
  const { input: _input, ...placement } = placementBase(value, `Plugin UI toolbar[${index}]`, ["id", "command"], ["order"]);
  return Object.freeze(placement);
}
function menuItem(value, index) {
  const label = `Plugin UI menus[${index}]`;
  const base = placementBase(value, label, ["id", "command", "placement"], ["group", "order"]);
  if (base.input.placement !== "overflow") {
    throw new TypeError(`${label}.placement must be overflow`);
  }
  const group = base.input.group === undefined ? undefined : stableId(base.input.group, `${label}.group`, groupIdPattern, 64);
  const { input: _input, ...placement } = base;
  return Object.freeze({
    ...placement,
    placement: "overflow",
    ...group === undefined ? {} : { group }
  });
}
function boundedArray(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new TypeError(`${label} must be a bounded array`);
  }
  return value;
}
function assertUnique(items, label) {
  const ids = new Set;
  for (const item of items) {
    if (ids.has(item.id))
      throw new TypeError(`${label} contains a duplicate id: ${item.id}`);
    ids.add(item.id);
  }
}
function assertUniqueCommandReferences(items, label) {
  const commandIds = new Set;
  for (const item of items) {
    if (commandIds.has(item.command)) {
      throw new TypeError(`${label} contains a duplicate command reference: ${item.command}`);
    }
    commandIds.add(item.command);
  }
}
function parsePortablePluginCanvasUiContribution(value) {
  const input = record4(value, "Plugin Canvas UI contribution");
  exactKeys3(input, [], ["commands", "menus", "toolbar"], "Plugin Canvas UI contribution");
  const commands = Object.freeze(boundedArray(input.commands === undefined ? [] : input.commands, "Plugin UI commands", maximumCommands).map(command));
  const menus = Object.freeze(boundedArray(input.menus === undefined ? [] : input.menus, "Plugin UI menus", maximumPlacementsPerSurface).map(menuItem));
  const toolbar = Object.freeze(boundedArray(input.toolbar === undefined ? [] : input.toolbar, "Plugin UI toolbar", maximumPlacementsPerSurface).map(toolbarItem));
  assertUnique(commands, "Plugin UI commands");
  assertUnique(menus, "Plugin UI menus");
  assertUnique(toolbar, "Plugin UI toolbar");
  const placementIds = new Set(menus.map((item) => item.id));
  const duplicatePlacementId = toolbar.find((item) => placementIds.has(item.id));
  if (duplicatePlacementId) {
    throw new TypeError(`Plugin UI placements contain a duplicate id: ${duplicatePlacementId.id}`);
  }
  assertUniqueCommandReferences(menus, "Plugin UI menus");
  assertUniqueCommandReferences(toolbar, "Plugin UI toolbar");
  const commandIds = new Set(commands.map((item) => item.id));
  const unknownReference = [...menus, ...toolbar].find((item) => !commandIds.has(item.command));
  if (unknownReference) {
    throw new TypeError(`Plugin UI placement references an unknown command: ${unknownReference.command}`);
  }
  const referencedCommandIds = new Set([...menus, ...toolbar].map((item) => item.command));
  const unplacedCommand = commands.find((item) => !referencedCommandIds.has(item.id));
  if (unplacedCommand) {
    throw new TypeError(`Plugin UI command has no owning-node placement: ${unplacedCommand.id}`);
  }
  return Object.freeze({ commands, menus, toolbar });
}

// src/canvas.ts
var portablePluginCanvasSelectionActionEditors = [
  "time-point",
  "time-range",
  "crop-region",
  "confirmation",
  "immediate"
];
function isPortablePluginCanvasSelectionActionEditor(value) {
  return portablePluginCanvasSelectionActionEditors.some((editor) => editor === value);
}
function parseSelectionActionTarget(value, label) {
  if (value === "image" || value === "video")
    return value;
  throw new TypeError(`${label} target must be image or video`);
}
function parseDimension(value, label) {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 8192) {
    throw new TypeError(`${label} must be an integer between 1 and 8192`);
  }
  return Number(value);
}
function parseRenderer(value) {
  const input = portableRecord(value, "Canvas renderer contribution");
  assertPortableKeys(input, ["create", "extensions", "height", "mimeTypes", "nodeKinds", "width"], "Canvas renderer contribution");
  if (input.create !== undefined && typeof input.create !== "boolean") {
    throw new TypeError("Canvas renderer create must be a boolean");
  }
  const extensions = parsePortableStringArray(input.extensions, "Canvas renderer extensions", (item) => {
    const normalized = item.toLowerCase();
    if (!/^\.[a-z0-9][a-z0-9._+-]{0,31}$/u.test(normalized)) {
      throw new TypeError(`Invalid Canvas renderer extension: ${item}`);
    }
    return normalized;
  });
  const mimeTypes = parsePortableStringArray(input.mimeTypes, "Canvas renderer MIME types", (item) => {
    const normalized = item.toLowerCase();
    if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(normalized)) {
      throw new TypeError(`Invalid Canvas renderer MIME type: ${item}`);
    }
    return normalized;
  });
  const nodeKinds = parsePortableStringArray(input.nodeKinds, "Canvas renderer node kinds", (item) => {
    if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(item)) {
      throw new TypeError(`Invalid Canvas renderer node kind: ${item}`);
    }
    return item;
  });
  if (input.create !== true && !extensions?.length && !mimeTypes?.length && !nodeKinds?.length) {
    throw new TypeError("Canvas renderer must be creatable or match an extension, MIME type, or node kind");
  }
  return {
    ...input.create === undefined ? {} : { create: input.create },
    ...extensions === undefined ? {} : { extensions },
    ...input.height === undefined ? {} : { height: parseDimension(input.height, "Canvas renderer height") },
    ...mimeTypes === undefined ? {} : { mimeTypes },
    ...nodeKinds === undefined ? {} : { nodeKinds },
    ...input.width === undefined ? {} : { width: parseDimension(input.width, "Canvas renderer width") }
  };
}
function localizedText2(value, label, maximum) {
  const input = portableRecord(value, label);
  assertPortableKeys(input, ["default", "zh-CN"], label);
  return {
    default: portableText(input.default, `${label} default`, maximum),
    ...input["zh-CN"] === undefined ? {} : { "zh-CN": portableText(input["zh-CN"], `${label} zh-CN`, maximum) }
  };
}
function parseSelectionActions(value) {
  const actions = portableArray(value, "Canvas selection actions", 32, true).map((item, index) => {
    const label = `Canvas selection action ${index}`;
    const input = portableRecord(item, label);
    if (input.action !== undefined) {
      assertPortableKeys(input, ["action", "description", "id", "target", "title"], label);
      const id2 = parsePortableStableId(input.id, `${label} id`);
      if (input.target !== "video")
        throw new TypeError(`${label} target must be video`);
      const action = portableRecord(input.action, `${label} action`);
      assertPortableKeys(action, ["connect", "type"], `${label} action`);
      if (action.type !== "materialize-own-plugin-node" || action.connect !== "selection-to-created") {
        throw new TypeError(`${label} materialization action is not supported`);
      }
      return {
        action: {
          connect: "selection-to-created",
          type: "materialize-own-plugin-node"
        },
        description: localizedText2(input.description, `${label} description`, 2000),
        id: id2,
        target: "video",
        title: localizedText2(input.title, `${label} title`, 120)
      };
    }
    assertPortableKeys(input, ["description", "editor", "id", "presentation", "steps", "target", "title"], label);
    const id = parsePortableStableId(input.id, `${label} id`);
    const target = parseSelectionActionTarget(input.target, label);
    if (!isPortablePluginCanvasSelectionActionEditor(input.editor)) {
      throw new TypeError(`${label} editor is not supported`);
    }
    const editor = input.editor;
    if (editor === "immediate" !== (target === "image" && input.presentation === "cutout-scan") || input.presentation !== undefined && input.presentation !== "cutout-scan") {
      throw new TypeError(`${label} immediate editor requires image target and cutout-scan presentation`);
    }
    const steps = portableArray(input.steps, `${label} steps`, 16, true).map((step, stepIndex) => {
      const stepLabel = `${label} step ${stepIndex}`;
      const stepInput = portableRecord(step, stepLabel);
      assertPortableKeys(stepInput, ["tool"], stepLabel);
      return { tool: parsePortableStableId(stepInput.tool, `${stepLabel} tool`) };
    });
    if (editor !== "confirmation" && steps.length !== 1) {
      throw new TypeError(`${label} editor requires exactly one step`);
    }
    return {
      description: localizedText2(input.description, `${label} description`, 2000),
      editor,
      id,
      ...input.presentation === undefined ? {} : { presentation: "cutout-scan" },
      steps,
      target,
      title: localizedText2(input.title, `${label} title`, 120)
    };
  });
  if (new Set(actions.map((action) => action.id)).size !== actions.length) {
    throw new TypeError("Canvas selection actions contain duplicate ids");
  }
  return actions;
}
function parsePortablePluginCanvasContribution(value) {
  const input = portableRecord(value, "Canvas contributions");
  assertPortableKeys(input, ["commands", "menus", "renderer", "selectionActions", "toolbar"], "Canvas contributions");
  const parsedUi = parsePortablePluginCanvasUiContribution({
    ...input.commands === undefined ? {} : { commands: input.commands },
    ...input.menus === undefined ? {} : { menus: input.menus },
    ...input.toolbar === undefined ? {} : { toolbar: input.toolbar }
  });
  return {
    ...input.commands === undefined ? {} : { commands: parsedUi.commands },
    ...input.menus === undefined ? {} : { menus: parsedUi.menus },
    ...input.renderer === undefined ? {} : { renderer: parseRenderer(input.renderer) },
    ...input.selectionActions === undefined ? {} : { selectionActions: parseSelectionActions(input.selectionActions) },
    ...input.toolbar === undefined ? {} : { toolbar: parsedUi.toolbar }
  };
}

// src/generation.ts
var portablePluginGenerationModalities = ["text", "image", "video", "audio"];
var portablePluginGenerationInputRoles = [
  "reference_image",
  "reference_video",
  "first_frame",
  "last_frame",
  "audio",
  "text"
];
var allowedGenerationModalities = new Set(portablePluginGenerationModalities);
var allowedGenerationInputRoles = new Set(portablePluginGenerationInputRoles);
var agentToolIdPattern = /^[a-z][a-z0-9_]{0,63}$/;
function parseGenerationInputRoles(value, label) {
  const input = portableArray(value, label, portablePluginGenerationInputRoles.length);
  const roles = input.map((role) => {
    if (typeof role !== "string" || !allowedGenerationInputRoles.has(role)) {
      throw new TypeError(`${label} contain an unsupported or duplicate role`);
    }
    return role;
  });
  if (new Set(roles).size !== roles.length) {
    throw new TypeError(`${label} contain an unsupported or duplicate role`);
  }
  return roles;
}
function parsePortablePluginGenerationContribution(value) {
  const input = portableRecord(value, "Generation contribution");
  assertPortableKeys(input, ["models", "tools"], "Generation contribution");
  if (!Object.prototype.hasOwnProperty.call(input, "models")) {
    throw new TypeError("convax.plugin/8 generation models must be declared explicitly");
  }
  const tools = portableArray(input.tools, "Generation tools", 64, true).map((value2, index) => {
    const label = `Generation tool ${index}`;
    const tool = portableRecord(value2, label);
    assertPortableKeys(tool, ["acceptedInputs", "delivery", "description", "id", "inputBinding", "output", "recovery", "title"], label);
    const id = parsePortableStableId(tool.id, `${label} id`);
    if (typeof tool.output !== "string" || !allowedGenerationModalities.has(tool.output)) {
      throw new TypeError(`${label} output is not supported`);
    }
    if (tool.delivery !== undefined && tool.delivery !== "canvas" && tool.delivery !== "return") {
      throw new TypeError(`${label} delivery is not supported`);
    }
    if (tool.delivery === "return" && tool.output !== "text") {
      throw new TypeError(`${label} return delivery requires text output`);
    }
    const acceptedInputs = parseGenerationInputRoles(tool.acceptedInputs, `${label} acceptedInputs`);
    if (tool.inputBinding !== undefined && tool.inputBinding !== "direct-incoming") {
      throw new TypeError(`${label} input binding is not supported`);
    }
    if (tool.inputBinding === "direct-incoming" && acceptedInputs.length === 0) {
      throw new TypeError(`${label} direct-incoming input binding requires accepted inputs`);
    }
    let recovery;
    if (tool.recovery !== undefined) {
      const recoveryInput = portableRecord(tool.recovery, `${label} recovery`);
      assertPortableKeys(recoveryInput, ["mode", "schema"], `${label} recovery`);
      if (recoveryInput.schema !== "convax.generation-lro/1" || recoveryInput.mode !== "long-running-operation") {
        throw new TypeError(`${label} recovery contract is not supported`);
      }
      recovery = { mode: "long-running-operation", schema: "convax.generation-lro/1" };
    }
    return {
      acceptedInputs,
      ...tool.delivery === undefined ? {} : { delivery: tool.delivery },
      description: portableText(tool.description, `${label} description`, 2000),
      id,
      ...tool.inputBinding === undefined ? {} : { inputBinding: tool.inputBinding },
      output: tool.output,
      ...recovery === undefined ? {} : { recovery },
      title: portableText(tool.title, `${label} title`, 120)
    };
  });
  if (new Set(tools.map((tool) => tool.id)).size !== tools.length) {
    throw new TypeError("Generation tools contain duplicate ids");
  }
  const models = portableArray(input.models, "Generation models", tools.length).map((value2, index) => {
    const label = `Generation model ${index}`;
    const model = portableRecord(value2, label);
    assertPortableKeys(model, ["name", "tool"], label);
    return {
      name: portableText(model.name, `${label} name`, 120),
      tool: parsePortableStableId(model.tool, `${label} tool`)
    };
  });
  if (new Set(models.map((model) => model.tool)).size !== models.length) {
    throw new TypeError("Generation models contain duplicate tool references");
  }
  const modelToolIds = new Set(models.map((model) => model.tool));
  const returnedModel = tools.find((tool) => tool.delivery === "return" && modelToolIds.has(tool.id));
  if (returnedModel) {
    throw new TypeError(`Generation model cannot reference a return-delivery operation: ${returnedModel.id}`);
  }
  const boundModel = tools.find((tool) => tool.inputBinding !== undefined && modelToolIds.has(tool.id));
  if (boundModel) {
    throw new TypeError(`Generation model cannot reference an input-bound operation: ${boundModel.id}`);
  }
  return { models, tools };
}
function parseAgentTools(value) {
  const tools = portableArray(value, "Agent tools", 32, true).map((value2, index) => {
    const label = `Agent tool ${index}`;
    const tool = portableRecord(value2, label);
    assertPortableKeys(tool, ["id", "tool"], label);
    const id = portableText(tool.id, `${label} id`, 64);
    if (!agentToolIdPattern.test(id))
      throw new TypeError(`${label} id must use lower snake_case`);
    return { id, tool: parsePortableStableId(tool.tool, `${label} generation tool`) };
  });
  if (new Set(tools.map((tool) => tool.id)).size !== tools.length) {
    throw new TypeError("Agent tools contain duplicate ids");
  }
  if (new Set(tools.map((tool) => tool.tool)).size !== tools.length) {
    throw new TypeError("Agent tools contain duplicate generation tool references");
  }
  return tools;
}
function parseAgentRemoteMcp(value) {
  const input = portableRecord(value, "Agent remote MCP contribution");
  assertPortableKeys(input, ["headers", "oauth", "type", "url"], "Agent remote MCP contribution");
  if (input.type !== "remote")
    throw new TypeError("Agent MCP type must be remote");
  const url = portableText(input.url, "Agent remote MCP URL", 2048);
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:" || parsedUrl.username !== "" || parsedUrl.password !== "" || parsedUrl.hash !== "") {
      throw new TypeError;
    }
  } catch {
    throw new TypeError("Agent remote MCP URL must be an absolute HTTPS URL without credentials or a fragment");
  }
  if (input.oauth !== undefined && input.oauth !== "auto" && input.oauth !== "none") {
    throw new TypeError("Agent remote MCP oauth must be auto or none");
  }
  let headers;
  if (input.headers !== undefined) {
    const headerInput = portableRecord(input.headers, "Agent remote MCP headers");
    const entries = Object.entries(headerInput);
    if (entries.length > 16)
      throw new TypeError("Agent remote MCP headers must contain at most 16 entries");
    const names = new Set;
    headers = {};
    for (const [name, value2] of entries) {
      if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u.test(name)) {
        throw new TypeError(`Agent remote MCP header name is invalid: ${name}`);
      }
      const normalizedName = name.toLowerCase();
      if (names.has(normalizedName)) {
        throw new TypeError(`Agent remote MCP headers contain a duplicate name: ${name}`);
      }
      if (normalizedName === "authorization" || normalizedName === "cookie" || normalizedName === "proxy-authorization") {
        throw new TypeError(`Agent remote MCP header is not allowed: ${name}`);
      }
      const literal2 = portableText(value2, `Agent remote MCP header ${name}`, 2048);
      if (/\{(?:env|file):/iu.test(literal2) || /\$\{[^}]*\}/u.test(literal2)) {
        throw new TypeError(`Agent remote MCP header ${name} must be a literal value`);
      }
      names.add(normalizedName);
      headers[name] = literal2;
    }
  }
  return {
    ...headers === undefined ? {} : { headers },
    oauth: input.oauth === "none" ? "none" : "auto",
    type: "remote",
    url
  };
}
function parsePortablePluginAgentContribution(value) {
  const input = portableRecord(value, "Agent contribution");
  assertPortableKeys(input, ["mcp", "tools"], "Agent contribution");
  const tools = input.tools === undefined ? undefined : parseAgentTools(input.tools);
  const mcp = input.mcp === undefined ? undefined : parseAgentRemoteMcp(input.mcp);
  if (tools === undefined && mcp === undefined) {
    throw new TypeError("Agent contribution must declare tools or mcp");
  }
  return {
    ...mcp === undefined ? {} : { mcp },
    ...tools === undefined ? {} : { tools }
  };
}
function validatePortableToolReferences(input) {
  const tools = new Map(input.generation?.tools.map((tool) => [tool.id, tool]) ?? []);
  const modelToolIds = new Set(input.generation?.models.map((model) => model.tool) ?? []);
  for (const modelToolId of modelToolIds) {
    if (!tools.has(modelToolId)) {
      throw new TypeError(`Generation model references an unknown tool: ${modelToolId}`);
    }
  }
  for (const agentTool of input.agent?.tools ?? []) {
    if (!tools.has(agentTool.tool)) {
      throw new TypeError(`Agent tool references an unknown generation tool: ${agentTool.tool}`);
    }
    if (modelToolIds.has(agentTool.tool)) {
      throw new TypeError(`Agent tool must reference an operation, not a generation model: ${agentTool.tool}`);
    }
  }
  for (const action of input.selectionActions ?? []) {
    if (!("steps" in action))
      continue;
    for (const step of action.steps) {
      const tool = tools.get(step.tool);
      if (!tool) {
        throw new TypeError(`Canvas selection action references an unknown generation tool: ${step.tool}`);
      }
      if (modelToolIds.has(step.tool)) {
        throw new TypeError(`Canvas selection action must reference an operation, not a generation model: ${step.tool}`);
      }
      if (tool.inputBinding !== undefined) {
        throw new TypeError(`Canvas selection action cannot reference an input-bound operation: ${step.tool}`);
      }
      const referenceRole = action.target === "image" ? "reference_image" : "reference_video";
      if (!tool.acceptedInputs.includes(referenceRole)) {
        throw new TypeError(`Canvas ${action.target} selection action tool must accept ${referenceRole}: ${step.tool}`);
      }
      if (tool.delivery === "return") {
        if (action.editor !== "confirmation") {
          throw new TypeError(`Canvas return-delivery operation requires a confirmation editor: ${step.tool}`);
        }
        if (action.steps.length !== 1) {
          throw new TypeError(`Canvas return-delivery operation requires exactly one step: ${step.tool}`);
        }
        if (tool.output !== "text") {
          throw new TypeError(`Canvas return-delivery operation must return text: ${step.tool}`);
        }
      } else if (action.target === "image" && (action.editor !== "immediate" || action.presentation !== "cutout-scan" || action.steps.length !== 1 || tool.output !== "image")) {
        throw new TypeError(`Canvas image output requires one immediate image operation with cutout-scan presentation: ${step.tool}`);
      }
    }
  }
}

// src/runtime-contributions.ts
var portablePluginServiceActions = [
  "authorize",
  "reauthorize",
  "authorization.cancel",
  "checkout",
  "sign_out"
];
var allowedServiceActions = new Set(portablePluginServiceActions);
function parsePortablePluginServiceContribution(value) {
  const input = portableRecord(value, "Service contribution");
  assertPortableKeys(input, ["actions"], "Service contribution");
  const actions = portableArray(input.actions, "Service actions", portablePluginServiceActions.length).map((action) => {
    if (typeof action !== "string" || !allowedServiceActions.has(action)) {
      throw new TypeError("Service actions contain an unsupported or duplicate action");
    }
    return action;
  });
  if (new Set(actions).size !== actions.length) {
    throw new TypeError("Service actions contain an unsupported or duplicate action");
  }
  return { actions };
}
function parsePortablePluginLlmContribution(value) {
  const input = portableRecord(value, "LLM contribution");
  assertPortableKeys(input, ["modelCatalog", "models", "provider"], "LLM contribution");
  const provider = portableRecord(input.provider, "LLM provider");
  assertPortableKeys(provider, ["id", "name"], "LLM provider");
  const providerId = portableText(provider.id, "LLM provider id", 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(providerId)) {
    throw new TypeError("LLM provider id must use kebab-case");
  }
  if (input.modelCatalog !== undefined && input.modelCatalog !== "runtime") {
    throw new TypeError("LLM model catalog must be runtime");
  }
  const models = portableArray(input.models, "LLM models", 32, true).map((value2, index) => {
    const label = `LLM model ${index}`;
    const model = portableRecord(value2, label);
    assertPortableKeys(model, ["id", "name"], label);
    const id = portableText(model.id, `${label} id`, 128);
    if (!/^~?[a-z0-9]+(?:[._/:-][a-z0-9]+)*$/u.test(id)) {
      throw new TypeError(`${label} id is invalid`);
    }
    return { id, name: portableText(model.name, `${label} name`, 120) };
  });
  if (new Set(models.map((model) => model.id)).size !== models.length) {
    throw new TypeError("LLM models contain duplicate ids");
  }
  return {
    ...input.modelCatalog === undefined ? {} : { modelCatalog: "runtime" },
    models,
    provider: {
      id: providerId,
      name: portableText(provider.name, "LLM provider name", 120)
    }
  };
}
function parsePortablePluginPetContribution(value) {
  const input = portableRecord(value, "Pet contribution");
  assertPortableKeys(input, ["library", "overlay", "protocol", "settings"], "Pet contribution");
  const library = parsePortablePluginRelativePath(input.library, "Pet library");
  const overlay = parsePortablePluginRelativePath(input.overlay, "Pet overlay");
  const settings = parsePortablePluginRelativePath(input.settings, "Pet settings");
  if (!library.toLowerCase().endsWith(".json")) {
    throw new TypeError("Pet library must be a JSON file");
  }
  if (!overlay.toLowerCase().endsWith(".html")) {
    throw new TypeError("Pet overlay must be an HTML file");
  }
  if (!settings.toLowerCase().endsWith(".html")) {
    throw new TypeError("Pet settings must be an HTML file");
  }
  if (input.protocol !== "convax.pet-host/1") {
    throw new TypeError("Pet protocol must equal convax.pet-host/1");
  }
  return { library, overlay, protocol: "convax.pet-host/1", settings };
}
function parsePortablePluginRuntime(value) {
  const input = portableRecord(value, "Plugin runtime");
  assertPortableKeys(input, ["args", "command", "type"], "Plugin runtime");
  if (input.type !== "mcp-stdio") {
    throw new TypeError("Plugin runtime type must be mcp-stdio");
  }
  const command2 = portableText(input.command, "Plugin runtime command", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(command2)) {
    throw new TypeError("Plugin runtime command must be a bare executable name");
  }
  validatePortablePluginSegment(command2);
  let args;
  if (input.args !== undefined) {
    args = portableArray(input.args, "Plugin runtime args", 64).map((value2, index) => {
      const argument = portableText(value2, `Plugin runtime arg ${index}`, 1024);
      if (/[\s"'`;|&`$(){}[\]<>]/u.test(argument) || argument.includes("\\") || /(^|=)(?:\/|[A-Za-z]:)/u.test(argument) || /(^|[=/])\.{1,2}(?:\/|$)/u.test(argument)) {
        throw new TypeError(`Plugin runtime arg ${index} must be a static CLI token without code, native paths, or traversal`);
      }
      return argument;
    });
  }
  return { ...args === undefined ? {} : { args }, command: command2, type: "mcp-stdio" };
}

// src/skills.ts
var agentSkillPluginApis = new Set(pluginApiCatalog.apis.filter((definition) => definition.audience.includes("agent-skill")).map((definition) => definition.id));
var agentToolIdPattern2 = /^[a-z][a-z0-9_]{0,63}$/;
function skillName(value, label) {
  const name = portableText(value, label, 64);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) {
    throw new TypeError(`${label} must use kebab-case`);
  }
  validatePortablePluginSegment(name);
  return name;
}
function parseSkillUses(value, label, hostApi) {
  const input = portableRecord(value, label);
  assertPortableKeys(input, ["optionalHostApis", "pluginTools", "requiredHostApis"], label);
  const declaration = parseRuntimePluginApiDeclaration({
    major: PLUGIN_API_CATALOG_MAJOR,
    required: input.requiredHostApis ?? [],
    optional: input.optionalHostApis ?? []
  });
  const topLevelRequired = new Set(hostApi.required);
  const topLevelDeclared = new Set([...hostApi.required, ...hostApi.optional]);
  for (const id of declaration.required) {
    if (!topLevelRequired.has(id)) {
      throw new TypeError(`${label} required Host API must be required by the Plugin: ${id}`);
    }
    if (isPluginApiId(id) && !agentSkillPluginApis.has(id)) {
      throw new TypeError(`${label} Host API is not available to Agent Skills: ${id}`);
    }
  }
  for (const id of declaration.optional) {
    if (!topLevelDeclared.has(id)) {
      throw new TypeError(`${label} optional Host API must be declared by the Plugin: ${id}`);
    }
    if (isPluginApiId(id) && !agentSkillPluginApis.has(id)) {
      throw new TypeError(`${label} Host API is not available to Agent Skills: ${id}`);
    }
  }
  let pluginTools;
  if (input.pluginTools !== undefined) {
    pluginTools = portableArray(input.pluginTools, `${label} pluginTools`, 32, true).map((value2, index) => {
      const id = portableText(value2, `${label} pluginTools ${index}`, 64);
      if (!agentToolIdPattern2.test(id)) {
        throw new TypeError(`${label} plugin tool id must use lower snake_case: ${id}`);
      }
      return id;
    });
    if (new Set(pluginTools).size !== pluginTools.length) {
      throw new TypeError(`${label} pluginTools contain duplicate ids`);
    }
  }
  if (declaration.required.length === 0 && declaration.optional.length === 0 && pluginTools === undefined) {
    throw new TypeError(`${label} must declare at least one Host API or Plugin tool`);
  }
  return {
    ...declaration.optional.length === 0 ? {} : { optionalHostApis: [...declaration.optional] },
    ...pluginTools === undefined ? {} : { pluginTools },
    ...declaration.required.length === 0 ? {} : { requiredHostApis: [...declaration.required] }
  };
}
function parsePortablePluginSkills(value, hostApi) {
  if (value === undefined)
    return;
  const skills = portableArray(value, "Plugin Skill contributions", 32, true).map((value2, index) => {
    const label = `Plugin Skill contribution ${index}`;
    const input = portableRecord(value2, label);
    assertPortableKeys(input, ["name", "path", "uses"], label);
    const name = skillName(input.name, `${label} name`);
    const path = parsePortablePluginRelativePath(input.path, `${label} path`);
    if (path.split("/").at(-1) !== name) {
      throw new TypeError(`${label} path must name its Skill directory: ${name}`);
    }
    const uses = input.uses === undefined ? undefined : parseSkillUses(input.uses, `${label} uses`, hostApi);
    return { name, path, ...uses === undefined ? {} : { uses } };
  });
  if (new Set(skills.map((skill) => skill.name)).size !== skills.length) {
    throw new TypeError("Plugin Skill contributions contain duplicate names");
  }
  if (new Set(skills.map((skill) => skill.path.toLocaleLowerCase("en-US"))).size !== skills.length) {
    throw new TypeError("Plugin Skill contributions contain duplicate paths");
  }
  return skills;
}
function validatePortableSkillToolReferences(skills, agent) {
  const declaredTools = new Set(agent?.tools?.map((tool) => tool.id) ?? []);
  for (const skill of skills ?? []) {
    for (const tool of skill.uses?.pluginTools ?? []) {
      if (!declaredTools.has(tool)) {
        throw new TypeError(`Plugin Skill ${skill.name} references an unknown Agent tool: ${tool}`);
      }
    }
  }
}

// src/manifest.ts
var portablePluginManifestV8Schema = "convax.plugin/8";
var portablePluginManifestFileName = "manifest.json";
var portablePluginCapabilities = [
  "canvas.connectedImages.read",
  "canvas.connectedInputs.read",
  "canvas.connectedMedia.stream",
  "canvas.node.read",
  "canvas.node.write",
  "canvas.image.write",
  "project.files.read",
  "agent.prompt",
  "generation.execute",
  "ui.fullscreen",
  "projects.read",
  "canvas.catalog.read",
  "canvas.document.read",
  "canvas.document.write",
  "canvas.events.subscribe",
  "pet.activity.read",
  "pet.activity.open",
  "pet.preferences.write",
  "pet.custom.manage"
];
var portablePluginProjectCanvasCapabilities = [
  "projects.read",
  "canvas.catalog.read",
  "canvas.document.read",
  "canvas.document.write",
  "canvas.events.subscribe"
];
var portablePluginPetCapabilities = [
  "pet.activity.read",
  "pet.activity.open",
  "pet.preferences.write",
  "pet.custom.manage"
];
var requiredPortablePluginPetCapabilities = [
  "pet.activity.read",
  "pet.activity.open",
  "pet.preferences.write"
];
var allowedCapabilities = new Set(portablePluginCapabilities);
var allowedPetCapabilities = new Set(portablePluginPetCapabilities);
function parseCapabilities(value) {
  const capabilities = portableArray(value ?? [], "Plugin capabilities", portablePluginCapabilities.length).map((capability) => {
    if (typeof capability !== "string" || !allowedCapabilities.has(capability)) {
      throw new TypeError("Plugin capabilities contain an unsupported or duplicate capability");
    }
    return capability;
  });
  if (new Set(capabilities).size !== capabilities.length) {
    throw new TypeError("Plugin capabilities contain an unsupported or duplicate capability");
  }
  return capabilities;
}
function parseEntryAndHooks(input) {
  const entry = input.entry === undefined ? undefined : parsePortablePluginRelativePath(input.entry, "Plugin entry");
  if (entry !== undefined && !entry.toLowerCase().endsWith(".html")) {
    throw new TypeError("Plugin entry must be an HTML file");
  }
  const hooks = input.hooks === undefined ? undefined : parsePortablePluginRelativePath(input.hooks, "Plugin hooks");
  if (hooks !== undefined && !/\.(?:js|mjs)$/u.test(hooks)) {
    throw new TypeError("Plugin hooks must be a JavaScript ESM module");
  }
  return { entry, hooks };
}
function validateCanvasEnvelope(input) {
  const { capabilities, canvas, entry, hostApi } = input;
  if (entry !== undefined !== (canvas?.renderer !== undefined)) {
    throw new TypeError("Plugin entry and Canvas renderer must appear together");
  }
  if (entry !== undefined && !hostApi.required.includes("host.context.get")) {
    throw new TypeError("convax.plugin/8 Web Plugins must require host.context.get");
  }
  if ((canvas?.commands !== undefined || canvas?.menus !== undefined || canvas?.toolbar !== undefined) && canvas.renderer === undefined) {
    throw new TypeError("Canvas UI commands require a sandboxed Canvas renderer");
  }
  if (capabilities.includes("generation.execute") && canvas?.renderer === undefined) {
    throw new TypeError("generation.execute requires a sandboxed Canvas surface");
  }
  if (canvas && canvas.renderer === undefined && !canvas.selectionActions?.length && !canvas.commands?.length && !canvas.menus?.length && !canvas.toolbar?.length) {
    throw new TypeError("Canvas contributions must declare a renderer, selection actions, or UI commands");
  }
  if (canvas?.selectionActions?.some((action) => ("action" in action) && action.action.type === "materialize-own-plugin-node") && canvas.renderer === undefined) {
    throw new TypeError("materialize-own-plugin-node requires the contributing Plugin renderer");
  }
}
function validatePetEnvelope(capabilities, pet, runtime) {
  if (pet === undefined)
    return;
  if (capabilities.length < requiredPortablePluginPetCapabilities.length || capabilities.length > portablePluginPetCapabilities.length || requiredPortablePluginPetCapabilities.some((capability) => !capabilities.includes(capability)) || capabilities.some((capability) => !allowedPetCapabilities.has(capability))) {
    throw new TypeError("Pet capabilities must include pet.activity.read, pet.activity.open, and pet.preferences.write; pet.custom.manage is optional");
  }
  if (runtime !== undefined)
    throw new TypeError("Pet feature cannot declare an executable runtime");
}
function parsePortablePluginManifestV8(value, options = {}) {
  const input = portableRecord(value, "Plugin manifest");
  assertPortableKeys(input, [
    "capabilities",
    "contributes",
    "description",
    "entry",
    "hooks",
    "hostApi",
    "id",
    "name",
    "runtime",
    "schema",
    "version"
  ], "Plugin manifest");
  if (input.schema !== portablePluginManifestV8Schema) {
    throw new TypeError("Plugin manifest must use convax.plugin/8");
  }
  if (!Object.prototype.hasOwnProperty.call(input, "hostApi")) {
    throw new TypeError("convax.plugin/8 must declare hostApi explicitly");
  }
  const hostApi = options.hostApiMode === "authoring" ? parsePluginApiDeclaration(input.hostApi) : parseRuntimePluginApiDeclaration(input.hostApi);
  const capabilities = parseCapabilities(input.capabilities);
  const rawContributions = portableRecord(input.contributes, "Plugin contributions");
  assertPortableKeys(rawContributions, ["agent", "canvas", "capabilities", "generation", "llm", "pet", "service", "skills"], "Plugin contributions");
  const { entry, hooks } = parseEntryAndHooks(input);
  const canvas = rawContributions.canvas === undefined ? undefined : parsePortablePluginCanvasContribution(rawContributions.canvas);
  validateCanvasEnvelope({ capabilities, canvas, entry, hostApi });
  const agent = rawContributions.agent === undefined ? undefined : parsePortablePluginAgentContribution(rawContributions.agent);
  const interPluginCapabilities = rawContributions.capabilities === undefined ? undefined : parsePluginCapabilityDeclaration(rawContributions.capabilities);
  const generation = rawContributions.generation === undefined ? undefined : parsePortablePluginGenerationContribution(rawContributions.generation);
  const llm = rawContributions.llm === undefined ? undefined : parsePortablePluginLlmContribution(rawContributions.llm);
  const pet = rawContributions.pet === undefined ? undefined : parsePortablePluginPetContribution(rawContributions.pet);
  const service = rawContributions.service === undefined ? undefined : parsePortablePluginServiceContribution(rawContributions.service);
  const skills = parsePortablePluginSkills(rawContributions.skills, hostApi);
  const runtime = input.runtime === undefined ? undefined : parsePortablePluginRuntime(input.runtime);
  const hasExecutableContribution = generation !== undefined || service !== undefined || llm !== undefined || Boolean(interPluginCapabilities?.exports.length);
  if (runtime !== undefined !== hasExecutableContribution) {
    if (interPluginCapabilities?.exports.length && runtime === undefined) {
      throw new TypeError("Plugin capability exports require a verified mcp-stdio runtime");
    }
    throw new TypeError("convax.plugin/8 runtime and executable contribution must appear together");
  }
  if (interPluginCapabilities?.exports.length && runtime === undefined) {
    throw new TypeError("Plugin capability exports require a verified mcp-stdio runtime");
  }
  validatePetEnvelope(capabilities, pet, runtime);
  validatePortableToolReferences({
    agent,
    generation,
    selectionActions: canvas?.selectionActions
  });
  validatePortableSkillToolReferences(skills, agent);
  const projectCanvasCapabilities = new Set(portablePluginProjectCanvasCapabilities);
  const hasProjectCanvasCapability = capabilities.some((capability) => projectCanvasCapabilities.has(capability));
  if (canvas?.renderer === undefined && !canvas?.selectionActions?.length && !hasExecutableContribution && hooks === undefined && !capabilities.includes("generation.execute") && !hasProjectCanvasCapability && pet === undefined && (interPluginCapabilities?.exports.length ?? 0) === 0 && agent?.mcp === undefined) {
    throw new TypeError("convax.plugin/8 must declare a Plugin capability beyond owned Skills");
  }
  return deepFreezePortable({
    capabilities,
    contributes: {
      ...agent === undefined ? {} : { agent },
      ...interPluginCapabilities === undefined ? {} : { capabilities: interPluginCapabilities },
      ...canvas === undefined ? {} : { canvas },
      ...generation === undefined ? {} : { generation },
      ...llm === undefined ? {} : { llm },
      ...pet === undefined ? {} : { pet },
      ...service === undefined ? {} : { service },
      ...skills === undefined ? {} : { skills }
    },
    description: portableText(input.description, "Plugin description", 2000),
    ...entry === undefined ? {} : { entry },
    ...hooks === undefined ? {} : { hooks },
    hostApi,
    id: parsePortablePluginId(input.id),
    name: portableText(input.name, "Plugin name", 120),
    ...runtime === undefined ? {} : { runtime },
    schema: portablePluginManifestV8Schema,
    version: parsePortablePluginVersion(input.version)
  });
}
function parsePluginManifestV8(value) {
  return parsePortablePluginManifestV8(value, { hostApiMode: "authoring" });
}

// src/client.ts
class PluginHostProtocolError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "PluginHostProtocolError";
    this.code = code;
  }
}

class PluginHostRemoteError extends Error {
  code;
  kind;
  recoverable;
  constructor(failure) {
    super(failure.message);
    this.name = "PluginHostRemoteError";
    this.code = failure.code;
    this.kind = failure.kind;
    this.recoverable = failure.recoverable;
  }
}

class PluginHostAbortError extends Error {
  reason;
  constructor(reason) {
    super("Plugin Host request was aborted");
    this.name = "AbortError";
    this.reason = reason;
  }
}
var clientSequence = 0;
function defaultRequestIdPrefix() {
  clientSequence += 1;
  return `sdk-${Date.now().toString(36)}-${clientSequence.toString(36)}`;
}
function assertRequestIdPrefix(value) {
  if (value.length < 1 || value.length > 96 || value !== value.trim() || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new TypeError("Plugin Host requestIdPrefix is invalid");
  }
}
function requirementFor(manifest, capabilityId) {
  const declaration = manifest.contributes.capabilities;
  const required = declaration?.imports.required.find((entry) => entry.id === capabilityId);
  if (required)
    return { import: required, requirement: "required" };
  const optional = declaration?.imports.optional.find((entry) => entry.id === capabilityId);
  if (optional)
    return { import: optional, requirement: "optional" };
  throw new TypeError(`Plugin capability import is not declared: ${capabilityId}`);
}
function protocolOrApiFailure(method, failure) {
  const parsed = failure.kind === "protocol" ? parsePluginHostProtocolRemoteFailure(failure) : parsePluginApiRemoteFailure(method, failure);
  return new PluginHostRemoteError(parsed);
}
function protocolOrCapabilityFailure(failure) {
  const parsed = failure.kind === "protocol" ? parsePluginHostProtocolRemoteFailure(failure) : parsePluginCapabilityRemoteFailure(failure);
  return new PluginHostRemoteError(parsed);
}
function createPluginHostClient(options) {
  const manifest = parsePluginManifestV8(options.manifest);
  if (manifest.entry === undefined || !manifest.hostApi.required.includes("host.context.get")) {
    throw new TypeError("Plugin Host Web client requires an entry and required host.context.get negotiation baseline");
  }
  const prefix = options.requestIdPrefix ?? defaultRequestIdPrefix();
  assertRequestIdPrefix(prefix);
  const pending = new Map;
  const commandListeners = new Set;
  let cachedHostContext;
  let pendingHostContextRefresh;
  let sequence = 0;
  let closed = false;
  const rejectPending = (error) => {
    for (const request of pending.values()) {
      request.abort?.();
      request.reject(error);
    }
    pending.clear();
  };
  const closeWith = (error, fatal = true) => {
    if (closed)
      return;
    closed = true;
    options.port.removeEventListener("message", onMessage);
    commandListeners.clear();
    cachedHostContext = undefined;
    pendingHostContextRefresh = undefined;
    rejectPending(error);
    const disconnect = {
      protocol: pluginHostProtocolV8,
      type: "disconnect"
    };
    try {
      assertPluginHostMessageByteLength(disconnect, maximumPluginHostControlBytes, "Plugin Host disconnect");
      post(disconnect);
    } catch {}
    try {
      options.port.close();
    } catch {}
    if (!fatal)
      return;
    try {
      options.onFatalError?.(error);
    } catch {}
  };
  const nextRequestId = () => {
    if (sequence >= Number.MAX_SAFE_INTEGER) {
      const error = new PluginHostProtocolError("request-id-exhausted", "Plugin Host request id space is exhausted");
      closeWith(error);
      throw error;
    }
    sequence += 1;
    const id = `${prefix}-${sequence.toString(36)}`;
    if (!isPluginHostRequestId(id)) {
      const error = new PluginHostProtocolError("request-id-exhausted", "Plugin Host request id is invalid");
      closeWith(error);
      throw error;
    }
    return id;
  };
  const assertOutgoingSize = (message, maximumBytes) => {
    assertPluginHostMessageByteLength(message, maximumBytes, "Plugin Host request");
  };
  const post = (message) => {
    options.port.postMessage(message);
  };
  const dispatch = (envelope, parseResult, limits, signal) => {
    if (closed) {
      return Promise.reject(new PluginHostProtocolError("closed", "Plugin Host client is closed"));
    }
    if (signal?.aborted)
      return Promise.reject(new PluginHostAbortError(signal.reason));
    if (pending.size >= maximumPluginHostInFlightRequests) {
      return Promise.reject(new RangeError(`Plugin Host client permits at most ${maximumPluginHostInFlightRequests} in-flight requests`));
    }
    try {
      assertOutgoingSize(envelope, limits.maximumRequestBytes);
    } catch (error) {
      return Promise.reject(error);
    }
    const id = envelope.id;
    return new Promise((resolve, reject) => {
      const abort = signal ? () => {
        const current = pending.get(id);
        if (!current)
          return;
        pending.delete(id);
        current.abort?.();
        const cancel = { id, protocol: pluginHostProtocolV8, type: "cancel" };
        try {
          assertOutgoingSize(cancel, maximumPluginCapabilityRequestBytes);
          post(cancel);
        } catch (cause) {
          const error = new PluginHostProtocolError("transport-failed", cause instanceof Error ? cause.message : "Plugin Host cancel failed");
          reject(error);
          closeWith(error);
          return;
        }
        reject(new PluginHostAbortError(signal.reason));
      } : undefined;
      const removeAbort = abort ? () => {
        signal.removeEventListener("abort", abort);
      } : undefined;
      pending.set(id, {
        abort: removeAbort,
        maximumResponseBytes: limits.maximumResponseBytes,
        parseFailure: limits.parseFailure,
        parseResult,
        reject,
        resolve
      });
      if (abort)
        signal.addEventListener("abort", abort, { once: true });
      try {
        post(envelope);
      } catch (cause) {
        closeWith(new PluginHostProtocolError("transport-failed", cause instanceof Error ? cause.message : "Plugin Host transport failed"));
      }
    });
  };
  function onMessage(event) {
    if (closed)
      return;
    let size2;
    try {
      size2 = assertPluginHostMessageByteLength(event.data, maximumPluginHostResponseBytes, "Plugin Host response");
    } catch {
      closeWith(new PluginHostProtocolError("invalid-envelope", "Plugin Host sent a non-JSON message"));
      return;
    }
    if (isPluginHostCommand(event.data)) {
      try {
        for (const listener of commandListeners)
          listener(event.data);
      } catch {
        closeWith(new PluginHostProtocolError("invalid-envelope", "Plugin Host command listener failed"));
      }
      return;
    }
    if (!isPluginHostResponse(event.data)) {
      closeWith(new PluginHostProtocolError("invalid-envelope", "Plugin Host sent an invalid envelope"));
      return;
    }
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) {
      closeWith(new PluginHostProtocolError("unknown-response", `Plugin Host returned an unknown, duplicate, or late response id: ${response.id}`));
      return;
    }
    if (size2 > request.maximumResponseBytes) {
      closeWith(new PluginHostProtocolError("invalid-envelope", `Plugin Host response exceeds ${request.maximumResponseBytes} bytes for this request`));
      return;
    }
    if (!response.ok) {
      try {
        const error = request.parseFailure(response.error);
        pending.delete(response.id);
        request.abort?.();
        request.reject(error);
      } catch (cause) {
        closeWith(new PluginHostProtocolError("invalid-result", cause instanceof Error ? cause.message : "Plugin Host returned an invalid failure"));
      }
      return;
    }
    try {
      const result = request.parseResult(response.result);
      pending.delete(response.id);
      request.abort?.();
      request.resolve(result);
    } catch (cause) {
      closeWith(new PluginHostProtocolError("invalid-result", cause instanceof Error ? cause.message : "Plugin Host returned an invalid result"));
    }
  }
  options.port.addEventListener("message", onMessage);
  options.port.start?.();
  const callHostApiRuntime = (method, args) => {
    if (!isPluginApiDeclared(manifest.hostApi, method)) {
      return Promise.reject(new TypeError(`Plugin Host API is not declared: ${method}`));
    }
    const contract2 = pluginApiMethodContracts[method];
    const params = contract2.params.type === "none" ? undefined : args[0];
    const callOptions = contract2.params.type === "none" ? args[0] : args[1];
    let parsedParams;
    try {
      const parseParams = parsePluginApiParams;
      parsedParams = parseParams(method, params);
    } catch (error) {
      return Promise.reject(error);
    }
    const id = nextRequestId();
    const envelope = {
      id,
      method,
      ...parsedParams === undefined ? {} : { params: parsedParams },
      protocol: pluginHostProtocolV8,
      type: "request"
    };
    const wire = getPluginApiWireContract(method);
    const parseResult = parsePluginApiResult;
    return dispatch(envelope, (result) => {
      const parsed = parseResult(method, result);
      if (method === "host.context.get") {
        cachedHostContext = parsed;
      }
      return parsed;
    }, {
      maximumRequestBytes: wire.request.maxBytes,
      maximumResponseBytes: wire.result.maxBytes,
      parseFailure: (failure) => {
        const error = protocolOrApiFailure(method, failure);
        if (error.kind === "api" && error.code === "stale-context")
          cachedHostContext = undefined;
        return error;
      }
    }, callOptions?.signal);
  };
  const client = {
    get closed() {
      return closed;
    },
    callHostApi(method, ...args) {
      return callHostApiRuntime(method, args);
    },
    async getHostApiAvailability(apiId, availabilityOptions) {
      if (!isPluginApiDeclared(manifest.hostApi, apiId)) {
        throw new TypeError(`Plugin Host API is not declared: ${apiId}`);
      }
      const context = !cachedHostContext || availabilityOptions?.refresh ? await client.refreshHostApiContext(availabilityOptions) : cachedHostContext;
      const definition = getPluginApiDefinition(apiId);
      return context.hostApi.availability.find(({ id }) => id === apiId) ?? {
        available: false,
        contractSince: definition.contractSince,
        id: apiId,
        reason: "unsupported-host",
        recoverable: false,
        since: definition.since
      };
    },
    refreshHostApiContext(callOptions) {
      cachedHostContext = undefined;
      if (pendingHostContextRefresh)
        return pendingHostContextRefresh;
      const refresh = callHostApiRuntime("host.context.get", [callOptions]);
      const tracked = refresh.finally(() => {
        if (pendingHostContextRefresh === tracked)
          pendingHostContextRefresh = undefined;
      });
      pendingHostContextRefresh = tracked;
      return pendingHostContextRefresh;
    },
    async requireHostApi(apiId, availabilityOptions) {
      const availability2 = await client.getHostApiAvailability(apiId, availabilityOptions);
      if (!availability2.available)
        throw new PluginApiUnavailableError(availability2);
      return availability2;
    },
    getCapabilityAvailability(capabilityId, callOptions) {
      let imported;
      try {
        imported = requirementFor(manifest, capabilityId);
      } catch (error) {
        return Promise.reject(error);
      }
      const id = nextRequestId();
      const envelope = {
        capabilityId,
        id,
        protocol: pluginHostProtocolV8,
        type: "capability-availability"
      };
      return dispatch(envelope, (result) => {
        const availability2 = parsePluginHostCapabilityAvailability(result);
        if (availability2.capabilityId !== capabilityId || availability2.requirement !== imported.requirement) {
          throw new TypeError("Plugin capability availability does not match the declared import");
        }
        return availability2;
      }, {
        maximumRequestBytes: maximumPluginCapabilityRequestBytes,
        maximumResponseBytes: maximumPluginCapabilityResponseBytes,
        parseFailure: protocolOrCapabilityFailure
      }, callOptions?.signal);
    },
    invokeCapability(capabilityId, input, callOptions) {
      let imported;
      try {
        imported = requirementFor(manifest, capabilityId);
        assertPluginCapabilityValue(imported.import.inputSchema, input, `Plugin capability ${capabilityId} input`);
      } catch (error) {
        return Promise.reject(error);
      }
      const id = nextRequestId();
      const envelope = {
        capabilityId,
        id,
        input,
        protocol: pluginHostProtocolV8,
        type: "capability-invoke"
      };
      return dispatch(envelope, (result) => {
        assertPluginCapabilityValue(imported.import.outputSchema, result, `Plugin capability ${capabilityId} output`);
        return result;
      }, {
        maximumRequestBytes: maximumPluginCapabilityRequestBytes,
        maximumResponseBytes: maximumPluginCapabilityResponseBytes,
        parseFailure: protocolOrCapabilityFailure
      }, callOptions?.signal);
    },
    onCommand(listener) {
      if (closed)
        throw new PluginHostProtocolError("closed", "Plugin Host client is closed");
      if (commandListeners.size >= 64)
        throw new RangeError("Plugin Host command listener limit exceeded");
      commandListeners.add(listener);
      return () => {
        commandListeners.delete(listener);
      };
    },
    close() {
      closeWith(new PluginHostProtocolError("closed", "Plugin Host client was closed"), false);
    }
  };
  return client;
}
export {
  pluginHostSuccess,
  pluginHostProtocolV8,
  pluginHostProtocolRemoteErrors,
  pluginHostFailure,
  pluginHostConnect,
  pluginCapabilityRemoteErrors,
  parsePluginHostProtocolRemoteFailure,
  parsePluginHostCapabilityAvailability,
  parsePluginCapabilityRemoteFailure,
  maximumPluginHostResponseBytes,
  maximumPluginHostRequestIdLength,
  maximumPluginHostRequestBytes,
  maximumPluginHostIngressEntries,
  maximumPluginHostIngressDepth,
  maximumPluginHostInFlightRequests,
  maximumPluginHostControlBytes,
  maximumPluginCapabilityResponseBytes,
  maximumPluginCapabilityRequestBytes,
  isPluginHostResponse,
  isPluginHostRequestId,
  isPluginHostRequest,
  isPluginHostDisconnect,
  isPluginHostConnect,
  isPluginHostCommand,
  isPluginHostCapabilityInvokeRequest,
  isPluginHostCapabilityAvailabilityRequest,
  isPluginHostCancel,
  createPluginHostClient,
  assertPluginHostMessageByteLength,
  PluginHostRemoteError,
  PluginHostProtocolError,
  PluginHostAbortError
};

//# debugId=08D79965C11C40D364756E2164756E21
//# sourceMappingURL=client.js.map
