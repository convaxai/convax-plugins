import {
  PLUGIN_API_CATALOG_ARTIFACT_SCHEMA,
  PLUGIN_API_CATALOG_VERSION,
  pluginApiCatalog,
  renderPluginApiReference,
} from "@convax/plugin-api";
import {
  parsePluginApiCatalogArtifact,
  renderPluginApiJson,
} from "@convax/plugin-api/generator";
import { renderPluginCapabilityReference } from "@convax/plugin-sdk";
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createOwnedSkillReferenceFiles,
  ensureReferencesAreNotAuthored,
  ensureStableIndexes,
  generateSkillApiReferences,
  pluginCapabilityIndex,
  renderOwnedSkillReferences,
  skillCapabilityIndex,
  verifyExternalPluginApiCatalog,
} from "./generate-skill-api-references.mjs";
import { root } from "./lib.mjs";

function capabilityManifest(overrides = {}) {
  return {
    id: "example",
    contributes: {
      agent: {
        tools: [{ id: "inspect_media", tool: "media.inspect" }],
      },
      capabilities: {
        exports: [
          {
            docs: {
              request: "One bounded media selector.",
              response: "One bounded media inspection.",
              summary: "Inspect media",
            },
            id: "media.timeline.inspect",
            inputSchema: {
              additionalProperties: false,
              properties: {
                selector: { maxLength: 128, minLength: 1, type: "string" },
              },
              required: ["selector"],
              type: "object",
            },
            operation: "timeline.inspect",
            outputSchema: {
              additionalProperties: false,
              properties: {
                duration: { maximum: 86_400, minimum: 0, type: "number" },
              },
              required: ["duration"],
              type: "object",
            },
            sideEffect: "read",
            version: "1.4.0",
          },
        ],
        imports: {
          optional: [
            {
              id: "media.thumbnail.create",
              inputSchema: {
                additionalProperties: false,
                properties: {},
                required: [],
                type: "object",
              },
              outputSchema: {
                additionalProperties: false,
                properties: {},
                required: [],
                type: "object",
              },
              version: {
                maximumExclusive: "3.0.0",
                minimum: "2.1.0",
              },
            },
          ],
          required: [
            {
              id: "media.asset.inspect",
              inputSchema: {
                additionalProperties: false,
                properties: {},
                required: [],
                type: "object",
              },
              outputSchema: {
                additionalProperties: false,
                properties: {},
                required: [],
                type: "object",
              },
              version: {
                maximumExclusive: "2.0.0",
                minimum: "1.0.0",
              },
            },
          ],
        },
      },
      generation: {
        tools: [{
          description: "Inspect verified media.",
          id: "media.inspect",
          output: "text",
        }],
      },
    },
    ...overrides,
  };
}

function sourcesByPath(references) {
  return Object.fromEntries(
    references.map((reference) => [reference.path, reference.source]),
  );
}

async function withCatalog(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "convax-plugin-api-"));
  const source = renderPluginApiJson();
  const catalogPath = path.join(directory, "plugin-api.json");
  await fs.writeFile(catalogPath, source);
  try {
    return await callback({ catalogPath, directory, source });
  } finally {
    await fs.rm(directory, { force: true, recursive: true });
  }
}

describe("SDK-owned Plugin Skill references", () => {
  test("checks every owned Skill deterministically without writing generated source", async () => {
    await withCatalog(async ({ catalogPath, source }) => {
      const first = await generateSkillApiReferences({
        catalogPath,
        check: true,
        workspaceRoot: root,
      });
      const second = await generateSkillApiReferences({
        catalogPath,
        check: true,
        workspaceRoot: root,
      });

      expect(first).toEqual(second);
      expect(first.catalogSchema).toBe(PLUGIN_API_CATALOG_ARTIFACT_SCHEMA);
      expect(first.catalogVersion).toBe(PLUGIN_API_CATALOG_VERSION);
      expect(first.catalogDigest).toBe(
        createHash("sha256").update(source).digest("hex"),
      );
      expect(first.references).toHaveLength(7);
      expect(first.references.map(({ pluginId, skillName }) => [
        pluginId,
        skillName,
      ])).toEqual([
        ["chatcut", "chatcut"],
        ["ffmpeg-tools", "ffmpeg-canvas"],
        ["hello-convax", "hello-convax-guide"],
        ["jianying-editor", "jianying-editor"],
        ["relight-studio", "relight-studio"],
        ["storyai-3d-director-desk", "storyai-3d-director-desk"],
        ["storyboard-studio", "storyboard-studio"],
      ]);
      for (const reference of first.references) {
        expect(reference.files.map(({ path }) => path)).toEqual([
          "references/convax-capabilities.md",
          "references/plugin-capabilities.md",
        ]);
        expect(new TextDecoder().decode(reference.files[0].bytes)).toContain(
          "Generated by @convax/plugin-api. Do not edit.",
        );
        expect(new TextDecoder().decode(reference.files[1].bytes)).toContain(
          "Generated by @convax/plugin-sdk. Do not edit.",
        );
      }
      expect(Object.isFrozen(first.references)).toBe(true);
    });
  });

  test("requires one exact SDK Catalog artifact and binds its version and digest", async () => {
    await expect(
      verifyExternalPluginApiCatalog(),
    ).rejects.toThrow("--catalog is required");
    await expect(
      verifyExternalPluginApiCatalog("/definitely/missing/plugin-api.json"),
    ).rejects.toThrow("cannot read");

    await withCatalog(async ({ catalogPath, directory, source }) => {
      await expect(
        verifyExternalPluginApiCatalog(catalogPath),
      ).resolves.toEqual({
        digest: createHash("sha256").update(source).digest("hex"),
        schema: PLUGIN_API_CATALOG_ARTIFACT_SCHEMA,
        version: PLUGIN_API_CATALOG_VERSION,
      });
      expect(
        parsePluginApiCatalogArtifact(JSON.parse(source)).schema,
      ).toBe(PLUGIN_API_CATALOG_ARTIFACT_SCHEMA);

      const invalidPath = path.join(directory, "invalid.json");
      await fs.writeFile(invalidPath, "{");
      await expect(
        verifyExternalPluginApiCatalog(invalidPath),
      ).rejects.toThrow("must be valid UTF-8 JSON");

      const mismatched = JSON.parse(source);
      mismatched.apis[0].docs.summary += " changed";
      const mismatchedPath = path.join(directory, "mismatched.json");
      await fs.writeFile(mismatchedPath, `${JSON.stringify(mismatched)}\n`);
      await expect(
        verifyExternalPluginApiCatalog(mismatchedPath),
      ).rejects.toThrow(`must exactly match @convax/plugin-api ${PLUGIN_API_CATALOG_VERSION}`);

      const versionPath = path.join(directory, "wrong-version.json");
      await fs.writeFile(
        versionPath,
        source.replace(
          `"version": "${PLUGIN_API_CATALOG_VERSION}"`,
          '"version": "999.0.0"',
        ),
      );
      await expect(
        verifyExternalPluginApiCatalog(versionPath),
      ).rejects.toThrow(`must exactly match @convax/plugin-api ${PLUGIN_API_CATALOG_VERSION}`);
    });
  });

  test("renders tools, import availability and exported operations from SDK declarations", () => {
    const references = renderOwnedSkillReferences({
      manifest: capabilityManifest(),
      skill: {
        name: "example-skill",
        uses: { pluginTools: ["inspect_media"] },
      },
    });
    const sources = sourcesByPath(references);
    const host = sources["references/convax-capabilities.md"];
    const plugin = sources["references/plugin-capabilities.md"];

    expect(host).toContain(`Host API catalog: ${PLUGIN_API_CATALOG_VERSION}`);
    expect(host).toContain("This Skill does not call a Convax Host API.");
    expect(host).toContain(
      "`inspect_media` | Inspect verified media. | Validated input for manifest operation `media.inspect`.",
    );
    expect(host).toContain(
      "Bounded text result from the verified Plugin runtime.",
    );
    expect(plugin).toContain(
      "Provider availability is bound to one immutable ActivePluginSet.",
    );
    expect(plugin).toContain(
      "`media.asset.inspect` | required | `>=1.0.0 <2.0.0`",
    );
    expect(plugin).toContain(
      "`media.thumbnail.create` | optional | `>=2.1.0 <3.0.0`",
    );
    expect(plugin).toContain(
      "`media.timeline.inspect` | 1.4.0 | `timeline.inspect` | read | Inspect media",
    );
    expect(plugin).toContain('"maxLength": 128');
    expect(plugin).toContain('"maximum": 86400');
    expect(host).toBe(
      renderPluginApiReference({
        optionalIds: [],
        pluginTools: [{
          id: "inspect_media",
          request: "Validated input for manifest operation `media.inspect`.",
          response: "Bounded text result from the verified Plugin runtime.",
          summary: "Inspect verified media.",
        }],
        requiredIds: [],
      }),
    );
    expect(plugin).toBe(
      renderPluginCapabilityReference(
        capabilityManifest().contributes.capabilities,
      ),
    );
    expect(plugin).toBe(
      sourcesByPath(renderOwnedSkillReferences({
        manifest: capabilityManifest(),
        skill: {
          name: "example-skill",
          uses: { pluginTools: ["inspect_media"] },
        },
      }))["references/plugin-capabilities.md"],
    );
    expect(
      createOwnedSkillReferenceFiles({
        manifest: capabilityManifest(),
        skill: {
          name: "example-skill",
          uses: { pluginTools: ["inspect_media"] },
        },
      }).map(({ bytes, path }) => ({
        path,
        source: new TextDecoder().decode(bytes),
      })),
    ).toEqual(references);
  });

  test("tracks the SDK catalog version and every Agent API since version", () => {
    const agentApis = pluginApiCatalog.apis.filter(
      (definition) => definition.audience.includes("agent-skill"),
    );
    const references = sourcesByPath(renderOwnedSkillReferences({
      manifest: capabilityManifest(),
      skill: {
        name: "example-skill",
        uses: { optionalHostApis: agentApis.map(({ id }) => id) },
      },
    }));
    const host = references["references/convax-capabilities.md"];

    expect(host).toContain(`Host API catalog: ${PLUGIN_API_CATALOG_VERSION}`);
    if (agentApis.length === 0) {
      expect(host).toContain("This Skill does not call a Convax Host API.");
    } else {
      for (const definition of agentApis) {
        expect(host).toContain(
          `| \`${definition.id}\` | optional | ${definition.since} |`,
        );
        expect(host).toContain(
          `- Available since: Host API ${definition.since}`,
        );
      }
    }
  });

  test("fails closed for unknown APIs, Web-only APIs, tools and malformed capability declarations", () => {
    expect(() =>
      renderOwnedSkillReferences({
        manifest: capabilityManifest(),
        skill: {
          name: "example-skill",
          uses: { requiredHostApis: ["unknown.agent.api"] },
        },
      }),
    ).toThrow("unknown Plugin API");
    expect(() =>
      renderOwnedSkillReferences({
        manifest: capabilityManifest(),
        skill: {
          name: "example-skill",
          uses: { requiredHostApis: ["host.context.get"] },
        },
      }),
    ).toThrow("not callable by agent-skill");
    expect(() =>
      renderOwnedSkillReferences({
        manifest: capabilityManifest(),
        skill: {
          name: "example-skill",
          uses: { pluginTools: ["missing_tool"] },
        },
      }),
    ).toThrow("references an undocumented Plugin tool");
    const malformed = capabilityManifest();
    malformed.contributes.capabilities.imports.required[0].version =
      { maximumExclusive: "1.0.0", minimum: "2.0.0" };
    expect(() =>
      renderOwnedSkillReferences({
        manifest: malformed,
        skill: { name: "example-skill" },
      }),
    ).toThrow("non-empty half-open interval");
  });

  test("rejects authored generated-reference paths case-insensitively", () => {
    expect(() =>
      ensureReferencesAreNotAuthored(
        [{ relativePath: "references/convax-capabilities.md" }],
        "example",
      ),
    ).toThrow("generated reference is reserved and must not be authored");
    expect(() =>
      ensureReferencesAreNotAuthored(
        ["References/Plugin-Capabilities.md"],
        "example",
      ),
    ).toThrow("generated reference is reserved and must not be authored");
    expect(() =>
      ensureReferencesAreNotAuthored(
        ["references/author-notes.md"],
        "example",
      ),
    ).not.toThrow();
  });

  test("requires both stable SKILL indexes exactly once", () => {
    const valid = `${skillCapabilityIndex}\n${pluginCapabilityIndex}\n`;
    expect(() => ensureStableIndexes(valid, "SKILL.md")).not.toThrow();
    expect(() =>
      ensureStableIndexes(skillCapabilityIndex, "SKILL.md"),
    ).toThrow("Plugin capabilities");
    expect(() =>
      ensureStableIndexes(
        `${valid}${pluginCapabilityIndex}\n`,
        "SKILL.md",
      ),
    ).toThrow("exactly one stable capability index");
  });
});
