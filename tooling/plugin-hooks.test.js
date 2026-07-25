import path from "node:path";

import { describe, expect, test } from "bun:test";

import {
  assertPluginStatic,
  parsePluginManifest,
  readJson,
  root,
} from "./lib.mjs";

function hookManifest(schema, hooks = "hooks/index.mjs") {
  const common = {
    schema,
    id: "example-hook",
    name: "Example Hook",
    description: "Extends the native OpenCode Agent lifecycle.",
    version: "1.0.0",
    hooks,
  };
  if (schema === "convax.plugin/1") {
    return {
      ...common,
      entry: "index.html",
      capabilities: [],
      contributes: {
        canvas: {
          renderer: { create: true, height: 300, width: 480 },
        },
      },
    };
  }
  return { ...common, contributes: {} };
}

function hookFile(source) {
  return {
    data: Buffer.from(source),
    mode: 0o100644,
    relativePath: "hooks/index.mjs",
  };
}

describe("native OpenCode Hook authoring", () => {
  test("keeps hooks additive in v1 and permits Hook-only v2-v6 packages", () => {
    for (let version = 1; version <= 6; version += 1) {
      const schema = `convax.plugin/${version}`;
      const parsed = parsePluginManifest(hookManifest(schema));
      expect(parsed.schema).toBe(schema);
      expect(parsed.hooks).toBe("hooks/index.mjs");
      if (version === 1) expect(parsed.entry).toBe("index.html");
      else expect(parsed).not.toHaveProperty("entry");
    }
  });

  test("keeps public Hook path schemas aligned with the authoring parser", async () => {
    const valid = ["hooks/index.mjs", "hooks/editor hook.js", "扩展/入口.mjs"];
    const invalid = [
      " hooks/index.mjs",
      "CON.mjs",
      "hooks//index.mjs",
      "hooks/../index.mjs",
      "hooks/index*.mjs",
      "hooks/trailing./index.mjs",
      "hooks/index.MJS",
    ];
    const v4 = await readJson(
      path.join(root, "schemas", "convax-plugin-manifest-v4.schema.json"),
    );

    for (let version = 1; version <= 6; version += 1) {
      const schema = await readJson(
        path.join(
          root,
          "schemas",
          `convax-plugin-manifest-v${version}.schema.json`,
        ),
      );
      expect(schema.properties.hooks.$ref).toEndWith("#/$defs/hookPath");
      const definition =
        version <= 4 ? schema.$defs.hookPath : v4.$defs.hookPath;
      const pattern = new RegExp(definition.pattern, "u");
      for (const value of valid) expect(pattern.test(value)).toBe(true);
      for (const value of invalid) expect(pattern.test(value)).toBe(false);
    }

    for (const value of valid) {
      expect(
        parsePluginManifest(hookManifest("convax.plugin/2", value)).hooks,
      ).toBe(value);
    }
    for (const value of invalid) {
      expect(() =>
        parsePluginManifest(hookManifest("convax.plugin/2", value)),
      ).toThrow();
    }
  });

  test("uses parsed imports to enforce the one-file snapshot boundary", () => {
    expect(() =>
      assertPluginStatic(
        [
          hookFile(
            'import fs from "node:fs";\nexport default async () => ({ event: async () => fs.constants.F_OK });',
          ),
        ],
        "plugin",
        "hooks/index.mjs",
      ),
    ).not.toThrow();

    for (const source of [
      'import(/* bundled comment */ "./helper.mjs")',
      'import("." + "/helper.mjs")',
      'require("./helper.cjs")',
      'export { default } from "./helper.mjs"',
      'import "file:///tmp/helper.mjs"',
      'import lodash from "lodash"',
      'import("node:fs")',
      'const load = require; export default async () => load("./helper.cjs")',
      'export default async () => (0, require)("./helper.cjs")',
      "module.exports = {}; export default async () => ({})",
      "exports.Plugin = async () => ({}); export default async () => ({})",
      'import { createRequire } from "node:module"; export default async () => createRequire(import.meta.url)',
    ]) {
      expect(() =>
        assertPluginStatic([hookFile(source)], "plugin", "hooks/index.mjs"),
      ).toThrow("self-contained");
    }
    expect(() =>
      assertPluginStatic(
        [hookFile("export default (")],
        "plugin",
        "hooks/index.mjs",
      ),
    ).toThrow("valid JavaScript");
    expect(() =>
      assertPluginStatic(
        [hookFile("module.exports = async () => ({})")],
        "plugin",
        "hooks/index.mjs",
      ),
    ).toThrow("self-contained");
    expect(() =>
      assertPluginStatic(
        [hookFile("export {}")],
        "plugin",
        "hooks/index.mjs",
      ),
    ).toThrow("must export an OpenCode Plugin entry");
  });

  test("requires the exact declared Hook file in the package inventory", () => {
    expect(() =>
      assertPluginStatic(
        [hookFile("export default async () => ({})")],
        "plugin",
        "hooks/other.mjs",
      ),
    ).toThrow("missing hooks hooks/other.mjs");
  });
});
