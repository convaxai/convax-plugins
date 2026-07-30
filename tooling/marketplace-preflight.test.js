import {
  PLUGIN_API_CATALOG_ARTIFACT_SCHEMA,
  PLUGIN_API_CATALOG_VERSION,
} from "@convax/plugin-api";
import { renderPluginApiJson } from "@convax/plugin-api/generator";
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { marketplacePreflight } from "./marketplace-preflight.mjs";

async function createWorkspace() {
  const workspaceRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "convax-preflight-"),
  );
  const skillRoot = path.join(
    workspaceRoot,
    "packages",
    "skills",
    "preflight-skill",
  );
  await fs.mkdir(path.join(skillRoot, "package"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "registry"), { recursive: true });
  await fs.mkdir(
    path.join(workspaceRoot, "docs", "host-capability-requests"),
    { recursive: true },
  );
  await fs.writeFile(
    path.join(workspaceRoot, "registry", "host-capability-policy.json"),
    JSON.stringify({
      requests: [],
      schema: "convax.host-capability-policy/1",
    }),
  );
  await fs.writeFile(
    path.join(skillRoot, "convax-package.json"),
    JSON.stringify({
      description: "Verify Marketplace preflight Catalog binding.",
      id: "preflight-skill",
      kind: "skill",
      name: "Preflight Skill",
      schema: "convax.package/2",
      version: "1.0.0",
      yanked: false,
    }),
  );
  await fs.writeFile(
    path.join(skillRoot, "package.json"),
    JSON.stringify({
      name: "@microvoid/convax-skill-preflight-skill",
      private: true,
      scripts: {
        pack: "true",
        validate: "true",
      },
      type: "module",
      version: "1.0.0",
    }),
  );
  await fs.writeFile(
    path.join(skillRoot, "package", "SKILL.md"),
    [
      "---",
      "name: preflight-skill",
      "version: 1.0.0",
      "description: Verify Marketplace preflight Catalog binding.",
      "---",
      "",
      "# Preflight Skill",
      "",
      "Return the verified preflight result.",
      "",
    ].join("\n"),
  );
  const catalogSource = renderPluginApiJson();
  const catalogPath = path.join(workspaceRoot, "plugin-api.json");
  await fs.writeFile(catalogPath, catalogSource);
  return { catalogPath, catalogSource, workspaceRoot };
}

describe("Marketplace preflight Catalog binding", () => {
  test("requires and forwards one exact SDK Catalog", async () => {
    const fixture = await createWorkspace();
    try {
      await expect(
        marketplacePreflight({ workspaceRoot: fixture.workspaceRoot }),
      ).rejects.toThrow("requires --catalog");

      const result = await marketplacePreflight({
        catalogPath: fixture.catalogPath,
        workspaceRoot: fixture.workspaceRoot,
      });
      expect(result.packages.map(({ metadata }) => metadata.id)).toEqual([
        "preflight-skill",
      ]);
      expect(result.catalogSchema).toBe(PLUGIN_API_CATALOG_ARTIFACT_SCHEMA);
      expect(result.catalogVersion).toBe(PLUGIN_API_CATALOG_VERSION);
      expect(result.catalogDigest).toBe(
        createHash("sha256").update(fixture.catalogSource).digest("hex"),
      );

      const mismatchPath = path.join(fixture.workspaceRoot, "mismatch.json");
      await fs.writeFile(
        mismatchPath,
        fixture.catalogSource.replace(
          `"version": "${PLUGIN_API_CATALOG_VERSION}"`,
          '"version": "2.0.0"',
        ),
      );
      await expect(
        marketplacePreflight({
          catalogPath: mismatchPath,
          workspaceRoot: fixture.workspaceRoot,
        }),
      ).rejects.toThrow("must exactly match @convax/plugin-api");
    } finally {
      await fs.rm(fixture.workspaceRoot, { force: true, recursive: true });
    }
  });
});
