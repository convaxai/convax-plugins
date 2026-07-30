import {
  PLUGIN_API_CATALOG_VERSION,
  renderPluginApiReference,
} from "@convax/plugin-api";
import {
  parsePluginApiCatalogArtifact,
  renderPluginApiJson,
} from "@convax/plugin-api/generator";
import { renderPluginCapabilityReference } from "@convax/plugin-sdk";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { discoverPackages, root } from "./lib.mjs";

const convaxReferencePath = "references/convax-capabilities.md";
const pluginReferencePath = "references/plugin-capabilities.md";
const stableIndexes = Object.freeze([
  "See [Convax capabilities](references/convax-capabilities.md) for the generated Host API and Plugin tool availability contract.",
  "See [Plugin capabilities](references/plugin-capabilities.md) for generated Plugin-to-Plugin imports and exports.",
]);
const reservedReferencePaths = new Set([
  convaxReferencePath,
  pluginReferencePath,
].map((value) => value.toLocaleLowerCase("en-US")));

function fail(label, message) {
  throw new Error(`${label}: ${message}`);
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function verifyExternalPluginApiCatalog(catalogPath) {
  if (typeof catalogPath !== "string" || catalogPath.length === 0) {
    fail("arguments", "--catalog is required");
  }
  let bytes;
  try {
    bytes = await fs.readFile(catalogPath);
  } catch (cause) {
    fail(
      "external Host API catalog",
      `cannot read ${catalogPath}${cause?.code ? ` (${cause.code})` : ""}`,
    );
  }
  let source;
  let candidate;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    candidate = JSON.parse(source);
  } catch {
    fail("external Host API catalog", "must be valid UTF-8 JSON");
  }
  let artifact;
  try {
    artifact = parsePluginApiCatalogArtifact(candidate);
  } catch (cause) {
    fail(
      "external Host API catalog",
      `is not a canonical @convax/plugin-api artifact${cause instanceof Error ? `: ${cause.message}` : ""}`,
    );
  }
  const expected = renderPluginApiJson();
  if (artifact.version !== PLUGIN_API_CATALOG_VERSION || source !== expected) {
    fail(
      "external Host API catalog",
      `must exactly match @convax/plugin-api ${PLUGIN_API_CATALOG_VERSION}`,
    );
  }
  return Object.freeze({
    digest: createHash("sha256").update(bytes).digest("hex"),
    schema: artifact.schema,
    version: artifact.version,
  });
}

function ensureStableIndexes(source, label) {
  for (const stableIndex of stableIndexes) {
    const occurrences = source.split(stableIndex).length - 1;
    if (occurrences !== 1) {
      fail(
        label,
        `SKILL.md must contain exactly one stable capability index: ${stableIndex}`,
      );
    }
  }
}

function ensureReferencesAreNotAuthored(files, label) {
  for (const file of files) {
    const relativePath =
      typeof file === "string" ? file : file?.relativePath;
    if (
      typeof relativePath === "string" &&
      reservedReferencePaths.has(relativePath.toLocaleLowerCase("en-US"))
    ) {
      fail(
        label,
        `generated reference is reserved and must not be authored: ${relativePath}`,
      );
    }
  }
}

function pluginToolReferences(manifest, skill) {
  const generationTools = new Map(
    (manifest.contributes.generation?.tools ?? []).map((tool) => [tool.id, tool]),
  );
  const agentTools = new Map(
    (manifest.contributes.agent?.tools ?? []).map((tool) => [tool.id, tool.tool]),
  );
  return (skill.uses?.pluginTools ?? []).map((agentToolId) => {
    const generationToolId = agentTools.get(agentToolId);
    const generationTool =
      generationToolId === undefined
        ? undefined
        : generationTools.get(generationToolId);
    if (!generationTool) {
      fail(
        `${manifest.id}/${skill.name}`,
        `references an undocumented Plugin tool: ${agentToolId}`,
      );
    }
    return {
      id: agentToolId,
      summary: generationTool.description,
      request: `Validated input for manifest operation \`${generationTool.id}\`.`,
      response: `Bounded ${generationTool.output} result from the verified Plugin runtime.`,
    };
  });
}

export function renderOwnedSkillReferences({ manifest, skill }) {
  const capabilityDeclaration =
    manifest.contributes.capabilities ?? {
      exports: [],
      imports: { optional: [], required: [] },
    };
  return Object.freeze([
    Object.freeze({
      path: convaxReferencePath,
      source: renderPluginApiReference({
        optionalIds: skill.uses?.optionalHostApis ?? [],
        pluginTools: pluginToolReferences(manifest, skill),
        requiredIds: skill.uses?.requiredHostApis ?? [],
      }),
    }),
    Object.freeze({
      path: pluginReferencePath,
      source: renderPluginCapabilityReference(capabilityDeclaration),
    }),
  ]);
}

export function createOwnedSkillReferenceFiles(input) {
  return Object.freeze(
    renderOwnedSkillReferences(input).map((reference) => Object.freeze({
      bytes: new TextEncoder().encode(reference.source),
      path: reference.path,
    })),
  );
}

export async function generateSkillApiReferences({
  catalogPath,
  check = true,
  workspaceRoot = root,
} = {}) {
  if (check !== true) {
    fail(
      "arguments",
      "generated Skill references are SDK-owned; only in-memory check mode is supported",
    );
  }
  const catalog = await verifyExternalPluginApiCatalog(catalogPath);
  const packages = await discoverPackages({ workspaceRoot });
  const skillsById = new Map(
    packages
      .filter((pkg) => pkg.metadata.kind === "skill")
      .map((pkg) => [pkg.metadata.id, pkg]),
  );
  const references = [];
  const plugins = packages
    .filter((pkg) => pkg.metadata.kind === "plugin")
    .sort((left, right) => compareAscii(left.metadata.id, right.metadata.id));
  for (const plugin of plugins) {
    const ownedSkills = [...(plugin.manifest.contributes.skills ?? [])]
      .sort((left, right) => compareAscii(left.name, right.name));
    for (const skill of ownedSkills) {
      const source = skillsById.get(skill.name);
      if (!source || source.metadata.ownerPluginId !== plugin.metadata.id) {
        fail(
          `${plugin.metadata.id}/${skill.name}`,
          "owned Skill source is missing or misbound",
        );
      }
      const label = `${plugin.metadata.id}/${skill.name}`;
      ensureReferencesAreNotAuthored(source.files, label);
      ensureStableIndexes(
        await fs.readFile(path.join(source.packageRoot, "SKILL.md"), "utf8"),
        `${skill.name}/SKILL.md`,
      );
      references.push(Object.freeze({
        bundlePath: skill.path,
        files: createOwnedSkillReferenceFiles({
          manifest: plugin.manifest,
          skill,
        }),
        pluginId: plugin.metadata.id,
        skillName: skill.name,
      }));
    }
  }
  return Object.freeze({
    catalogDigest: catalog.digest,
    catalogSchema: catalog.schema,
    catalogVersion: catalog.version,
    references: Object.freeze(references),
  });
}

function parseCli(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      result.check = true;
      continue;
    }
    if (argument !== "--catalog" && argument !== "--workspace-root") {
      fail("arguments", `unsupported ${argument}`);
    }
    const key = argument.slice(2);
    if (result[key] !== undefined) {
      fail("arguments", `duplicate ${argument}`);
    }
    const value = argv[++index];
    if (!value || value.startsWith("--")) {
      fail("arguments", `${argument} requires a path`);
    }
    result[key] = value;
  }
  if (result.check !== true) {
    fail(
      "arguments",
      "--check is required because Marketplace Kit owns generated reference bytes",
    );
  }
  if (!result.catalog) fail("arguments", "--catalog is required");
  return result;
}

if (import.meta.main) {
  const args = parseCli(process.argv.slice(2).filter((item) => item !== "--"));
  const workspaceRoot = args.workspaceRoot
    ? path.resolve(args.workspaceRoot)
    : root;
  const result = await generateSkillApiReferences({
    catalogPath: path.resolve(workspaceRoot, args.catalog),
    check: true,
    workspaceRoot,
  });
  console.log(
    `Verified ${result.references.length} Plugin-owned Skill reference inputs against @convax/plugin-api ${result.catalogVersion} and @convax/plugin-sdk.`,
  );
}

export const skillCapabilityIndex = stableIndexes[0];
export const pluginCapabilityIndex = stableIndexes[1];
export {
  ensureReferencesAreNotAuthored,
  ensureStableIndexes,
  pluginToolReferences,
};
