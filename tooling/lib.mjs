import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseJavaScriptModule } from "acorn";
import {
  createDeterministicZip as createMarketplaceZip,
  discoverMarketplacePackages,
} from "@convax/marketplace-kit";
import {
  parsePluginManifestV8,
  parsePortablePluginId,
  parsePortablePluginRelativePath,
  parsePortablePluginVersion,
  validatePortablePluginSegment,
} from "@convax/plugin-sdk";
import {
  parseAcceptedApiContracts,
} from "./host-capability-api-contracts.mjs";
import { validateHostCapabilityRequestDocument } from "./host-capability-request.mjs";

export const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const repository = "convaxai/convax-plugins";
export const maxFileBytes = 2 * 1024 * 1024;
export const maxPackageBytes = 10 * 1024 * 1024;
export const maxPluginEntries = 2_000;
export const maxSkillEntries = 512;
export const maxPosterBytes = 5 * 1024 * 1024;
export const maxAnimationBytes = 20 * 1024 * 1024;
export const maxCompanionBytes = 128 * 1024 * 1024;

const nativeExtensions = new Set([
  ".app",
  ".bat",
  ".cmd",
  ".com",
  ".dll",
  ".dylib",
  ".exe",
  ".msi",
  ".node",
  ".ps1",
  ".so",
  ".wasm",
]);
const pluginExecutableSourceExtensions = new Set([
  ".cjs",
  ".fish",
  ".jar",
  ".php",
  ".pl",
  ".py",
  ".rb",
  ".sh",
  ".ts",
  ".tsx",
  ".zsh",
]);
const showcaseMimes = {
  poster: new Map([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"],
  ]),
  animation: new Map([
    ["image/gif", ".gif"],
    ["video/mp4", ".mp4"],
  ]),
};

function error(label, message) {
  throw new Error(`${label}: ${message}`);
}

function inspectHookModuleSource(source, label, relativePath) {
  let program;
  try {
    program = parseJavaScriptModule(source, {
      allowHashBang: false,
      ecmaVersion: "latest",
      sourceType: "module",
    });
  } catch {
    error(label, `Hook module must be valid JavaScript: ${relativePath}`);
  }
  const hasPluginExport = program.body.some(
    (statement) =>
      statement.type === "ExportDefaultDeclaration" ||
      (statement.type === "ExportNamedDeclaration" &&
        (statement.declaration !== null || statement.specifiers.length > 0)),
  );
  const staticImports = [];
  let commonJsReference = false;
  let dynamicImport = false;
  const pending = [program];
  while (pending.length > 0) {
    const node = pending.pop();
    if (
      node.type === "Identifier" &&
      ["exports", "module", "require"].includes(node.name)
    ) {
      commonJsReference = true;
    } else if (node.type === "ImportExpression") {
      dynamicImport = true;
    } else if (node.type === "ImportDeclaration") {
      staticImports.push(String(node.source.value));
    } else if (node.type === "ExportNamedDeclaration" && node.source) {
      staticImports.push(String(node.source.value));
    } else if (node.type === "ExportAllDeclaration") {
      staticImports.push(String(node.source.value));
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          if (
            child &&
            typeof child === "object" &&
            typeof child.type === "string"
          ) {
            pending.push(child);
          }
        }
      } else if (
        value &&
        typeof value === "object" &&
        typeof value.type === "string"
      ) {
        pending.push(value);
      }
    }
  }
  return {
    commonJsReference,
    dynamicImport,
    hasPluginExport,
    staticImports,
  };
}

export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function exactKeys(value, allowed, required, label) {
  if (!isObject(value)) error(label, "must be an object");
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown) error(label, `unsupported field ${unknown}`);
  const missing = required.find((key) => !(key in value));
  if (missing) error(label, `missing field ${missing}`);
  return value;
}

function cleanString(value, label, maxLength) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length === 0 ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    error(label, "must be a non-empty trimmed string");
  }
  return value;
}

export const parseId = parsePortablePluginId;
export const parseSemver = parsePortablePluginVersion;
export const parseRelativePath = parsePortablePluginRelativePath;
export const validatePortableSegment = validatePortablePluginSegment;

const publicationBlockerCodes = new Set([
  "host-capability-review-required",
  "release-test-failed",
  "security-review-required",
  "unsupported-target",
  "unverified-runtime-dependency",
]);

function parsePublication(value, label) {
  exactKeys(value, ["blockers", "status"], ["blockers", "status"], label);
  if (value.status !== "ready" && value.status !== "blocked") {
    error(label, "status must be ready or blocked");
  }
  if (!Array.isArray(value.blockers) || value.blockers.length > 16) {
    error(label, "blockers must be an array with at most 16 items");
  }
  const blockers = value.blockers.map((item, index) => {
    const itemLabel = `${label} blocker ${index}`;
    exactKeys(item, ["code", "note"], ["code", "note"], itemLabel);
    const code = cleanString(item.code, `${itemLabel} code`, 80);
    if (!publicationBlockerCodes.has(code)) {
      error(itemLabel, `unsupported blocker code ${code}`);
    }
    return {
      code,
      note: cleanString(item.note, `${itemLabel} note`, 700),
    };
  });
  const blockerKeys = blockers.map(
    (item) => `${item.code}\0${item.note}`,
  );
  if (new Set(blockerKeys).size !== blockers.length) {
    error(label, "contains duplicate blockers");
  }
  if (value.status === "ready" && blockers.length !== 0) {
    error(label, "ready packages must not declare blockers");
  }
  if (value.status === "blocked" && blockers.length === 0) {
    error(label, "blocked packages must declare at least one blocker");
  }
  return {
    status: value.status,
    blockers: blockers.sort((left, right) =>
      left.code.localeCompare(right.code, "en") ||
      left.note.localeCompare(right.note, "en"),
    ),
  };
}

const pendingRequestStatus = "pending";
const pendingRequestDocumentStatus = "Status: pending human review";
const maximumHostCapabilityRequestsPerPackage = 16;

export function requiresSdkOwnedPetSurfaceClient(manifest, _files) {
  return manifest?.contributes?.pet?.protocol === "convax.pet-host/1";
}

export function assertPluginHostCapabilityDeclarations(
  manifest,
  _files,
  declarations,
  label = "Plugin",
) {
  const declared = new Set(declarations ?? []);
  const requiredRequests = [[
    requiresSdkOwnedPetSurfaceClient(manifest),
    "sdk-owned-pet-surface-client",
    "contains a handwritten Pet Host request transport instead of an SDK-owned client",
  ]];
  for (const [required, requestId, reason] of requiredRequests) {
    if (required && !declared.has(requestId)) {
      error(
        label,
        `${reason}; declare ${requestId} and remain publication-blocked pending human review`,
      );
    }
  }
}

export function parseHostCapabilityPolicy(
  value,
  label = "registry/host-capability-policy.json",
) {
  const isV2 = value?.schema === "convax.host-capability-policy/2";
  exactKeys(
    value,
    isV2 ? ["requests", "resolutions", "schema"] : ["requests", "schema"],
    isV2 ? ["requests", "resolutions", "schema"] : ["requests", "schema"],
    label,
  );
  if (
    value.schema !== "convax.host-capability-policy/1" &&
    value.schema !== "convax.host-capability-policy/2"
  ) {
    error(label, "unsupported schema");
  }
  if (
    !Array.isArray(value.requests) ||
    value.requests.length > 1_000
  ) {
    error(label, "requests must be an array with at most 1000 items");
  }
  const requests = value.requests.map((request, requestIndex) => {
    const requestLabel = `${label} request ${requestIndex}`;
    const requestKeys = isV2
      ? [
          "acceptedApiContracts",
          "affected",
          "document",
          "humanDecision",
          "id",
          "status",
        ]
      : ["affected", "document", "humanDecision", "id", "status"];
    exactKeys(
      request,
      requestKeys,
      requestKeys,
      requestLabel,
    );
    const id = cleanString(request.id, `${requestLabel} id`, 128);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      error(requestLabel, "id must be a lowercase kebab-case identifier");
    }
    const document = parseRelativePath(
      request.document,
      `${requestLabel} document`,
    );
    if (document !== `docs/host-capability-requests/${id}.md`) {
      error(
        requestLabel,
        `document must equal docs/host-capability-requests/${id}.md`,
      );
    }
    if (request.status !== pendingRequestStatus) {
      error(
        requestLabel,
        "only pending requests are accepted; approval requires a trusted, externally verified human decision receipt",
      );
    }
    if (request.humanDecision !== null) {
      error(
        requestLabel,
        "humanDecision must remain null until a trusted receipt verifier is introduced",
      );
    }
    if (
      !Array.isArray(request.affected) ||
      request.affected.length < 1 ||
      request.affected.length > 1_000
    ) {
      error(requestLabel, "affected must contain from 1 to 1000 package versions");
    }
    const affected = request.affected.map((item, itemIndex) => {
      const itemLabel = `${requestLabel} affected ${itemIndex}`;
      exactKeys(
        item,
        ["blocker", "id", "kind", "version"],
        ["blocker", "id", "kind", "version"],
        itemLabel,
      );
      if (item.kind !== "plugin" && item.kind !== "skill") {
        error(itemLabel, "kind must be plugin or skill");
      }
      exactKeys(
        item.blocker,
        ["code", "note"],
        ["code", "note"],
        `${itemLabel} blocker`,
      );
      const publication = parsePublication(
        { status: "blocked", blockers: [item.blocker] },
        `${itemLabel} publication`,
      );
      if (
        item.blocker.code !== "host-capability-review-required" &&
        item.blocker.code !== "unverified-runtime-dependency"
      ) {
        error(
          `${itemLabel} blocker`,
          "pending Host requests must use a Host-governance blocker code",
        );
      }
      if (!item.blocker.note.includes(document)) {
        error(
          `${itemLabel} blocker`,
          `note must link ${document}`,
        );
      }
      return {
        kind: item.kind,
        id: parseId(item.id, `${itemLabel} id`),
        version: parseSemver(item.version, `${itemLabel} version`),
        status: publication.status,
        blockers: publication.blockers,
      };
    });
    const affectedIdentities = affected.map(
      (item) => `${item.kind}/${item.id}@${item.version}`,
    );
    if (new Set(affectedIdentities).size !== affectedIdentities.length) {
      error(requestLabel, "contains duplicate affected package versions");
    }
    return {
      id,
      document,
      status: pendingRequestStatus,
      humanDecision: null,
      acceptedApiContracts: parseAcceptedApiContracts(
        isV2 ? request.acceptedApiContracts : [],
        `${requestLabel} acceptedApiContracts`,
      ),
      affected: affected.sort((left, right) =>
        `${left.kind}/${left.id}@${left.version}`.localeCompare(
          `${right.kind}/${right.id}@${right.version}`,
          "en",
        ),
      ),
    };
  }).sort((left, right) => left.id.localeCompare(right.id, "en"));
  const requestIds = requests.map((request) => request.id);
  if (new Set(requestIds).size !== requestIds.length) {
    error(label, "contains duplicate request ids");
  }
  const documents = requests.map((request) => request.document);
  if (new Set(documents).size !== documents.length) {
    error(label, "contains duplicate request documents");
  }
  const packages = requests
    .flatMap((request) =>
      request.affected.map((item) => ({
        ...item,
        requestId: request.id,
      })),
    )
    .sort((left, right) =>
      `${left.kind}/${left.id}@${left.version}\0${left.requestId}`.localeCompare(
        `${right.kind}/${right.id}@${right.version}\0${right.requestId}`,
        "en",
      ),
    );
  const requestsByPackageVersion = new Map();
  for (const item of packages) {
    const identity = `${item.kind}/${item.id}@${item.version}`;
    const requestIds = requestsByPackageVersion.get(identity) ?? [];
    requestIds.push(item.requestId);
    requestsByPackageVersion.set(identity, requestIds);
  }
  for (const [identity, requestIds] of requestsByPackageVersion) {
    if (requestIds.length > maximumHostCapabilityRequestsPerPackage) {
      error(
        label,
        `${identity} binds more than ${maximumHostCapabilityRequestsPerPackage} pending requests`,
      );
    }
  }
  const resolutions = (value.resolutions ?? []).map(
    (resolution, resolutionIndex) => {
      const resolutionLabel = `${label} resolution ${resolutionIndex}`;
      exactKeys(
        resolution,
        ["id", "receipt"],
        ["id", "receipt"],
        resolutionLabel,
      );
      const id = cleanString(resolution.id, `${resolutionLabel} id`, 128);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
        error(resolutionLabel, "id must be a lowercase kebab-case identifier");
      }
      exactKeys(
        resolution.receipt,
        ["asset", "releaseTag", "repository", "sha256"],
        ["asset", "releaseTag", "repository", "sha256"],
        `${resolutionLabel} receipt`,
      );
      const repository = cleanString(
        resolution.receipt.repository,
        `${resolutionLabel} receipt repository`,
        128,
      );
      if (repository !== "convaxai/convax-plugins") {
        error(
          `${resolutionLabel} receipt`,
          "repository must be the protected convaxai/convax-plugins authority",
        );
      }
      const releaseTag = cleanString(
        resolution.receipt.releaseTag,
        `${resolutionLabel} receipt releaseTag`,
        240,
      );
      if (
        !/^host-capability-decision-v1-[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{64}$/u.test(
          releaseTag,
        )
      ) {
        error(
          `${resolutionLabel} receipt`,
          "releaseTag must be the canonical immutable decision tag",
        );
      }
      const asset = cleanString(
        resolution.receipt.asset,
        `${resolutionLabel} receipt asset`,
        180,
      );
      if (asset !== `${id}.decision.json`) {
        error(
          `${resolutionLabel} receipt`,
          `asset must equal ${id}.decision.json`,
        );
      }
      const sha256 = cleanString(
        resolution.receipt.sha256,
        `${resolutionLabel} receipt sha256`,
        64,
      );
      if (!/^[a-f0-9]{64}$/u.test(sha256)) {
        error(`${resolutionLabel} receipt`, "sha256 must be one lowercase SHA-256");
      }
      return {
        id,
        receipt: { asset, releaseTag, repository, sha256 },
      };
    },
  );
  if (value.schema === "convax.host-capability-policy/1" && resolutions.length) {
    error(label, "v1 policy cannot contain resolutions");
  }
  const resolutionIds = resolutions.map((resolution) => resolution.id);
  if (new Set(resolutionIds).size !== resolutionIds.length) {
    error(label, "contains duplicate resolution ids");
  }
  const pendingIds = new Set(requestIds);
  if (resolutionIds.some((id) => pendingIds.has(id))) {
    error(label, "a request id cannot be both pending and resolved");
  }
  return {
    schema: value.schema,
    requests,
    resolutions,
    packages,
  };
}

export async function loadPublicationPolicy(workspaceRoot = root) {
  const label = "Host capability publication policy";
  const policy = parseHostCapabilityPolicy(
    await readJson(
      path.join(workspaceRoot, "registry", "host-capability-policy.json"),
      label,
    ),
    label,
  );
  const requirementsLabel = "Host capability workspace declarations";
  const declarationsByRequest = new Map();
  for (const [kind, directoryName] of [
    ["plugin", "plugins"],
    ["skill", "skills"],
  ]) {
    const directory = path.join(workspaceRoot, "packages", directoryName);
    for (const entry of await fs.readdir(directory, {
      withFileTypes: true,
    }).catch((cause) => {
      if (cause?.code === "ENOENT") return [];
      throw cause;
    })) {
      if (!entry.isDirectory()) continue;
      const packageJson = await readJson(
        path.join(directory, entry.name, "package.json"),
        `${kind}/${entry.name} package.json`,
      );
      const declarations =
        packageJson["convax.hostCapabilityRequests"] ?? [];
      if (
        !Array.isArray(declarations) ||
        declarations.length > maximumHostCapabilityRequestsPerPackage ||
        new Set(declarations).size !== declarations.length
      ) {
        error(
          `${kind}/${entry.name} package.json`,
          `convax.hostCapabilityRequests must contain at most ${maximumHostCapabilityRequestsPerPackage} unique request ids`,
        );
      }
      const identity =
        `${kind}/${parseId(entry.name, `${kind} directory id`)}@` +
        parseSemver(packageJson.version, `${kind}/${entry.name} version`);
      for (const value of declarations) {
        const requestId = cleanString(
          value,
          `${kind}/${entry.name} Host capability request`,
          128,
        );
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requestId)) {
          error(
            `${kind}/${entry.name} package.json`,
            "Host capability request ids must be lowercase kebab-case",
          );
        }
        const affected = declarationsByRequest.get(requestId) ?? [];
        affected.push(identity);
        declarationsByRequest.set(requestId, affected);
      }
    }
  }
  const policyByRequest = new Map(
    policy.requests.map((request) => [
      request.id,
      request.affected
        .map((item) => `${item.kind}/${item.id}@${item.version}`)
        .sort(),
    ]),
  );
  for (const requestId of new Set([
    ...declarationsByRequest.keys(),
    ...policyByRequest.keys(),
  ])) {
    const declared = (declarationsByRequest.get(requestId) ?? []).sort();
    const affected = policyByRequest.get(requestId);
    if (!affected) {
      error(
        requirementsLabel,
        `required pending request ${requestId} is missing from publication policy`,
      );
    }
    if (
      declared.length !== affected.length ||
      declared.some((identity, index) => identity !== affected[index])
    ) {
      error(
        requirementsLabel,
        `pending request ${requestId} must exactly match workspace declarations and policy affected versions`,
      );
    }
  }
  const requestDirectory = path.join(
    workspaceRoot,
    "docs",
    "host-capability-requests",
  );
  const requestDocuments = [];
  for (const entry of await fs.readdir(requestDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const relativePath = `docs/host-capability-requests/${entry.name}`;
    const source = await fs.readFile(path.join(requestDirectory, entry.name), "utf8");
    if (!source.includes(pendingRequestDocumentStatus)) {
      error(
        label,
        `${relativePath} is not pending and has no trusted machine-verifiable resolution`,
      );
    }
    requestDocuments.push(relativePath);
  }
  requestDocuments.sort();
  const policyDocuments = policy.requests
    .map((request) => request.document)
    .sort();
  if (
    requestDocuments.length !== policyDocuments.length ||
    requestDocuments.some((document, index) => document !== policyDocuments[index])
  ) {
    error(
      label,
      "pending request documents and policy requests must match exactly",
    );
  }
  for (const request of policy.requests) {
    const source = await fs.readFile(
      path.join(workspaceRoot, request.document),
      "utf8",
    );
    validateHostCapabilityRequestDocument(source, request.document);
    const documentedContractDigests = [
      ...new Set(source.match(/sha256:[a-f0-9]{64}/gu) ?? []),
    ].sort();
    const acceptedContractDigests = request.acceptedApiContracts
      .map(({ digest }) => digest)
      .sort();
    if (
      documentedContractDigests.length !== acceptedContractDigests.length ||
      documentedContractDigests.some(
        (digest, index) => digest !== acceptedContractDigests[index],
      ) ||
      request.acceptedApiContracts.some(
        ({ id }) => !source.includes(`\`${id}\``),
      )
    ) {
      error(
        request.document,
        "documented API ids and contract digests must exactly match policy acceptedApiContracts",
      );
    }
  }
  return policy;
}

export const parsePluginManifest = parsePluginManifestV8;

export function parseSkill(markdown, expectedName, label = "SKILL.md") {
  if (typeof markdown !== "string" || !markdown.startsWith("---\n"))
    error(label, "must start with YAML frontmatter");
  const end = markdown.indexOf("\n---\n", 4);
  if (end < 0) error(label, "frontmatter must end with ---");
  const fields = new Map();
  for (const line of markdown.slice(4, end).split("\n")) {
    const match = /^([a-zA-Z][a-zA-Z0-9_-]*):\s+(.+)$/.exec(line);
    if (!match) error(label, `unsupported frontmatter line ${line}`);
    if (fields.has(match[1]))
      error(label, `duplicate frontmatter field ${match[1]}`);
    fields.set(match[1], match[2]);
  }
  const name = parseId(fields.get("name"), `${label} name`);
  cleanString(fields.get("description"), `${label} description`, 1024);
  if (expectedName && name !== expectedName)
    error(label, `name must equal ${expectedName}`);
  if (markdown.slice(end + 5).trim().length === 0)
    error(label, "must contain instructions");
  return { name };
}

export async function readJson(file, label = file) {
  let text;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (cause) {
    throw new Error(`${label}: cannot read`, { cause });
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new Error(`${label}: invalid JSON`, { cause });
  }
}

export async function readJsonc(file, label = file) {
  let text;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (cause) {
    throw new Error(`${label}: cannot read`, { cause });
  }
  try {
    return Bun.JSONC.parse(text);
  } catch (cause) {
    throw new Error(`${label}: invalid JSONC`, { cause });
  }
}

export async function collectFiles(directory, label = directory) {
  const files = [];
  const seen = new Map();
  let total = 0;
  async function visit(current, relativeDirectory = "") {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      validatePortableSegment(entry.name, `${label} path`);
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      parseRelativePath(relativePath, `${label} path`);
      const folded = relativePath.normalize("NFC").toLowerCase();
      const previous = seen.get(folded);
      if (previous)
        error(
          label,
          `portable path collision between ${previous} and ${relativePath}`,
        );
      seen.set(folded, relativePath);
      const absolutePath = path.join(current, entry.name);
      if (entry.isSymbolicLink())
        error(label, `symlink is forbidden: ${relativePath}`);
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile())
        error(label, `unsupported filesystem entry: ${relativePath}`);
      const stat = await fs.stat(absolutePath);
      if (stat.size > maxFileBytes)
        error(label, `file exceeds 2 MiB: ${relativePath}`);
      total += stat.size;
      if (total > maxPackageBytes) error(label, "package exceeds 10 MiB");
      const data = await fs.readFile(absolutePath);
      files.push({ absolutePath, data, mode: stat.mode, relativePath });
    }
  }
  await visit(directory);
  files.sort((left, right) =>
    Buffer.compare(
      Buffer.from(left.relativePath),
      Buffer.from(right.relativePath),
    ),
  );
  return files;
}

function packageEntryCount(files) {
  const entries = new Set();
  for (const file of files) {
    const segments = file.relativePath.split("/");
    for (let index = 1; index <= segments.length; index += 1) {
      entries.add(
        segments.slice(0, index).join("/").normalize("NFC").toLowerCase(),
      );
    }
  }
  return entries.size;
}

function assertPackageInventory(files, kind, label) {
  const totalBytes = files.reduce(
    (total, file) => total + file.data.byteLength,
    0,
  );
  if (totalBytes > maxPackageBytes) error(label, "package exceeds 10 MiB");
  const maximumEntries = kind === "plugin" ? maxPluginEntries : maxSkillEntries;
  if (packageEntryCount(files) > maximumEntries) {
    error(label, `package exceeds the ${maximumEntries} entry limit`);
  }
}

function assertPortableWebReference(reference, sourcePath, packagePaths, label) {
  const value = reference.trim();
  if (
    value.length === 0 ||
    value.startsWith("#") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return;
  }
  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    value.includes("\\") ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  ) {
    error(label, `Web subresource URL must be portable and relative: ${value}`);
  }
  const pathPart = value.split(/[?#]/, 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    error(label, `Web subresource URL is not valid UTF-8: ${value}`);
  }
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(sourcePath), decoded),
  );
  if (
    resolved === "." ||
    resolved === ".." ||
    resolved.startsWith("../") ||
    path.posix.isAbsolute(resolved)
  ) {
    error(label, `Web subresource URL escapes the Plugin package: ${value}`);
  }
  parseRelativePath(resolved, `${label} Web subresource URL`);
  if (!packagePaths.has(resolved)) {
    error(label, `Web subresource URL does not resolve to a package file: ${value}`);
  }
}

function assertPortableWebReferences(text, file, packagePaths, label) {
  const extension = path.posix.extname(file.relativePath).toLowerCase();
  const references = [];
  if (extension === ".html") {
    for (const match of text.matchAll(
      /\b(?:src|href|poster)\s*=\s*(["'])(.*?)\1/gi,
    )) {
      references.push(match[2]);
    }
    for (const match of text.matchAll(/\bsrcset\s*=\s*(["'])(.*?)\1/gi)) {
      for (const candidate of match[2].split(",")) {
        const reference = candidate.trim().split(/\s+/, 1)[0];
        if (reference) references.push(reference);
      }
    }
  }
  if (extension === ".css" || extension === ".html") {
    for (const match of text.matchAll(
      /(?:url\(\s*|@import\s+)(?:["']([^"']+)["']|([^"')\s;]+))/gi,
    )) {
      references.push(match[1] ?? match[2]);
    }
  }
  if (extension === ".js" || extension === ".mjs") {
    for (const match of text.matchAll(
      /\b(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g,
    )) {
      references.push(match[1]);
    }
    for (const match of text.matchAll(
      /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    )) {
      references.push(match[1]);
    }
    for (const match of text.matchAll(
      /\bnew\s+(?:SharedWorker|Worker)\s*\(\s*["']([^"']+)["']/g,
    )) {
      references.push(match[1]);
    }
  }
  for (const reference of references) {
    assertPortableWebReference(
      reference,
      file.relativePath,
      packagePaths,
      label,
    );
  }
}

export function assertPluginStatic(files, label, hookPath) {
  const packagePaths = new Set(files.map((file) => file.relativePath));
  if (
    hookPath !== undefined &&
    !files.some((file) => file.relativePath === hookPath)
  ) {
    error(label, `missing hooks ${hookPath}`);
  }
  for (const file of files) {
    const extension = path.posix.extname(file.relativePath).toLowerCase();
    const hookModule = hookPath !== undefined && file.relativePath === hookPath;
    if ((file.mode & 0o111) !== 0)
      error(label, `executable file mode is forbidden: ${file.relativePath}`);
    if (nativeExtensions.has(extension))
      error(label, `executable file type is forbidden: ${file.relativePath}`);
    if (pluginExecutableSourceExtensions.has(extension)) {
      error(
        label,
        `executable or server source is forbidden: ${file.relativePath}`,
      );
    }
    if ([".html", ".css", ".js", ".mjs", ".cjs"].includes(extension)) {
      const text = file.data.toString("utf8");
      if (hookModule) {
        const inspection = inspectHookModuleSource(
          text,
          label,
          file.relativePath,
        );
        if (
          inspection.commonJsReference ||
          inspection.dynamicImport ||
          inspection.staticImports.some(
            (specifier) =>
              specifier === "node:module" ||
              specifier === "bun:module" ||
              (!specifier.startsWith("node:") && !specifier.startsWith("bun:")),
          )
        ) {
          error(
            label,
            `Hook module must be self-contained: ${file.relativePath}`,
          );
        }
        if (!inspection.hasPluginExport) {
          error(
            label,
            `Hook module must export an OpenCode Plugin entry: ${file.relativePath}`,
          );
        }
        continue;
      }
      if (
        /https?:\/\//i.test(text) ||
        /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource)\s*\(/.test(text) ||
        /navigator\.sendBeacon\s*\(/.test(text)
      )
        error(
          label,
          `remote runtime dependency is forbidden: ${file.relativePath}`,
        );
      if (
        text.startsWith("#!") ||
        extension === ".cjs" ||
        /(?:\bfrom\s*|\bimport\s*(?:\(|(?=["']))|\brequire\s*\()\s*["'](?:node:)?(?:child_process|cluster|fs|http|https|net|tls|worker_threads)\b/.test(
          text,
        ) ||
        /\b(?:createServer|spawn|execFile|fork)\s*\(/.test(text)
      ) {
        error(
          label,
          `Node or executable runtime is forbidden: ${file.relativePath}`,
        );
      }
      assertPortableWebReferences(text, file, packagePaths, label);
    }
  }
}

async function listCollection(kind, workspaceRoot = root) {
  const collection = path.join(workspaceRoot, "packages", `${kind}s`);
  let entries;
  try {
    entries = await fs.readdir(collection, { withFileTypes: true });
  } catch (cause) {
    if (cause?.code === "ENOENT") return [];
    throw cause;
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      kind,
      id: entry.name,
      directory: path.join(collection, entry.name),
    }));
}

async function validatePackageWorkspace(candidate, metadata) {
  const label = `${candidate.kind}/${candidate.id} package.json`;
  const packageJson = await readJson(
    path.join(candidate.directory, "package.json"),
    label,
  );
  if (!isObject(packageJson)) error(label, "must be an object");
  const expectedName = `@microvoid/convax-${candidate.kind}-${candidate.id}`;
  if (packageJson.name !== expectedName)
    error(label, `name must equal ${expectedName}`);
  if (packageJson.version !== metadata.version)
    error(label, "version must equal convax-package.json");
  if (packageJson.private !== true) error(label, "private must be true");
  if (packageJson.type !== "module") error(label, "type must be module");
  if (
    !isObject(packageJson.scripts) ||
    typeof packageJson.scripts.validate !== "string" ||
    typeof packageJson.scripts.pack !== "string"
  ) {
    error(label, "scripts must declare validate and pack");
  }
  return packageJson;
}

function pngDimensions(data, label) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (
    data.length < 24 ||
    !data.subarray(0, 8).equals(signature) ||
    data.toString("ascii", 12, 16) !== "IHDR"
  ) {
    error(label, "content is not a PNG image");
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function gifDimensions(data, label) {
  const signature = data.toString("ascii", 0, 6);
  if (data.length < 10 || (signature !== "GIF87a" && signature !== "GIF89a"))
    error(label, "content is not a GIF image");
  return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
}

function jpegDimensions(data, label) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8)
    error(label, "content is not a JPEG image");
  const sof = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) error(label, "JPEG contains an invalid marker");
    while (data[offset] === 0xff) offset += 1;
    const marker = data[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = data.readUInt16BE(offset);
    if (length < 2 || offset + length > data.length)
      error(label, "JPEG contains an invalid segment");
    if (sof.has(marker)) {
      if (length < 7) error(label, "JPEG frame header is truncated");
      return {
        width: data.readUInt16BE(offset + 5),
        height: data.readUInt16BE(offset + 3),
      };
    }
    offset += length;
  }
  error(label, "JPEG dimensions were not found");
}

function webpDimensions(data, label) {
  if (
    data.length < 30 ||
    data.toString("ascii", 0, 4) !== "RIFF" ||
    data.toString("ascii", 8, 12) !== "WEBP"
  ) {
    error(label, "content is not a WebP image");
  }
  const chunk = data.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      width: 1 + data.readUIntLE(24, 3),
      height: 1 + data.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8L" && data[20] === 0x2f) {
    const bits = data.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  if (
    chunk === "VP8 " &&
    data[23] === 0x9d &&
    data[24] === 0x01 &&
    data[25] === 0x2a
  ) {
    return {
      width: data.readUInt16LE(26) & 0x3fff,
      height: data.readUInt16LE(28) & 0x3fff,
    };
  }
  error(label, "unsupported or malformed WebP bitstream");
}

function parsePetLibrary(value, label) {
  exactKeys(value, ["pets", "schema"], ["pets", "schema"], label);
  if (value.schema !== "convax.pet-library/1")
    error(label, "schema must equal convax.pet-library/1");
  if (
    !Array.isArray(value.pets) ||
    value.pets.length < 1 ||
    value.pets.length > 64
  ) {
    error(label, "pets must contain between 1 and 64 entries");
  }
  const pets = value.pets.map((item, index) => {
    const itemLabel = `${label} pets[${index}]`;
    exactKeys(
      item,
      [
        "alt",
        "description",
        "displayName",
        "id",
        "spritesheet",
        "spriteVersion",
      ],
      [
        "alt",
        "description",
        "displayName",
        "id",
        "spritesheet",
        "spriteVersion",
      ],
      itemLabel,
    );
    const spritesheet = parseRelativePath(
      item.spritesheet,
      `${itemLabel} spritesheet`,
    );
    if (!/\.(?:png|webp)$/i.test(spritesheet))
      error(itemLabel, "spritesheet must be a PNG or WebP file");
    if (item.spriteVersion !== 2)
      error(itemLabel, "spriteVersion must equal 2");
    return {
      alt: cleanString(item.alt, `${itemLabel} alt`, 500),
      description: cleanString(
        item.description,
        `${itemLabel} description`,
        2_000,
      ),
      displayName: cleanString(
        item.displayName,
        `${itemLabel} displayName`,
        120,
      ),
      id: parseId(item.id, `${itemLabel} id`),
      spritesheet,
      spriteVersion: 2,
    };
  });
  if (new Set(pets.map((pet) => pet.id)).size !== pets.length)
    error(label, "pets contain duplicate ids");
  if (
    new Set(pets.map((pet) => pet.spritesheet.toLocaleLowerCase("en-US")))
      .size !== pets.length
  ) {
    error(label, "pets contain duplicate spritesheet paths");
  }
  return { schema: "convax.pet-library/1", pets };
}

export function validatePetPackageLibrary(manifest, files, label = "Plugin") {
  const pet = manifest.contributes?.pet;
  if (!pet) return undefined;
  const entries = new Map(files.map((file) => [file.relativePath, file]));
  for (const [field, kind] of [
    ["overlay", "overlay"],
    ["settings", "settings"],
  ]) {
    if (!entries.has(pet[field]))
      error(label, `missing declared pet ${kind} ${pet[field]}`);
  }
  const libraryFile = entries.get(pet.library);
  if (!libraryFile) error(label, `missing declared pet library ${pet.library}`);
  let libraryValue;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      libraryFile.data,
    );
    libraryValue = JSON.parse(text);
  } catch (cause) {
    throw new Error(`${label} pet library: invalid UTF-8 JSON`, { cause });
  }
  const library = parsePetLibrary(libraryValue, `${label} pet library`);
  for (const petEntry of library.pets) {
    const asset = entries.get(petEntry.spritesheet);
    if (!asset)
      error(label, `missing declared pet spritesheet ${petEntry.spritesheet}`);
    const extension = path.posix.extname(petEntry.spritesheet).toLowerCase();
    const dimensions =
      extension === ".png"
        ? pngDimensions(asset.data, `${label} pet spritesheet ${petEntry.id}`)
        : webpDimensions(asset.data, `${label} pet spritesheet ${petEntry.id}`);
    if (dimensions.width !== 1536 || dimensions.height !== 1872) {
      error(
        label,
        `pet spritesheet ${petEntry.id} must be exactly 1536 by 1872 pixels`,
      );
    }
  }
  return library;
}

function mp4Dimensions(data, label) {
  if (data.length < 24 || data.toString("ascii", 4, 8) !== "ftyp")
    error(label, "content is not an MP4 file");
  for (let offset = 4; offset + 4 <= data.length; offset += 1) {
    if (data.toString("ascii", offset, offset + 4) !== "tkhd" || offset < 4)
      continue;
    const start = offset - 4;
    const size = data.readUInt32BE(start);
    if (size < 84 || start + size > data.length) continue;
    const widthFixed = data.readUInt32BE(start + size - 8);
    const heightFixed = data.readUInt32BE(start + size - 4);
    if ((widthFixed & 0xffff) !== 0 || (heightFixed & 0xffff) !== 0)
      error(label, "MP4 dimensions must use whole pixels");
    const width = widthFixed >>> 16;
    const height = heightFixed >>> 16;
    if (width > 0 && height > 0) return { width, height };
  }
  error(label, "MP4 video track dimensions were not found");
}

export function inspectShowcaseMedia(input, mime, label = "showcase media") {
  const data = Buffer.from(input);
  const result =
    mime === "image/png"
      ? pngDimensions(data, label)
      : mime === "image/gif"
        ? gifDimensions(data, label)
        : mime === "image/jpeg"
          ? jpegDimensions(data, label)
          : mime === "image/webp"
            ? webpDimensions(data, label)
            : mime === "video/mp4"
              ? mp4Dimensions(data, label)
              : error(label, `unsupported MIME type ${mime}`);
  if (
    !Number.isSafeInteger(result.width) ||
    !Number.isSafeInteger(result.height) ||
    result.width < 1 ||
    result.height < 1 ||
    result.width > 8192 ||
    result.height > 8192
  ) {
    error(label, "media dimensions must be from 1 to 8192 pixels");
  }
  return result;
}

async function readShowcaseMedia(packageDirectory, descriptor, role, label) {
  let current = packageDirectory;
  for (const segment of descriptor.path.split("/")) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (cause) {
      if (cause?.code === "ENOENT")
        error(label, `missing declared file ${descriptor.path}`);
      throw cause;
    }
    if (stat.isSymbolicLink())
      error(label, `symlink is forbidden: ${descriptor.path}`);
  }
  const stat = await fs.stat(current);
  if (!stat.isFile())
    error(label, `must be a regular file: ${descriptor.path}`);
  const maximum = role === "poster" ? maxPosterBytes : maxAnimationBytes;
  if (stat.size < 1 || stat.size > maximum)
    error(label, `${role} exceeds ${maximum} bytes`);
  const realRoot = await fs.realpath(packageDirectory);
  const realFile = await fs.realpath(current);
  const relative = path.relative(realRoot, realFile);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    error(label, "media resolves outside its package");
  const data = await fs.readFile(realFile);
  if (data.length < 1 || data.length > maximum)
    error(label, `${role} exceeds ${maximum} bytes`);
  const actual = inspectShowcaseMedia(data, descriptor.mime, label);
  if (
    actual.width !== descriptor.width ||
    actual.height !== descriptor.height
  ) {
    error(
      label,
      `declared ${descriptor.width}x${descriptor.height} does not match ${actual.width}x${actual.height}`,
    );
  }
  return { ...descriptor, data };
}

export async function loadShowcaseAssets(
  metadata,
  packageDirectory,
  label = `${metadata.kind}/${metadata.id} showcase`,
) {
  if (!metadata.showcase) return undefined;
  const poster = await readShowcaseMedia(
    packageDirectory,
    metadata.showcase.poster,
    "poster",
    `${label} poster`,
  );
  const animation = metadata.showcase.animation
    ? await readShowcaseMedia(
        packageDirectory,
        metadata.showcase.animation,
        "animation",
        `${label} animation`,
      )
    : undefined;
  return { poster, ...(animation ? { animation } : {}) };
}

async function validateCompanionSourceDirectory(
  companion,
  label,
  workspaceRoot = root,
) {
  const sourceDirectory = path.join(
    workspaceRoot,
    ...companion.source.split("/"),
  );
  let stat;
  try {
    stat = await fs.lstat(sourceDirectory);
  } catch (cause) {
    if (cause?.code === "ENOENT")
      error(label, `missing reviewed source directory ${companion.source}`);
    throw cause;
  }
  if (stat.isSymbolicLink())
    error(label, `source directory must not be a symlink: ${companion.source}`);
  if (!stat.isDirectory())
    error(label, `source must be a directory: ${companion.source}`);
  const toolsRoot = await fs.realpath(
    path.join(workspaceRoot, "packages", "tools"),
  );
  const realSource = await fs.realpath(sourceDirectory);
  const relative = path.relative(toolsRoot, realSource);
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    relative.includes(path.sep)
  ) {
    error(
      label,
      "source must resolve to one workspace directly below packages/tools/",
    );
  }
  const packageFile = path.join(sourceDirectory, "package.json");
  const packageStat = await fs.lstat(packageFile).catch((cause) => {
    if (cause?.code === "ENOENT")
      error(label, "reviewed source must contain package.json");
    throw cause;
  });
  if (packageStat.isSymbolicLink() || !packageStat.isFile())
    error(label, "source package.json must be a regular file, not a symlink");
  const sourcePackage = await readJson(packageFile, `${label} package.json`);
  if (sourcePackage.version !== companion.version)
    error(label, "companion version must equal source package version");
  if (
    !isObject(sourcePackage.bin) ||
    typeof sourcePackage.bin[companion.command] !== "string"
  ) {
    error(label, "source package bin must declare the companion command");
  }
  for (const target of companion.targets) {
    const script = `build:release:${target.platform}-${target.arch}`;
    if (
      !isObject(sourcePackage.scripts) ||
      typeof sourcePackage.scripts[script] !== "string" ||
      sourcePackage.scripts[script].trim().length === 0
    ) {
      error(label, `source package must declare the ${script} script`);
    }
  }
  return sourcePackage;
}

export async function discoverPackages(options = {}) {
  const workspaceRoot = options.workspaceRoot ?? root;
  const selection =
    options.kind === undefined && options.id === undefined
      ? undefined
      : { kind: options.kind, id: options.id };
  if (
    selection &&
    ((selection.kind !== "plugin" && selection.kind !== "skill") ||
      typeof selection.id !== "string")
  ) {
    error("package selection", "kind and id must select one Plugin or Skill");
  }
  const candidates = (await discoverMarketplacePackages(workspaceRoot))
    .filter((candidate) => candidate.kind === "plugin" || candidate.kind === "skill")
    .map((candidate) => ({
      ...candidate,
      directory: candidate.root,
      packageRoot: candidate.contentRoot,
    }))
    .sort((left, right) =>
      `${left.kind}/${left.id}`.localeCompare(`${right.kind}/${right.id}`, "en"),
    );
  const candidatesByIdentity = new Map(
    candidates.map((candidate) => [
      `${candidate.kind}/${candidate.id}`,
      candidate,
    ]),
  );
  const publicationPolicy = await loadPublicationPolicy(workspaceRoot);
  const publicationByVersion = new Map();
  for (const item of publicationPolicy.packages) {
    const identity = `${item.kind}/${item.id}@${item.version}`;
    const current = publicationByVersion.get(identity) ?? {
      status: "blocked",
      blockers: [],
    };
    publicationByVersion.set(
      identity,
      parsePublication(
        {
          status: "blocked",
          blockers: [
            ...current.blockers,
            ...item.blockers.map((blocker) => ({
              ...blocker,
              note: `[${item.requestId}] ${blocker.note}`,
            })),
          ],
        },
        `${identity} Host capability blockers`,
      ),
    );
  }
  for (const item of publicationPolicy.packages) {
    const candidate = candidatesByIdentity.get(`${item.kind}/${item.id}`);
    if (!candidate || candidate.version !== item.version) {
      error(
        "publication blockers",
        `stale or unknown package ${item.kind}/${item.id}@${item.version}`,
      );
    }
  }
  if (
    selection &&
    !candidatesByIdentity.has(`${selection.kind}/${selection.id}`)
  )
    return [];

  const loaded = new Map();
  async function loadCandidate(candidate) {
    const identity = `${candidate.kind}/${candidate.id}`;
    const existing = loaded.get(identity);
    if (existing) return existing;
    const metadata = {
      ...candidate.authoring,
      publication:
        publicationByVersion.get(
          `${candidate.kind}/${candidate.id}@${candidate.version}`,
        ) ?? { status: "ready", blockers: [] },
    };
    if (metadata.kind !== candidate.kind || metadata.id !== candidate.id)
      error(
        `${candidate.kind}/${candidate.id}`,
        "directory and metadata identity differ",
      );
    const packageJson = await validatePackageWorkspace(candidate, metadata);
    const packageRoot = candidate.packageRoot;
    const files = await collectFiles(
      packageRoot,
      `${candidate.kind}/${candidate.id}`,
    );
    assertPackageInventory(
      files,
      candidate.kind,
      `${candidate.kind}/${candidate.id}`,
    );
    const showcase = await loadShowcaseAssets(metadata, candidate.directory);
    let manifest;
    if (candidate.kind === "plugin") {
      manifest = candidate.manifest;
      if (!manifest) error(`${candidate.kind}/${candidate.id}`, "missing canonical SDK manifest");
      assertPluginStatic(
        files,
        `${candidate.kind}/${candidate.id}`,
        manifest.hooks,
      );
      if (manifest.schema !== "convax.plugin/8") {
        error(`${candidate.kind}/${candidate.id}`, "only convax.plugin/8 is publishable");
      }
      for (const key of ["id", "name", "description", "version"]) {
        if (metadata[key] !== manifest[key])
          error(
            `${candidate.kind}/${candidate.id}`,
            `metadata ${key} must equal manifest`,
          );
      }
      const names = new Set(files.map((file) => file.relativePath));
      if (manifest.entry && !names.has(manifest.entry))
        error(
          `${candidate.kind}/${candidate.id}`,
          `missing entry ${manifest.entry}`,
        );
      if (manifest.hooks && !names.has(manifest.hooks))
        error(
          `${candidate.kind}/${candidate.id}`,
          `missing hooks ${manifest.hooks}`,
        );
      validatePetPackageLibrary(
        manifest,
        files,
        `${candidate.kind}/${candidate.id}`,
      );
      assertPluginHostCapabilityDeclarations(
        manifest,
        files,
        packageJson["convax.hostCapabilityRequests"],
        `${candidate.kind}/${candidate.id}`,
      );
      if (manifest.runtime && names.has(manifest.runtime.command)) {
        error(
          `${candidate.kind}/${candidate.id}`,
          "external runtime executable must not be included in the Plugin ZIP",
        );
      }
      const companions = metadata.companions ?? [];
      if (manifest.runtime) {
        if (
          companions.length !== 1 ||
          companions[0].command !== manifest.runtime.command
        ) {
          error(
            `${candidate.kind}/${candidate.id}`,
            "external runtime must have exactly one matching companion command",
          );
        }
      } else if (companions.length > 0) {
        error(
          `${candidate.kind}/${candidate.id}`,
          "companions require a declared external runtime",
        );
      }
      for (const companion of companions) {
        const sourcePackage = await validateCompanionSourceDirectory(
          companion,
          `${candidate.kind}/${candidate.id} companion ${companion.command}`,
          workspaceRoot,
        );
        if (packageJson.dependencies?.[sourcePackage.name] !== "workspace:*") {
          error(
            `${candidate.kind}/${candidate.id}`,
            `package.json must depend on Tool workspace ${sourcePackage.name}`,
          );
        }
      }
      if (manifest.skill) {
        const skillFile = files.find(
          (file) => file.relativePath === manifest.skill,
        );
        if (!skillFile)
          error(
            `${candidate.kind}/${candidate.id}`,
            `missing companion Skill ${manifest.skill}`,
          );
        parseSkill(
          skillFile.data.toString("utf8"),
          undefined,
          `${candidate.kind}/${candidate.id} companion Skill`,
        );
      }
    } else {
      const skill = files.find((file) => file.relativePath === "SKILL.md");
      if (!skill)
        error(
          `${candidate.kind}/${candidate.id}`,
          "ZIP root must contain SKILL.md",
        );
      parseSkill(
        skill.data.toString("utf8"),
        metadata.id,
        `${candidate.kind}/${candidate.id} SKILL.md`,
      );
      for (const file of files) {
        if (
          nativeExtensions.has(
            path.posix.extname(file.relativePath).toLowerCase(),
          )
        )
          error(
            `${candidate.kind}/${candidate.id}`,
            `native executable is forbidden: ${file.relativePath}`,
          );
      }
    }
    const pkg = {
      ...candidate,
      files,
      manifest,
      metadata,
      packageJson,
      packageRoot,
      showcase,
    };
    loaded.set(identity, pkg);
    return pkg;
  }

  if (!selection) {
    for (const candidate of candidates) await loadCandidate(candidate);
  } else {
    const pending = [`${selection.kind}/${selection.id}`];
    const enqueued = new Set(pending);
    while (pending.length > 0) {
      const identity = pending.shift();
      const candidate = candidatesByIdentity.get(identity);
      if (!candidate) error(identity, "missing required package workspace");
      const pkg = await loadCandidate(candidate);
      const dependencies = [];
      if (pkg.metadata.kind === "plugin") {
        for (const contribution of pkg.manifest.contributes.skills ?? []) {
          dependencies.push(`skill/${contribution.name}`);
        }
        const legacySkill =
          /^skills\/([a-z0-9]+(?:-[a-z0-9]+)*)\/SKILL\.md$/.exec(
            pkg.manifest.skill ?? "",
          );
        if (legacySkill) dependencies.push(`skill/${legacySkill[1]}`);
      } else if (pkg.metadata.ownerPluginId) {
        dependencies.push(`plugin/${pkg.metadata.ownerPluginId}`);
      }
      for (const dependency of dependencies) {
        if (enqueued.has(dependency)) continue;
        enqueued.add(dependency);
        pending.push(dependency);
      }
    }
  }

  const packages = [...loaded.values()].sort((left, right) =>
    `${left.kind}/${left.id}`.localeCompare(`${right.kind}/${right.id}`, "en"),
  );
  composeOwnedSkillPackages(packages);
  return packages;
}

export function blockedPackagePublications(packages, label = "publication") {
  if (!Array.isArray(packages)) error(label, "packages must be an array");
  const admitted = packages.map((pkg, index) => {
    const packageLabel = `${label} package ${index}`;
    if (!isObject(pkg) || !isObject(pkg.metadata)) {
      error(packageLabel, "must contain parsed source metadata");
    }
    const metadata = {
      ...pkg.metadata,
      publication: parsePublication(
        pkg.metadata.publication,
        `${packageLabel} publication`,
      ),
    };
    if (metadata.kind === "plugin") {
      const manifest = parsePluginManifest(
        pkg.manifest,
        `${packageLabel} manifest`,
      );
      for (const key of ["id", "name", "description", "version"]) {
        if (metadata[key] !== manifest[key]) {
          error(packageLabel, `${key} must match the Plugin manifest`);
        }
      }
    } else if (pkg.manifest !== undefined) {
      error(packageLabel, "Skills must not contain a Plugin manifest");
    }
    return { metadata };
  });
  const blocked = admitted.filter(
    (pkg) => pkg.metadata.publication.status === "blocked",
  );
  return blocked.map(({ metadata }) => ({
    kind: metadata.kind,
    id: metadata.id,
    version: metadata.version,
    publication: metadata.publication,
  }));
}

export function assertPackagesPublishable(packages, label = "publication") {
  const blocked = blockedPackagePublications(packages, label);
  if (blocked.length === 0) return;
  const details = blocked
    .map((pkg) => {
      const blockers = pkg.publication.blockers
        .map((item) => `${item.code}: ${item.note}`)
        .join("; ");
      return `${pkg.kind}/${pkg.id}@${pkg.version} (${blockers})`;
    })
    .join(", ");
  error(label, `blocked packages cannot be published: ${details}`);
}

export function composeOwnedSkillPackages(packages) {
  const standaloneSkills = new Map(
    packages
      .filter((pkg) => pkg.metadata.kind === "skill")
      .map((pkg) => [pkg.metadata.id, pkg]),
  );
  for (const plugin of packages.filter(
    (pkg) => pkg.metadata.kind === "plugin",
  )) {
    const ownedSkills = plugin.manifest.contributes.skills ?? [];
    const paths = new Set(
      plugin.files.map((file) =>
        file.relativePath.normalize("NFC").toLowerCase(),
      ),
    );
    for (const contribution of ownedSkills) {
      const skill = standaloneSkills.get(contribution.name);
      if (!skill)
        error(
          `${plugin.kind}/${plugin.id}`,
          `missing owned Skill workspace ${contribution.name}`,
        );
      if (skill.metadata.ownerPluginId !== plugin.id) {
        error(
          `${plugin.kind}/${plugin.id}`,
          `owned Skill ${contribution.name} must declare ownerPluginId ${plugin.id}`,
        );
      }
      if (
        plugin.packageJson.dependencies?.[skill.packageJson.name] !==
        "workspace:*"
      ) {
        error(
          `${plugin.kind}/${plugin.id}`,
          `package.json must depend on owned Skill workspace ${skill.packageJson.name}`,
        );
      }
      for (const file of skill.files) {
        const relativePath = `${contribution.path}/${file.relativePath}`;
        const folded = relativePath.normalize("NFC").toLowerCase();
        if (paths.has(folded))
          error(
            `${plugin.kind}/${plugin.id}`,
            `owned Skill path collides with ${relativePath}`,
          );
        paths.add(folded);
        plugin.files.push({ ...file, relativePath });
      }
    }
    plugin.files.sort((left, right) =>
      Buffer.compare(
        Buffer.from(left.relativePath),
        Buffer.from(right.relativePath),
      ),
    );
    assertPackageInventory(
      plugin.files,
      "plugin",
      `${plugin.kind}/${plugin.id}`,
    );
  }
  for (const skill of packages.filter(
    (pkg) => pkg.metadata.kind === "skill" && pkg.metadata.ownerPluginId,
  )) {
    const owner = packages.find(
      (pkg) =>
        pkg.metadata.kind === "plugin" &&
        pkg.metadata.id === skill.metadata.ownerPluginId,
    );
    const contribution = owner?.manifest.contributes.skills?.find(
      (item) => item.name === skill.metadata.id,
    );
    if (!owner || !contribution) {
      error(
        `${skill.kind}/${skill.id}`,
        `ownerPluginId ${skill.metadata.ownerPluginId} does not contribute this Skill`,
      );
    }
  }
  return packages;
}

export function tagFor(metadata) {
  return `${metadata.kind}-${metadata.id}-v${metadata.version}`;
}

export function assetNameFor(metadata) {
  return `convax-${metadata.kind}-${metadata.id}-${metadata.version}.zip`;
}

export function companionAssetNameFor(metadata, companion, target) {
  if (metadata.kind !== "plugin")
    error("companion asset", "only Plugins may publish companions");
  const suffix = target.platform === "win32" ? ".exe" : "";
  const name = `convax-companion-${companion.command}-${companion.version}-${target.platform}-${target.arch}${suffix}`;
  validatePortableSegment(name, "companion asset");
  return name;
}

export function showcaseAssetNameFor(metadata, role, mime) {
  const extension = showcaseMimes[role]?.get(mime);
  if (!extension)
    error("showcase asset", `unsupported ${role} MIME type ${mime}`);
  return `convax-showcase-${metadata.kind}-${metadata.id}-${metadata.version}-${role}${extension}`;
}

export function createDeterministicZip(inputFiles) {
  return Buffer.from(createMarketplaceZip(inputFiles.map((file) => ({
    path: file.relativePath,
    bytes: file.data,
    mode: file.mode & 0o111 ? 0o755 : 0o644,
  }))));
}

export function readStoredZip(zip) {
  const entries = [];
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const method = zip.readUInt16LE(offset + 8);
    if (method !== 0) error("ZIP", "test reader accepts only stored entries");
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const relativePath = zip
      .subarray(nameStart, nameStart + nameLength)
      .toString("utf8");
    entries.push({
      relativePath,
      data: zip.subarray(dataStart, dataStart + size),
    });
    offset = dataStart + size;
  }
  return entries;
}

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

async function readCompanionArtifact(sourceDirectory, target, label) {
  const sourceStat = await fs.lstat(sourceDirectory);
  if (sourceStat.isSymbolicLink())
    error(label, "reviewed source directory must not be a symlink");
  if (!sourceStat.isDirectory())
    error(label, "reviewed source must be a directory");
  let current = sourceDirectory;
  for (const segment of target.path.split("/")) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (cause) {
      if (cause?.code === "ENOENT")
        error(label, `missing built artifact ${target.path}`);
      throw cause;
    }
    if (stat.isSymbolicLink())
      error(label, `symlink is forbidden: ${target.path}`);
  }
  const before = await fs.stat(current);
  if (!before.isFile())
    error(label, `artifact must be a regular file: ${target.path}`);
  if (before.size < 1 || before.size > maxCompanionBytes) {
    error(label, `artifact size must be from 1 to ${maxCompanionBytes} bytes`);
  }
  if (target.platform !== "win32" && (before.mode & 0o111) === 0) {
    error(label, "POSIX companion artifact must have an executable mode");
  }
  if (
    target.platform === "win32" &&
    !target.path.toLowerCase().endsWith(".exe")
  ) {
    error(label, "win32 companion artifact path must end in .exe");
  }
  const realSource = await fs.realpath(sourceDirectory);
  const realFile = await fs.realpath(current);
  const relative = path.relative(realSource, realFile);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    error(label, "artifact resolves outside its reviewed source directory");
  }
  const data = await fs.readFile(realFile);
  const after = await fs.stat(realFile);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    data.length !== after.size
  ) {
    error(label, "artifact changed while it was being read");
  }
  return data;
}

export async function loadCompanionArtifacts(
  pkg,
  label = `${pkg.metadata.kind}/${pkg.metadata.id} companions`,
) {
  const declarations = pkg.metadata.companions;
  if (!declarations) return [];
  const companions = [];
  const assetNames = new Set();
  for (const companion of declarations) {
    const sourceDirectory = path.join(root, ...companion.source.split("/"));
    const targets = [];
    for (const target of companion.targets) {
      const targetLabel = `${label} ${companion.command} ${target.platform}/${target.arch}`;
      const data = await readCompanionArtifact(
        sourceDirectory,
        target,
        targetLabel,
      );
      const assetName = companionAssetNameFor(pkg.metadata, companion, target);
      if (assetNames.has(assetName))
        error(label, `duplicate artifact asset name ${assetName}`);
      assetNames.add(assetName);
      targets.push({
        platform: target.platform,
        arch: target.arch,
        assetName,
        data,
        artifact: {
          url: `https://github.com/${repository}/releases/download/${tagFor(pkg.metadata)}/${assetName}`,
          size: data.length,
          sha256: sha256(data),
        },
      });
    }
    companions.push({
      command: companion.command,
      version: companion.version,
      targets,
    });
  }
  return companions;
}

export function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--"))
      error("arguments", `unexpected ${argument}`);
    const key = argument.slice(2);
    const value = argv[++index];
    if (!value || value.startsWith("--"))
      error("arguments", `${argument} requires a value`);
    result[key] = value;
  }
  return result;
}

export function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
