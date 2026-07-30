import { describe, expect, test } from "bun:test";
import { parse } from "acorn";
import { promises as fs } from "node:fs";
import path from "node:path";
import { discoverPackages, root } from "./lib.mjs";

const currentProtocol = "convax.plugin-host/8";
const sdkBundleMarker =
  "@convax/plugin-sdk/client:createPluginHostClient";
const petClientRequestDocument =
  "docs/host-capability-requests/sdk-owned-pet-surface-client.md";
const legacyTransportTokens = [
  "convax.plugin-host/1",
  "convax.plugin-host/2",
  "convax.plugin-host/3",
  "convax.plugin-host/4",
  "convax.plugin-host/5",
  "convax.plugin-host/6",
  "convax.plugin-host/7",
  "convax.plugin-capability/1",
  "convax.plugin-capability/2",
  "convax.plugin-capability/3",
];
const legacyMethodTokens = [
  "canvas.connectedImages.list",
  "canvas.connectedImage.read",
  "canvas.connectedInputs.list",
  "canvas.connectedImages.changed",
  "canvas.connectedInputs.changed",
  "canvas.connectedMedia.open",
  "canvas.connectedMedia.close",
  "canvas.node.updateState",
  "canvas.image.create",
  "project.file.readText",
  "generation.canvas.execute",
];
const runtimeTextExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".mjs",
]);
const hostApiTokenPattern =
  /^(?:agent|canvas|generation|host|project)\.[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const javascriptResourceProperties = new Set([
  "href",
  "poster",
  "src",
]);

function declaredWebEntries(manifest) {
  return [
    manifest.entry,
    manifest.contributes?.pet?.overlay,
    manifest.contributes?.pet?.settings,
  ].filter((entry) => typeof entry === "string");
}

function hasBlockedPetClientTransport(pkg, source) {
  const pet = pkg.manifest.contributes?.pet;
  return (
    pkg.manifest.entry === undefined &&
    pet?.protocol === "convax.pet-host/1" &&
    source.includes(pet.protocol) &&
    pkg.metadata.publication?.status === "blocked" &&
    pkg.metadata.publication.blockers?.some(
      (blocker) =>
        blocker.code === "host-capability-review-required" &&
        blocker.note.includes(petClientRequestDocument),
    )
  );
}

function staticString(node) {
  if (node?.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (
    node?.type === "TemplateLiteral" &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return node.quasis[0].value.cooked;
  }
  return undefined;
}

function visitAst(node, visitor) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) visitAst(child, visitor);
    } else {
      visitAst(value, visitor);
    }
  }
}

function propertyName(node) {
  if (
    node?.type === "Identifier" &&
    typeof node.name === "string"
  ) {
    return node.name;
  }
  return staticString(node);
}

function htmlResourceUrls(source) {
  const urls = [];
  const html = source.replace(/<!--[\s\S]*?-->/gu, "");
  const attributePattern =
    /\b(?:href|poster|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giu;
  for (const match of html.matchAll(attributePattern)) {
    urls.push(match[1] ?? match[2] ?? match[3]);
  }
  const srcsetPattern =
    /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giu;
  for (const match of html.matchAll(srcsetPattern)) {
    const value = match[1] ?? match[2] ?? match[3];
    for (const candidate of value.split(",")) {
      const url = candidate.trim().split(/\s+/u)[0];
      if (url) urls.push(url);
    }
  }
  return urls;
}

function cssResourceUrls(source) {
  const urls = [];
  const css = source.replace(/\/\*[\s\S]*?\*\//gu, "");
  const urlPattern =
    /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^"')\s]+))\s*\)/giu;
  for (const match of css.matchAll(urlPattern)) {
    urls.push(match[1] ?? match[2] ?? match[3]);
  }
  const importPattern = /@import\s+(?:"([^"]*)"|'([^']*)')/giu;
  for (const match of css.matchAll(importPattern)) {
    urls.push(match[1] ?? match[2]);
  }
  return urls;
}

function javascriptAnalysis(source, label, violations) {
  let program;
  try {
    program = parse(source, {
      allowHashBang: true,
      ecmaVersion: "latest",
      sourceType: "module",
    });
  } catch (error) {
    violations.push(
      `${label}: JavaScript parse failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { hostApiCandidates: [], transportViolations: [], urls: [] };
  }

  const hostApiCandidates = [];
  const transportViolations = [];
  const urls = [];
  visitAst(program, (node) => {
    if (
      node.type === "VariableDeclarator" &&
      node.id?.type === "Identifier" &&
      /^(?:pending|pendingRequests?|requestSequence)$/iu.test(node.id.name) &&
      node.init?.type === "NewExpression" &&
      node.init.callee?.type === "Identifier" &&
      node.init.callee.name === "Map"
    ) {
      transportViolations.push(
        `${label}: handwritten pending Plugin Host request map`,
      );
      return;
    }
    if (node.type === "ObjectExpression") {
      const fields = new Map(
        node.properties
          .filter((property) => property.type === "Property")
          .map((property) => [
            propertyName(property.key),
            staticString(property.value),
          ]),
      );
      if (
        fields.get("type") === "request" &&
        (fields.has("method") || fields.has("protocol"))
      ) {
        transportViolations.push(
          `${label}: handwritten Plugin Host request envelope`,
        );
      }
    }
    if (
      node.type === "ImportDeclaration" ||
      node.type === "ExportAllDeclaration" ||
      node.type === "ExportNamedDeclaration"
    ) {
      const sourceValue = staticString(node.source);
      if (sourceValue !== undefined) urls.push(sourceValue);
      return;
    }
    if (node.type === "ImportExpression") {
      const sourceValue = staticString(node.source);
      if (sourceValue !== undefined) urls.push(sourceValue);
      return;
    }
    if (
      node.type === "NewExpression" &&
      node.callee?.type === "Identifier" &&
      node.callee.name === "URL" &&
      node.arguments.length >= 1
    ) {
      const sourceValue = staticString(node.arguments[0]);
      if (sourceValue !== undefined) urls.push(sourceValue);
      return;
    }
    if (node.type === "CallExpression") {
      const firstArgument = staticString(node.arguments[0]);
      if (
        firstArgument !== undefined &&
        hostApiTokenPattern.test(firstArgument)
      ) {
        hostApiCandidates.push(firstArgument);
      }
      if (
        node.callee?.type === "MemberExpression" &&
        propertyName(node.callee.property) === "setAttribute" &&
        javascriptResourceProperties.has(staticString(node.arguments[0]))
      ) {
        const resourceUrl = staticString(node.arguments[1]);
        if (resourceUrl !== undefined) urls.push(resourceUrl);
      }
      if (
        node.callee?.type === "MemberExpression" &&
        propertyName(node.callee.property) === "postMessage" &&
        node.arguments[0]?.type === "ObjectExpression"
      ) {
        const fields = new Set(
          node.arguments[0].properties
            .filter((property) => property.type === "Property")
            .map((property) => propertyName(property.key)),
        );
        if (
          fields.has("method") ||
          fields.has("protocol") ||
          fields.has("pluginId")
        ) {
          transportViolations.push(
            `${label}: direct Plugin Host postMessage transport`,
          );
        }
      }
      return;
    }
    if (
      node.type === "AssignmentExpression" &&
      node.left?.type === "MemberExpression" &&
      javascriptResourceProperties.has(propertyName(node.left.property))
    ) {
      const resourceUrl = staticString(node.right);
      if (resourceUrl !== undefined) urls.push(resourceUrl);
      return;
    }
    if (
      node.type === "Property" &&
      !node.computed &&
      node.key?.type === "Identifier" &&
      node.key.name === "method"
    ) {
      const method = staticString(node.value);
      if (method !== undefined && hostApiTokenPattern.test(method)) {
        hostApiCandidates.push(method);
      }
      return;
    }
    if (
      node.type === "Property" &&
      javascriptResourceProperties.has(propertyName(node.key))
    ) {
      const resourceUrl = staticString(node.value);
      if (resourceUrl !== undefined) urls.push(resourceUrl);
    }
  });
  return { hostApiCandidates, transportViolations, urls };
}

function isExternalOrDocumentUrl(value) {
  return (
    value === "" ||
    value.startsWith("#") ||
    value.startsWith("?") ||
    /^[a-z][a-z0-9+.-]*:/iu.test(value)
  );
}

function resolvePackageResourceUrl(pkg, fromPath, rawUrl, files, violations) {
  const value = rawUrl.trim();
  if (value.startsWith("/")) {
    violations.push(
      `${pkg.metadata.id}/${fromPath}: root-relative URL ${JSON.stringify(value)}`,
    );
    return undefined;
  }
  if (isExternalOrDocumentUrl(value)) return undefined;

  const pathname = value.split(/[?#]/u, 1)[0];
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(fromPath), pathname),
  );
  if (resolved === ".." || resolved.startsWith("../")) {
    violations.push(
      `${pkg.metadata.id}/${fromPath}: URL escapes package root ${JSON.stringify(value)}`,
    );
    return undefined;
  }
  if (!files.has(resolved)) {
    violations.push(
      `${pkg.metadata.id}/${fromPath}: missing subresource ${JSON.stringify(value)}`,
    );
    return undefined;
  }
  return resolved;
}

function webResourceGraph(pkg) {
  const files = new Map(
    pkg.files.map((file) => [file.relativePath, file]),
  );
  const queue = [...declaredWebEntries(pkg.manifest)];
  const visited = new Set();
  const violations = [];
  const hostApiCandidates = [];

  while (queue.length > 0) {
    const relativePath = queue.shift();
    if (relativePath.startsWith("/")) {
      violations.push(
        `${pkg.metadata.id}/manifest.json: root-relative Web entry ${JSON.stringify(relativePath)}`,
      );
      continue;
    }
    if (visited.has(relativePath)) continue;
    const file = files.get(relativePath);
    if (!file) {
      violations.push(
        `${pkg.metadata.id}/manifest.json: missing Web entry ${JSON.stringify(relativePath)}`,
      );
      continue;
    }
    visited.add(relativePath);

    const extension = path.posix.extname(relativePath);
    if (!runtimeTextExtensions.has(extension)) continue;
    const source = file.data.toString("utf8");
    let urls = [];
    if (extension === ".html") {
      urls = htmlResourceUrls(source);
    } else if (extension === ".css") {
      urls = cssResourceUrls(source);
    } else {
      const generatedSdkClient =
        relativePath === "assets/plugin-host-client.js" &&
        source.includes(sdkBundleMarker);
      const analysis = javascriptAnalysis(
        source,
        `${pkg.metadata.id}/${relativePath}`,
        violations,
      );
      if (!generatedSdkClient) {
        hostApiCandidates.push(...analysis.hostApiCandidates);
        if (
          !hasBlockedPetClientTransport(pkg, source)
        ) {
          violations.push(...analysis.transportViolations);
        }
      }
      urls = analysis.urls;
    }

    for (const url of urls) {
      const resolved = resolvePackageResourceUrl(
        pkg,
        relativePath,
        url,
        files,
        violations,
      );
      if (resolved !== undefined) queue.push(resolved);
    }
  }

  return {
    files: [...visited]
      .map((relativePath) => files.get(relativePath))
      .filter((file) =>
        runtimeTextExtensions.has(path.posix.extname(file.relativePath)),
      ),
    hostApiCandidates,
    violations,
  };
}

async function readTemplatePackage() {
  const packageRoot = path.join(root, "templates", "plugin-basic", "package");
  const files = [];

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        files.push({
          data: await fs.readFile(absolutePath),
          relativePath: path.relative(packageRoot, absolutePath).split(path.sep).join("/"),
        });
      }
    }
  }

  await visit(packageRoot);
  return {
    files,
    manifest: JSON.parse(
      await fs.readFile(path.join(packageRoot, "manifest.json"), "utf8"),
    ),
    metadata: { id: "template/plugin-basic", kind: "plugin" },
  };
}

async function webPackages() {
  const packages = (await discoverPackages()).filter(
    (pkg) =>
      pkg.metadata.kind === "plugin" &&
      declaredWebEntries(pkg.manifest).length > 0,
  );
  packages.push(await readTemplatePackage());
  return packages;
}

function quotedLiteral(source, value) {
  return [`"${value}"`, `'${value}'`, `\`${value}\``].some((literal) =>
    source.includes(literal),
  );
}

function runtimeTextFiles(pkg) {
  return pkg.files.filter((file) =>
    runtimeTextExtensions.has(path.posix.extname(file.relativePath)),
  );
}

function obsoleteRuntimeViolations(pkg) {
  const violations = [];
  for (const file of runtimeTextFiles(pkg)) {
    const source = file.data.toString("utf8");
    for (const token of [
      ...legacyTransportTokens,
      ...legacyMethodTokens,
    ]) {
      if (source.includes(token)) {
        violations.push(
          `${pkg.metadata.id}/${file.relativePath}: legacy ${token}`,
        );
      }
    }
  }
  return violations;
}

describe("production Web Plugin asset conformance", () => {
  test("emits only the SDK-owned host/8 protocol and current Host API ids", async () => {
    const packages = await webPackages();
    const violations = [];
    for (const pkg of packages) {
      const graph = webResourceGraph(pkg);
      violations.push(...graph.violations);
      violations.push(...obsoleteRuntimeViolations(pkg));
    }
    expect(violations).toEqual([]);
  });

  test("binds every Canvas Web entry to the generated SDK client and declares each authored API", async () => {
    const packages = await webPackages();
    const violations = [];
    for (const pkg of packages) {
      const graph = webResourceGraph(pkg);
      violations.push(...graph.violations);
      const source = graph.files
        .map((file) => file.data.toString("utf8"))
        .join("\n");
      const generatedClients = graph.files.filter((file) =>
        file.data.toString("utf8").includes(sdkBundleMarker),
      );
      if (pkg.manifest.entry && generatedClients.length !== 1) {
        violations.push(
          `${pkg.metadata.id}: entry graph must bind exactly one ${sdkBundleMarker} asset`,
        );
      }
      if (
        generatedClients[0] &&
        !generatedClients[0].data.toString("utf8").includes(currentProtocol)
      ) {
        violations.push(
          `${pkg.metadata.id}: generated SDK asset does not implement ${currentProtocol}`,
        );
      }
      const declared = new Set([
        ...pkg.manifest.hostApi.required,
        ...pkg.manifest.hostApi.optional,
      ]);
      for (const apiId of new Set(graph.hostApiCandidates)) {
        if (!declared.has(apiId)) {
          violations.push(
            `${pkg.metadata.id}: emits undeclared Host API ${apiId}`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("rejects capability/3 even in an unreferenced Web asset", () => {
    const fixture = {
      files: [
        {
          data: Buffer.from('<script src="./assets/app.js"></script>'),
          relativePath: "index.html",
        },
        {
          data: Buffer.from(
            'const protocol = "convax.plugin-host/8"; call("host.context.get")',
          ),
          relativePath: "assets/app.js",
        },
        {
          data: Buffer.from('const protocol = "convax.plugin-capability/3"'),
          relativePath: "assets/legacy.js",
        },
      ],
      manifest: { contributes: {}, entry: "index.html" },
      metadata: { id: "capability-3-fixture", kind: "plugin" },
    };

    expect(obsoleteRuntimeViolations(fixture)).toEqual([
      "capability-3-fixture/assets/legacy.js: legacy convax.plugin-capability/3",
    ]);
  });

  test("rejects handwritten Host requests even when business code copies the SDK marker", () => {
    const fixture = {
      files: [
        {
          data: Buffer.from('<script type="module" src="./assets/app.js"></script>'),
          relativePath: "index.html",
        },
        {
          data: Buffer.from(`
            const marker = ${JSON.stringify(sdkBundleMarker)}
            const pendingRequests = new Map()
            port.postMessage({
              id: "manual-1",
              method: "host.context.get",
              protocol: "convax.plugin-host/8",
              type: "request",
            })
          `),
          relativePath: "assets/app.js",
        },
      ],
      manifest: {
        contributes: {},
        entry: "index.html",
        hostApi: {
          major: 1,
          optional: [],
          required: ["host.context.get"],
        },
      },
      metadata: { id: "manual-transport-fixture", kind: "plugin" },
    };

    expect(webResourceGraph(fixture).violations).toEqual([
      "manual-transport-fixture/assets/app.js: handwritten pending Plugin Host request map",
      "manual-transport-fixture/assets/app.js: direct Plugin Host postMessage transport",
      "manual-transport-fixture/assets/app.js: handwritten Plugin Host request envelope",
    ]);
  });

  test("permits the distinct raw Pet transport only behind its exact pending publication blocker", () => {
    const requestSource = `
      const protocol = "convax.pet-host/1"
      const pending = new Map()
      port.postMessage({
        id: "pet-1",
        method: "activity.get",
        protocol,
        type: "request",
      })
    `;
    const fixture = {
      files: [
        {
          data: Buffer.from(
            '<script type="module" src="../assets/pet-host.js"></script>',
          ),
          relativePath: "pet/index.html",
        },
        {
          data: Buffer.from(requestSource),
          relativePath: "assets/pet-host.js",
        },
      ],
      manifest: {
        contributes: {
          pet: {
            library: "pet-library.json",
            overlay: "pet/index.html",
            protocol: "convax.pet-host/1",
            settings: "pet/index.html",
          },
        },
      },
      metadata: {
        id: "pet-transport-fixture",
        kind: "plugin",
        publication: { blockers: [], status: "ready" },
      },
    };
    expect(webResourceGraph(fixture).violations).toEqual([
      "pet-transport-fixture/assets/pet-host.js: handwritten pending Plugin Host request map",
      "pet-transport-fixture/assets/pet-host.js: direct Plugin Host postMessage transport",
      "pet-transport-fixture/assets/pet-host.js: handwritten Plugin Host request envelope",
    ]);

    fixture.metadata.publication = {
      blockers: [{
        code: "host-capability-review-required",
        note: `Pending generic SDK Pet client. ${petClientRequestDocument}`,
      }],
      status: "blocked",
    };
    expect(webResourceGraph(fixture).violations).toEqual([]);

    fixture.metadata.publication.blockers[0].note =
      "Pending generic SDK Pet client without a canonical request.";
    expect(webResourceGraph(fixture).violations).toHaveLength(3);
  });

  test("uses canonical Canvas commands and keeps renderer messages out of placement refs", async () => {
    const packages = await webPackages();
    const violations = [];
    for (const pkg of packages) {
      const canvas = pkg.manifest.contributes.canvas;
      if (!canvas?.commands && !canvas?.toolbar && !canvas?.menus) continue;
      const commands = new Map(
        (canvas.commands ?? []).map((command) => [command.id, command]),
      );
      const graph = webResourceGraph(pkg);
      violations.push(...graph.violations);
      const source = graph.files
        .map((file) => file.data.toString("utf8"))
        .join("\n");
      for (const command of commands.values()) {
        if (!quotedLiteral(source, command.target.message)) {
          violations.push(
            `${pkg.metadata.id}: renderer does not handle ${command.target.message}`,
          );
        }
        if (
          command.id !== command.target.message &&
          quotedLiteral(source, command.id)
        ) {
          violations.push(
            `${pkg.metadata.id}: renderer still handles placement token ${command.id}`,
          );
        }
      }
      for (const [surface, references] of [
        ["toolbar", canvas.toolbar ?? []],
        ["menus", canvas.menus ?? []],
      ]) {
        for (const reference of references) {
          const allowed =
            surface === "toolbar"
              ? new Set(["command", "id", "order"])
              : new Set(["command", "group", "id", "order", "placement"]);
          const legacy = Object.keys(reference).filter(
            (key) => !allowed.has(key),
          );
          if (legacy.length > 0) {
            violations.push(
              `${pkg.metadata.id}: ${surface}/${reference.id} has legacy fields ${legacy.join(",")}`,
            );
          }
          if (!commands.has(reference.command)) {
            violations.push(
              `${pkg.metadata.id}: ${surface}/${reference.id} references unknown command ${reference.command}`,
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("rejects a root-relative URL reached through nested Web subresources", () => {
    const fixture = {
      files: [
        {
          data: Buffer.from('<script type="module" src="./assets/app.js"></script>'),
          relativePath: "index.html",
        },
        {
          data: Buffer.from('import "../modules/nested.js"'),
          relativePath: "assets/app.js",
        },
        {
          data: Buffer.from('import "/host-root.js"'),
          relativePath: "modules/nested.js",
        },
      ],
      manifest: { contributes: {}, entry: "index.html" },
      metadata: { id: "root-relative-fixture", kind: "plugin" },
    };

    expect(webResourceGraph(fixture).violations).toEqual([
      'root-relative-fixture/modules/nested.js: root-relative URL "/host-root.js"',
    ]);
  });
});
