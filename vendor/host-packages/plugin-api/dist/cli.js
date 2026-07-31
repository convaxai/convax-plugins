#!/usr/bin/env node

// src/cli.ts
import { resolve } from "node:path";

// src/generator.ts
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

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

// src/method-contracts.ts
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

// src/catalog-artifact.ts
var PLUGIN_API_CATALOG_ARTIFACT_SCHEMA = "convax.plugin-api-catalog/3";

// src/generator.ts
var PLUGIN_API_HISTORY_LEDGER_FILE = "ledger.json";
var PLUGIN_API_HISTORY_LEDGER_SCHEMA = "convax.plugin-api-history-ledger/1";
var MAXIMUM_HISTORY_ARTIFACT_BYTES = 16 * 1024 * 1024;
var MAXIMUM_RETIRED_HISTORY_RECEIPTS = 32;
var SHA256 = /^[a-f0-9]{64}$/;
var CATALOG_ARTIFACT_TOKEN = /^convax\.plugin-api-catalog\/[1-9][0-9]*$/;
var WIRE_SCHEMA_DIALECT_TOKEN = /^convax\.plugin-api-wire-schema\/[1-9][0-9]*$/;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function historyLineage(snapshot) {
  return snapshot.apis.map(({ id, since }) => ({ id, since }));
}
function sortRecord(value) {
  if (Array.isArray(value))
    return value.map(sortRecord);
  if (!isRecord(value))
    return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sortRecord(entry)]));
}
function stableJson(value) {
  const expanded = JSON.stringify(sortRecord(value), null, 2);
  const compactAudience = expanded.replace(/"audience": \[\n((?:\s+"(?:[^"\\]|\\.)*"(?:,)?\n)+)\s+\]/g, (_match, entries) => {
    const values = [...entries.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((entry) => `"${entry[1]}"`);
    return `"audience": [${values.join(", ")}]`;
  });
  return `${compactAudience}
`;
}
function assertExactKeys(record, allowed, label) {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(record).find((key) => !allowedKeys.has(key));
  if (unknown)
    throw new TypeError(`${label} contains unknown field: ${unknown}`);
}
function contractDigest(contract2) {
  return `sha256:${createHash("sha256").update(stableJson(contract2)).digest("hex")}`;
}
function normalizedContract(contract2) {
  const portable = sortRecord(contract2);
  return {
    dialect: portable.dialect,
    digest: contractDigest(portable),
    request: portable.request,
    result: portable.result
  };
}
function normalizedDefinition(definition) {
  const sourceContract = "contract" in definition ? {
    dialect: definition.contract.dialect,
    request: definition.contract.request,
    result: definition.contract.result
  } : pluginApiMethodContracts[definition.id] ? {
    dialect: pluginApiMethodContracts[definition.id].dialect,
    request: pluginApiMethodContracts[definition.id].request,
    result: pluginApiMethodContracts[definition.id].response
  } : undefined;
  if (!sourceContract) {
    throw new TypeError(`Plugin API ${definition.id} is missing its portable request/result contract`);
  }
  return {
    id: definition.id,
    since: definition.since,
    contractSince: definition.contractSince,
    audience: [...definition.audience].sort(),
    completion: definition.completion,
    grant: definition.grant,
    scope: definition.scope,
    sideEffect: definition.sideEffect,
    errors: [...definition.errors].sort((left, right) => left.code.localeCompare(right.code)).map((error) => ({ ...error })),
    docs: { ...definition.docs },
    contract: normalizedContract(sourceContract)
  };
}
function snapshotPluginApiCatalog(catalog = pluginApiCatalog) {
  return {
    schema: PLUGIN_API_CATALOG_ARTIFACT_SCHEMA,
    version: catalog.version,
    apis: [...catalog.apis].sort((left, right) => left.id.localeCompare(right.id)).map(normalizedDefinition)
  };
}
function renderPluginApiJson(catalog = pluginApiCatalog) {
  return stableJson(snapshotPluginApiCatalog(catalog));
}
function markdownCell(value) {
  return value.replaceAll("|", "\\|").replaceAll(`
`, " ");
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
function renderPluginApiMarkdown(catalog = pluginApiCatalog) {
  const snapshot = snapshotPluginApiCatalog(catalog);
  const lines = [
    "<!-- prettier-ignore-start -->",
    "",
    "# Convax Host API",
    "",
    "<!-- Generated by @convax/plugin-api. Do not edit. -->",
    "",
    `Catalog version: ${snapshot.version}`,
    "",
    'Host API failures use the closed `{ kind: "api", code, message, recoverable }` envelope.',
    "The code and recoverability must match the exact API error table below; malformed requests and transport failures use the separate SDK protocol-error namespace.",
    "Request and response byte limits are UTF-8 JSON envelope limits and are enforced per API.",
    "",
    "| API | Introduced | Current contract | Audience | Grant | Scope | Side effect | Completion | Errors |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];
  for (const definition of snapshot.apis) {
    lines.push(`| \`${definition.id}\` | ${definition.since} | ${definition.contractSince} | ${definition.audience.join(", ")} | ${definition.grant ? `\`${definition.grant}\`` : "none"} | ${definition.scope} | ${definition.sideEffect} | ${definition.completion} | ${definition.errors.map((error) => `\`${error.code}\``).join(", ")} |`);
  }
  lines.push("");
  for (const definition of snapshot.apis) {
    lines.push(`## \`${definition.id}\``, "", definition.docs.summary, "", definition.docs.description, "", `- Introduced: ${definition.since}`, `- Current contract since: ${definition.contractSince}`, `- Audience: ${definition.audience.join(", ")}`, `- Grant: ${definition.grant ? `\`${definition.grant}\`` : "none"}`, `- Scope: ${definition.scope}`, `- Side effect: ${definition.sideEffect}`, `- Completion: ${definition.completion}`, `- Request: ${definition.docs.request}`, `- Response: ${definition.docs.response}`, `- Request schema: ${renderMethodShape(pluginApiMethodContracts[definition.id].params)}`, `- Response schema: ${renderMethodShape(pluginApiMethodContracts[definition.id].result)}`, `- Request byte limit: ${definition.contract.request.maxBytes}`, `- Response byte limit: ${definition.contract.result.maxBytes}`, `- Contract digest: \`${definition.contract.digest}\``, `- Contract dialect: \`${definition.contract.dialect}\``);
    if (definition.docs.remarks)
      lines.push(`- Remarks: ${definition.docs.remarks}`);
    lines.push("", "#### Request contract", "", "```json", stableJson(definition.contract.request).trimEnd(), "```", "", "#### Response contract", "", "```json", stableJson(definition.contract.result).trimEnd(), "```");
    lines.push("", "### Errors", "");
    if (definition.errors.length === 0) {
      lines.push("No stable API-specific errors.", "");
    } else {
      lines.push("| Code | Recoverable | Meaning |", "| --- | --- | --- |");
      for (const error of definition.errors) {
        lines.push(`| \`${error.code}\` | ${error.recoverable ? "yes" : "no"} | ${markdownCell(error.description)} |`);
      }
      lines.push("");
    }
  }
  lines.push("<!-- prettier-ignore-end -->");
  return `${lines.join(`
`)}
`;
}
function versionParts(version) {
  const [major, minor, patch] = version.split(".");
  return [Number(major), Number(minor), Number(patch)];
}
function breakingProjection(definition) {
  return {
    id: definition.id,
    since: definition.since,
    audience: [...definition.audience].sort(),
    grant: definition.grant,
    scope: definition.scope,
    sideEffect: definition.sideEffect,
    completion: definition.completion,
    errors: [...definition.errors].sort((left, right) => left.code.localeCompare(right.code)).map((error) => ({ code: error.code, recoverable: error.recoverable })),
    request: definition.docs.request,
    response: definition.docs.response,
    contract: "contract" in definition ? definition.contract : undefined
  };
}
function contractDigestOf(definition) {
  return definition.contract.digest;
}
function checkPluginApiCompatibility(previousCatalog, nextCatalog) {
  const previous = snapshotPluginApiCatalog(previousCatalog);
  const next = snapshotPluginApiCatalog(nextCatalog);
  const issues = [];
  const versionComparison = pluginApiContractInternals.compareVersions(previous.version, next.version);
  if (versionComparison >= 0) {
    issues.push({
      kind: "invalid-version",
      message: `Catalog version must increase from ${previous.version}, received ${next.version}`
    });
    return issues;
  }
  const [previousMajor, previousMinor] = versionParts(previous.version);
  const [nextMajor, nextMinor] = versionParts(next.version);
  const majorChanged = nextMajor > previousMajor;
  const minorChanged = nextMajor === previousMajor && nextMinor > previousMinor;
  const previousById = new Map(previous.apis.map((definition) => [definition.id, definition]));
  const nextById = new Map(next.apis.map((definition) => [definition.id, definition]));
  for (const definition of previous.apis) {
    const nextDefinition = nextById.get(definition.id);
    if (!nextDefinition) {
      if (!majorChanged) {
        issues.push({
          kind: "api-removed",
          apiId: definition.id,
          message: `Removing Plugin API ${definition.id} requires a major version`
        });
      }
      continue;
    }
    if (definition.since !== nextDefinition.since) {
      issues.push({
        kind: "api-changed",
        apiId: definition.id,
        message: `Plugin API ${definition.id} since is immutable`
      });
      continue;
    }
    const contractChanged = contractDigestOf(definition) !== contractDigestOf(nextDefinition);
    if (contractChanged && nextDefinition.contractSince !== next.version) {
      issues.push({
        kind: "api-changed",
        apiId: definition.id,
        message: `Plugin API ${definition.id} changed contract must set contractSince to ${next.version}`
      });
      continue;
    }
    if (!contractChanged && definition.contractSince !== nextDefinition.contractSince) {
      issues.push({
        kind: "api-changed",
        apiId: definition.id,
        message: `Plugin API ${definition.id} unchanged contract must preserve contractSince`
      });
      continue;
    }
    if (stableJson(breakingProjection(definition)) !== stableJson(breakingProjection(nextDefinition)) && !majorChanged) {
      issues.push({
        kind: "api-changed",
        apiId: definition.id,
        message: `Changing Plugin API ${definition.id} requires a major version`
      });
    }
  }
  for (const definition of next.apis) {
    if (!previousById.has(definition.id) && definition.since !== next.version) {
      issues.push({
        kind: "api-added",
        apiId: definition.id,
        message: `New Plugin API ${definition.id} since must equal Catalog ${next.version}`
      });
      continue;
    }
    if (!previousById.has(definition.id) && definition.contractSince !== next.version) {
      issues.push({
        kind: "api-added",
        apiId: definition.id,
        message: `New Plugin API ${definition.id} contractSince must equal Catalog ${next.version}`
      });
      continue;
    }
    if (!previousById.has(definition.id) && !majorChanged && !minorChanged) {
      issues.push({
        kind: "api-added",
        apiId: definition.id,
        message: `Adding Plugin API ${definition.id} requires a minor version`
      });
    }
  }
  return issues;
}
function assertWireSchema(value, label, depth = 0) {
  if (depth > 64 || !isRecord(value))
    throw new TypeError(`${label} is not a bounded wire schema`);
  if (Array.isArray(value.oneOf)) {
    assertExactKeys(value, ["oneOf"], label);
    if (value.oneOf.length < 1 || value.oneOf.length > 32)
      throw new TypeError(`${label} oneOf is invalid`);
    value.oneOf.forEach((entry, index) => assertWireSchema(entry, `${label}.oneOf[${index}]`, depth + 1));
    return;
  }
  if ("const" in value) {
    assertExactKeys(value, ["const"], label);
    if (!["boolean", "number", "string"].includes(typeof value.const) || typeof value.const === "number" && !Number.isFinite(value.const)) {
      throw new TypeError(`${label} const is invalid`);
    }
    return;
  }
  if (value.type === "none" || value.type === "boolean" || value.type === "null") {
    assertExactKeys(value, ["type"], label);
    return;
  }
  if (value.type === "integer" || value.type === "number") {
    assertExactKeys(value, ["finite", "maximum", "minimum", "type"], label);
    if (value.finite !== true || value.minimum !== undefined && (typeof value.minimum !== "number" || !Number.isFinite(value.minimum)) || value.maximum !== undefined && (typeof value.maximum !== "number" || !Number.isFinite(value.maximum)) || typeof value.minimum === "number" && typeof value.maximum === "number" && value.maximum < value.minimum) {
      throw new TypeError(`${label} number contract is invalid`);
    }
    return;
  }
  if (value.type === "string") {
    assertExactKeys(value, ["controlCharacters", "enum", "maxLength", "minLength", "prefix", "refinement", "type"], label);
    if (value.controlCharacters !== false || !Number.isSafeInteger(value.maxLength) || !Number.isSafeInteger(value.minLength) || Number(value.minLength) < 0 || Number(value.maxLength) < Number(value.minLength) || Number(value.maxLength) > 32 * 1024 * 1024 || !(value.prefix === undefined || typeof value.prefix === "string") || !(value.refinement === undefined || value.refinement === "lowercase-sha256" || value.refinement === "portable-project-relative-path" || value.refinement === "safe-png-file-name" || value.refinement === "trimmed") || !(value.enum === undefined || Array.isArray(value.enum) && value.enum.length > 0 && value.enum.every((entry) => typeof entry === "string"))) {
      throw new TypeError(`${label} string contract is invalid`);
    }
    return;
  }
  if (value.type === "array") {
    assertExactKeys(value, ["items", "maxItems", "minItems", "type", "uniqueBy"], label);
    if (!Number.isSafeInteger(value.maxItems) || !Number.isSafeInteger(value.minItems) || Number(value.minItems) < 0 || Number(value.maxItems) < Number(value.minItems) || Number(value.maxItems) > 1e4 || !(value.uniqueBy === undefined || typeof value.uniqueBy === "string" && value.uniqueBy.length > 0)) {
      throw new TypeError(`${label} array contract is invalid`);
    }
    assertWireSchema(value.items, `${label}.items`, depth + 1);
    return;
  }
  if (value.type === "object") {
    assertExactKeys(value, ["additionalProperties", "products", "properties", "required", "type"], label);
    if (value.additionalProperties !== false || !isRecord(value.properties) || !Array.isArray(value.required) || !value.required.every((entry) => typeof entry === "string") || new Set(value.required).size !== value.required.length || value.required.some((entry) => !Object.prototype.hasOwnProperty.call(value.properties, entry))) {
      throw new TypeError(`${label} object contract is invalid`);
    }
    for (const [key, entry] of Object.entries(value.properties)) {
      if (key.length < 1 || key.length > 128)
        throw new TypeError(`${label} property name is invalid`);
      assertWireSchema(entry, `${label}.properties.${key}`, depth + 1);
    }
    if (value.products !== undefined) {
      if (!Array.isArray(value.products) || value.products.length < 1 || value.products.length > 16) {
        throw new TypeError(`${label} product constraints are invalid`);
      }
      for (const [index, candidate] of value.products.entries()) {
        const productLabel = `${label}.products[${index}]`;
        if (!isRecord(candidate))
          throw new TypeError(`${productLabel} must be an object`);
        assertExactKeys(candidate, ["fields", "maximum"], productLabel);
        if (!Array.isArray(candidate.fields) || candidate.fields.length < 2 || candidate.fields.length > 8 || !candidate.fields.every((field) => typeof field === "string" && field.length >= 1 && field.length <= 128) || new Set(candidate.fields).size !== candidate.fields.length || !Number.isSafeInteger(candidate.maximum) || Number(candidate.maximum) < 1) {
          throw new TypeError(`${productLabel} is invalid`);
        }
        for (const field of candidate.fields) {
          if (typeof field !== "string")
            throw new TypeError(`${productLabel} field is invalid`);
          const factor = value.properties[field];
          if (!value.required.includes(field) || !isRecord(factor) || factor.type !== "integer" && factor.type !== "number" || factor.finite !== true || typeof factor.minimum !== "number" || factor.minimum < 0) {
            throw new TypeError(`${productLabel}.${field} is not a required non-negative numeric property`);
          }
        }
      }
    }
    return;
  }
  if (value.type === "json-object") {
    assertExactKeys(value, ["keyMaxLength", "maxBytes", "maxDepth", "type"], label);
    if (!Number.isSafeInteger(value.keyMaxLength) || !Number.isSafeInteger(value.maxBytes) || !Number.isSafeInteger(value.maxDepth) || Number(value.keyMaxLength) < 1 || Number(value.maxBytes) < 1 || Number(value.maxBytes) > 32 * 1024 * 1024 || Number(value.maxDepth) < 1 || Number(value.maxDepth) > 64) {
      throw new TypeError(`${label} JSON object contract is invalid`);
    }
    return;
  }
  throw new TypeError(`${label} has an unknown wire schema kind`);
}
function parseContractSnapshot(value, label) {
  if (!isRecord(value))
    throw new TypeError(`${label} must be an object`);
  assertExactKeys(value, ["dialect", "digest", "request", "result"], label);
  if (value.dialect !== pluginApiWireSchemaDialect) {
    throw new TypeError(`${label} dialect is invalid`);
  }
  const dialect = pluginApiWireSchemaDialect;
  if (typeof value.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.digest)) {
    throw new TypeError(`${label} digest is invalid`);
  }
  const parseLimit = (candidate, limitLabel) => {
    if (!isRecord(candidate))
      throw new TypeError(`${limitLabel} must be an object`);
    assertExactKeys(candidate, ["maxBytes", "schema"], limitLabel);
    if (!Number.isSafeInteger(candidate.maxBytes) || Number(candidate.maxBytes) < 1 || Number(candidate.maxBytes) > 32 * 1024 * 1024) {
      throw new TypeError(`${limitLabel} maxBytes is invalid`);
    }
    assertWireSchema(candidate.schema, `${limitLabel}.schema`);
    return {
      maxBytes: Number(candidate.maxBytes),
      schema: candidate.schema
    };
  };
  const request = parseLimit(value.request, `${label}.request`);
  const result = parseLimit(value.result, `${label}.result`);
  const normalized = normalizedContract({ dialect, request, result });
  if (normalized.digest !== value.digest)
    throw new TypeError(`${label} digest does not match its contract`);
  return normalized;
}
function assertSnapshot(value, label) {
  if (!isRecord(value))
    throw new TypeError(`${label} must be an object`);
  const record = value;
  assertExactKeys(record, ["schema", "version", "apis"], label);
  if (record.schema !== PLUGIN_API_CATALOG_ARTIFACT_SCHEMA || typeof record.version !== "string") {
    throw new TypeError(`${label} is not a Plugin API catalog snapshot`);
  }
  pluginApiContractInternals.assertVersion(record.version, `${label} version`);
  if (!Array.isArray(record.apis))
    throw new TypeError(`${label} apis must be an array`);
  const ids = new Set;
  const apiEntries = record.apis;
  for (const entry of apiEntries) {
    if (!isRecord(entry))
      throw new TypeError(`${label} API is invalid`);
    const definition = entry;
    assertExactKeys(definition, [
      "id",
      "since",
      "contractSince",
      "audience",
      "completion",
      "grant",
      "scope",
      "sideEffect",
      "errors",
      "docs",
      "contract"
    ], `${label} API`);
    if (typeof definition.id !== "string" || ids.has(definition.id))
      throw new TypeError(`${label} API id is invalid`);
    const id = definition.id;
    ids.add(id);
    if (typeof definition.since !== "string" || typeof definition.contractSince !== "string") {
      throw new TypeError(`${label} API ${id} is incomplete`);
    }
    pluginApiContractInternals.assertVersion(definition.since, `${label} API ${id} since`);
    pluginApiContractInternals.assertVersion(definition.contractSince, `${label} API ${id} contractSince`);
    if (pluginApiContractInternals.compareVersions(definition.since, record.version) > 0) {
      throw new TypeError(`${label} API ${id} has a future since version`);
    }
    if (pluginApiContractInternals.compareVersions(definition.contractSince, definition.since) < 0) {
      throw new TypeError(`${label} API ${id} contractSince precedes since`);
    }
    if (pluginApiContractInternals.compareVersions(definition.contractSince, record.version) > 0) {
      throw new TypeError(`${label} API ${id} has a future contractSince version`);
    }
    if (!Array.isArray(definition.audience) || !(typeof definition.grant === "string" || definition.grant === null) || typeof definition.completion !== "string" || typeof definition.scope !== "string" || typeof definition.sideEffect !== "string" || !Array.isArray(definition.errors) || !isRecord(definition.docs)) {
      throw new TypeError(`${label} API ${id} is incomplete`);
    }
    const audience = parseAudience(definition.audience, `${label} API ${id} audience`);
    const scope = parseScope(definition.scope, `${label} API ${id} scope`);
    const sideEffect = parseSideEffect(definition.sideEffect, `${label} API ${id} sideEffect`);
    const completion = parseCompletion(definition.completion, `${label} API ${id} completion`);
    const docs = definition.docs;
    assertExactKeys(docs, ["summary", "description", "request", "response", "remarks"], `${label} API docs`);
    if (typeof docs.summary !== "string" || typeof docs.description !== "string" || typeof docs.request !== "string" || typeof docs.response !== "string" || !(docs.remarks === undefined || typeof docs.remarks === "string")) {
      throw new TypeError(`${label} API ${id} docs are invalid`);
    }
    const errorEntries = definition.errors;
    const errors = errorEntries.map((error) => {
      if (!isRecord(error)) {
        throw new TypeError(`${label} API ${id} error is invalid`);
      }
      assertExactKeys(error, ["code", "description", "recoverable"], `${label} API error`);
      if (typeof error.code !== "string" || typeof error.description !== "string" || typeof error.recoverable !== "boolean") {
        throw new TypeError(`${label} API ${id} error is invalid`);
      }
      return {
        code: error.code,
        description: error.description,
        recoverable: error.recoverable
      };
    });
    parseContractSnapshot(definition.contract, `${label} API ${id} contract`);
    definePluginApi({
      id,
      contractSince: definition.contractSince,
      audience,
      completion,
      grant: definition.grant,
      scope,
      sideEffect,
      errors,
      docs: {
        summary: docs.summary,
        description: docs.description,
        request: docs.request,
        response: docs.response,
        ...typeof docs.remarks === "string" ? { remarks: docs.remarks } : {}
      }
    });
  }
}
function parseAudience(value, label) {
  const audience = [];
  for (const entry of value) {
    if (!isAudience(entry))
      throw new TypeError(`${label} is invalid`);
    audience.push(entry);
  }
  return audience;
}
function isAudience(value) {
  return value === "web-plugin" || value === "agent-skill" || value === "companion" || value === "host";
}
function parseScope(value, label) {
  if (value === "connection" || value === "plugin" || value === "own-node" || value === "project" || value === "canvas") {
    return value;
  }
  throw new TypeError(`${label} is invalid`);
}
function parseSideEffect(value, label) {
  if (value === "none" || value === "read" || value === "write" || value === "execute" || value === "subscribe") {
    return value;
  }
  throw new TypeError(`${label} is invalid`);
}
function parseCompletion(value, label) {
  if (value === "cancelable" || value === "commit-preserving")
    return value;
  throw new TypeError(`${label} is invalid`);
}
function isMissingFileError(error) {
  return isRecord(error) && error.code === "ENOENT";
}
function parseHistoryLedger(value) {
  if (!isRecord(value))
    throw new TypeError("Plugin API history ledger must be an object");
  assertExactKeys(value, ["schema", "retired"], "Plugin API history ledger");
  if (value.schema !== PLUGIN_API_HISTORY_LEDGER_SCHEMA || !Array.isArray(value.retired)) {
    throw new TypeError("Plugin API history ledger is invalid");
  }
  if (value.retired.length > MAXIMUM_RETIRED_HISTORY_RECEIPTS) {
    throw new TypeError("Plugin API history ledger exceeds its retired receipt bound");
  }
  const versions = new Set;
  return value.retired.map((candidate, index) => {
    const label = `Plugin API history ledger retired receipt ${index}`;
    if (!isRecord(candidate))
      throw new TypeError(`${label} must be an object`);
    assertExactKeys(candidate, ["artifactSchema", "sha256", "version", "wireSchemaDialect"], label);
    if (typeof candidate.artifactSchema !== "string" || !CATALOG_ARTIFACT_TOKEN.test(candidate.artifactSchema) || typeof candidate.wireSchemaDialect !== "string" || !WIRE_SCHEMA_DIALECT_TOKEN.test(candidate.wireSchemaDialect) || typeof candidate.sha256 !== "string" || !SHA256.test(candidate.sha256) || typeof candidate.version !== "string") {
      throw new TypeError(`${label} is invalid`);
    }
    pluginApiContractInternals.assertVersion(candidate.version, `${label} version`);
    if (versions.has(candidate.version))
      throw new TypeError(`${label} duplicates version ${candidate.version}`);
    versions.add(candidate.version);
    return {
      artifactSchema: candidate.artifactSchema,
      sha256: candidate.sha256,
      version: candidate.version,
      wireSchemaDialect: candidate.wireSchemaDialect
    };
  });
}
function parseRetiredHistory(value, bytes, receipt, label) {
  const actualDigest = createHash("sha256").update(bytes).digest("hex");
  if (actualDigest !== receipt.sha256)
    throw new TypeError(`${label} differs from its immutable ledger digest`);
  if (!isRecord(value))
    throw new TypeError(`${label} must be an object`);
  assertExactKeys(value, ["schema", "version", "apis"], label);
  if (value.schema !== receipt.artifactSchema || value.version !== receipt.version || !Array.isArray(value.apis)) {
    throw new TypeError(`${label} does not match its retired ledger identity`);
  }
  if (value.apis.length < 1 || value.apis.length > 1024) {
    throw new TypeError(`${label} APIs are outside the retired audit bound`);
  }
  const ids = new Set;
  const lineage = value.apis.map((candidate, index) => {
    const apiLabel = `${label} API ${index}`;
    if (!isRecord(candidate) || !isRecord(candidate.contract)) {
      throw new TypeError(`${apiLabel} is incomplete`);
    }
    assertExactKeys(candidate.contract, ["dialect", "digest", "request", "result"], `${apiLabel} contract`);
    if (typeof candidate.id !== "string" || !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/.test(candidate.id) || ids.has(candidate.id) || typeof candidate.since !== "string" || candidate.contract.dialect !== receipt.wireSchemaDialect || typeof candidate.contract.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(candidate.contract.digest)) {
      throw new TypeError(`${apiLabel} has invalid retired audit tokens`);
    }
    const opaqueContract = {
      dialect: candidate.contract.dialect,
      request: candidate.contract.request,
      result: candidate.contract.result
    };
    const opaqueDigest = `sha256:${createHash("sha256").update(stableJson(opaqueContract)).digest("hex")}`;
    if (candidate.contract.digest !== opaqueDigest) {
      throw new TypeError(`${apiLabel} digest does not match its opaque contract bytes`);
    }
    pluginApiContractInternals.assertVersion(candidate.since, `${apiLabel} since`);
    if (pluginApiContractInternals.compareVersions(candidate.since, receipt.version) > 0) {
      throw new TypeError(`${apiLabel} has a future since version`);
    }
    ids.add(candidate.id);
    return { id: candidate.id, since: candidate.since };
  });
  return { version: receipt.version, lineage };
}
function historyMajor(version) {
  return Number(version.split(".")[0]);
}
function checkOpaqueMajorLineage(previous, next) {
  if (historyMajor(next.version) <= historyMajor(previous.version)) {
    return [
      {
        kind: "invalid-version",
        message: `Retired Plugin API history ${previous.version} can only transition to a later major, received ${next.version}`
      }
    ];
  }
  const previousById = new Map(previous.lineage.map((definition) => [definition.id, definition]));
  const nextById = new Map(next.lineage.map((definition) => [definition.id, definition]));
  const issues = [];
  for (const definition of previous.lineage) {
    const nextDefinition = nextById.get(definition.id);
    if (nextDefinition && nextDefinition.since !== definition.since) {
      issues.push({
        kind: "api-changed",
        apiId: definition.id,
        message: `Plugin API ${definition.id} since is immutable`
      });
    }
  }
  for (const definition of next.lineage) {
    if (!previousById.has(definition.id) && pluginApiContractInternals.compareVersions(definition.since, previous.version) <= 0) {
      issues.push({
        kind: "api-added",
        apiId: definition.id,
        message: `Plugin API ${definition.id} cannot claim introduction before retired history ${previous.version}`
      });
    }
  }
  return issues;
}
function checkHistoryCompatibility(previous, next) {
  if (previous.snapshot && next.snapshot)
    return checkPluginApiCompatibility(previous.snapshot, next.snapshot);
  return checkOpaqueMajorLineage(previous, next);
}
function assertHistoryContractReleases(history) {
  const releases = new Set(history.map(({ version }) => version));
  for (const entry of history) {
    if (!entry.snapshot)
      continue;
    for (const definition of entry.snapshot.apis) {
      if (!releases.has(definition.contractSince)) {
        throw new TypeError(`Plugin API ${definition.id} contractSince ${definition.contractSince} has no corresponding history release`);
      }
    }
  }
}
async function readHistory(historyDirectory) {
  const entries = await readdir(historyDirectory, { withFileTypes: true }).catch((error) => {
    if (isMissingFileError(error))
      return [];
    throw error;
  });
  const ledgerPath = join(historyDirectory, PLUGIN_API_HISTORY_LEDGER_FILE);
  const ledgerValue = await readFile(ledgerPath, "utf8").then((bytes) => JSON.parse(bytes)).catch((error) => {
    if (isMissingFileError(error))
      return { schema: PLUGIN_API_HISTORY_LEDGER_SCHEMA, retired: [] };
    if (error instanceof SyntaxError)
      throw new TypeError(`Plugin API history ledger is not valid JSON: ${ledgerPath}`);
    throw error;
  });
  const receipts = parseHistoryLedger(ledgerValue);
  const receiptsByVersion = new Map(receipts.map((receipt) => [receipt.version, receipt]));
  const seenReceipts = new Set;
  const snapshots = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === PLUGIN_API_HISTORY_LEDGER_FILE) {
      continue;
    }
    const path = join(historyDirectory, entry.name);
    const bytes = await readFile(path, "utf8");
    if (new TextEncoder().encode(bytes).byteLength > MAXIMUM_HISTORY_ARTIFACT_BYTES) {
      throw new TypeError(`Plugin API history exceeds its byte bound: ${path}`);
    }
    let value;
    try {
      value = JSON.parse(bytes);
    } catch {
      throw new TypeError(`Plugin API history is not valid JSON: ${path}`);
    }
    const version = basename(entry.name, ".json");
    pluginApiContractInternals.assertVersion(version, `Plugin API history filename ${entry.name}`);
    const receipt = receiptsByVersion.get(version);
    if (receipt) {
      snapshots.push(parseRetiredHistory(value, bytes, receipt, `Plugin API history ${entry.name}`));
      seenReceipts.add(receipt.version);
      continue;
    }
    assertSnapshot(value, `Plugin API history ${entry.name}`);
    if (version !== value.version) {
      throw new TypeError(`Plugin API history filename must match version: ${entry.name}`);
    }
    const snapshot = snapshotPluginApiCatalog(value);
    snapshots.push({ version: snapshot.version, lineage: historyLineage(snapshot), snapshot });
  }
  for (const receipt of receipts) {
    if (!seenReceipts.has(receipt.version)) {
      throw new TypeError(`Plugin API history ledger receipt is missing artifact ${receipt.version}.json`);
    }
  }
  snapshots.sort((left, right) => pluginApiContractInternals.compareVersions(left.version, right.version));
  for (let index = 1;index < snapshots.length; index += 1) {
    const issues = checkHistoryCompatibility(snapshots[index - 1], snapshots[index]);
    if (issues.length > 0)
      throw new TypeError(issues.map((issue) => issue.message).join(`
`));
  }
  assertHistoryContractReleases(snapshots);
  return snapshots;
}
function assertCurrentHistory(history, catalog) {
  if (history.length === 0)
    throw new TypeError("Plugin API history is empty; append the current catalog first");
  const current = snapshotPluginApiCatalog(catalog);
  const latest = history[history.length - 1];
  const comparison = pluginApiContractInternals.compareVersions(latest.version, current.version);
  if (comparison > 0)
    throw new TypeError(`Plugin API history ${latest.version} is newer than catalog ${current.version}`);
  if (comparison < 0) {
    const currentEntry = { version: current.version, lineage: historyLineage(current), snapshot: current };
    const issues = checkHistoryCompatibility(latest, currentEntry);
    if (issues.length > 0)
      throw new TypeError(issues.map((issue) => issue.message).join(`
`));
    throw new TypeError(`Plugin API history is missing current catalog ${current.version}; run history:append`);
  }
  if (!latest.snapshot || renderPluginApiJson(latest.snapshot) !== renderPluginApiJson(current)) {
    throw new TypeError(`Plugin API catalog ${current.version} differs from its immutable history snapshot`);
  }
}
async function atomicWrite(path, content) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 420 });
  await rename(temporary, path);
}
async function writeOrCheck(path, expected, check) {
  const actual = await readFile(path, "utf8").catch((error) => {
    if (isMissingFileError(error))
      return;
    throw error;
  });
  if (actual === expected)
    return false;
  if (check)
    return true;
  await atomicWrite(path, expected);
  return true;
}
async function generatePluginApiArtifacts(options) {
  const history = await readHistory(options.historyDirectory);
  assertCurrentHistory(history, pluginApiCatalog);
  const check = options.check === true;
  if (!check)
    await mkdir(options.outputDirectory, { recursive: true });
  const outputs = [
    ["plugin-api.json", renderPluginApiJson(pluginApiCatalog)],
    ["plugin-api.md", renderPluginApiMarkdown(pluginApiCatalog)]
  ];
  const changed = [];
  for (const [name, content] of outputs) {
    const path = join(options.outputDirectory, name);
    if (await writeOrCheck(path, content, check))
      changed.push(path);
  }
  return { changed, checked: check };
}
async function checkPluginApiHistory(historyDirectory) {
  assertCurrentHistory(await readHistory(historyDirectory), pluginApiCatalog);
}
async function appendPluginApiHistory(historyDirectory) {
  const history = await readHistory(historyDirectory);
  const current = snapshotPluginApiCatalog(pluginApiCatalog);
  const currentEntry = { version: current.version, lineage: historyLineage(current), snapshot: current };
  const latest = history.at(-1);
  if (latest) {
    const comparison = pluginApiContractInternals.compareVersions(latest.version, current.version);
    if (comparison > 0)
      throw new TypeError(`Plugin API history ${latest.version} is newer than catalog ${current.version}`);
    if (comparison === 0) {
      assertCurrentHistory(history, current);
      return join(historyDirectory, `${current.version}.json`);
    }
    const issues = checkHistoryCompatibility(latest, currentEntry);
    if (issues.length > 0)
      throw new TypeError(issues.map((issue) => issue.message).join(`
`));
  }
  await mkdir(historyDirectory, { recursive: true });
  const path = join(historyDirectory, `${current.version}.json`);
  await writeFile(path, renderPluginApiJson(current), { encoding: "utf8", flag: "wx", mode: 420 });
  return path;
}

// src/cli.ts
var packageRoot = process.cwd();
var outputDirectory = resolve(packageRoot, "generated");
var historyDirectory = resolve(packageRoot, "history");
var args = process.argv.slice(2);
var command = args[0]?.startsWith("--") ? "generate" : args[0] ?? "generate";
var check = args.includes("--check");
var unknown = args.filter((arg, index) => !(index === 0 && !arg.startsWith("--")) && arg !== "--check");
if (unknown.length > 0)
  throw new TypeError(`Unknown argument: ${unknown[0]}`);
switch (command) {
  case "generate": {
    const result = await generatePluginApiArtifacts({ outputDirectory, historyDirectory, check });
    if (check && result.changed.length > 0) {
      throw new Error(`Generated Plugin API artifacts are stale:
${result.changed.join(`
`)}`);
    }
    break;
  }
  case "compat":
    if (check)
      throw new TypeError("compat does not accept --check");
    await checkPluginApiHistory(historyDirectory);
    break;
  case "history:append":
    if (check)
      throw new TypeError("history:append does not accept --check");
    await appendPluginApiHistory(historyDirectory);
    break;
  default:
    throw new TypeError(`Unknown command: ${command}`);
}

//# debugId=7EE7289D4A62221C64756E2164756E21
//# sourceMappingURL=cli.js.map
