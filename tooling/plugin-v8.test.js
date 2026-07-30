import { describe, expect, test } from "bun:test";
import {
  assertPackagesPublishable,
  parseHostCapabilityPolicy,
  parsePluginManifest,
} from "./lib.mjs";

function manifest(overrides = {}) {
  return {
    schema: "convax.plugin/8",
    id: "example-plugin",
    name: "Example Plugin",
    description: "An example Plugin.",
    version: "1.0.0",
    entry: "index.html",
    capabilities: [],
    hostApi: {
      major: 1,
      required: ["host.context.get"],
      optional: [],
    },
    contributes: {
      canvas: { renderer: { create: true } },
    },
    ...overrides,
  };
}

function metadata() {
  return {
    schema: "convax.package/2",
    kind: "plugin",
    id: "example-plugin",
    name: "Example Plugin",
    description: "An example Plugin.",
    version: "1.0.0",
    yanked: false,
  };
}

function blockedPublication(blockers) {
  const [blocker] = blockers;
  return parseHostCapabilityPolicy({
    schema: "convax.host-capability-policy/1",
    requests: [{
      id: "example-request",
      document: "docs/host-capability-requests/example-request.md",
      status: "pending",
      humanDecision: null,
      affected: [{
        kind: "plugin",
        id: "example-plugin",
        version: "1.0.0",
        blocker: {
          ...blocker,
          note: `${blocker.note} docs/host-capability-requests/example-request.md`,
        },
      }],
    }],
  }).packages[0];
}

describe("convax.package/2 and convax.plugin/8 publication contract", () => {
  test("accepts only v8 publish candidates and requires Web context negotiation", () => {
    expect(parsePluginManifest(manifest()).schema).toBe("convax.plugin/8");
    expect(() =>
      parsePluginManifest({ ...manifest(), schema: "convax.plugin/7" }),
    ).toThrow("must use convax.plugin/8");
    expect(() =>
      parsePluginManifest({
        ...manifest(),
        hostApi: { major: 1, required: [], optional: [] },
      }),
    ).toThrow("host.context.get");
  });

  test("keeps headless Plugin Host API declarations explicit and empty", () => {
    const parsed = parsePluginManifest({
      ...manifest(),
      entry: undefined,
      hostApi: { major: 1, required: [], optional: [] },
      contributes: {},
      hooks: "hooks.mjs",
    });
    expect(parsed.hostApi).toEqual({ major: 1, required: [], optional: [] });
  });

  test("keeps publication policy outside portable package metadata", () => {
    expect(metadata()).not.toHaveProperty("publication");
    expect(metadata()).not.toHaveProperty("compatibility");
    expect(() =>
      parseHostCapabilityPolicy({
        schema: "convax.host-capability-policy/1",
        requests: [{
          id: "example-request",
          document: "docs/host-capability-requests/example-request.md",
          status: "pending",
          humanDecision: null,
          affected: [],
        }],
      }),
    ).toThrow("affected must contain");
    expect(() =>
      parseHostCapabilityPolicy({
        schema: "convax.host-capability-policy/1",
        requests: [{
          id: "example-request",
          document: "docs/host-capability-requests/example-request.md",
          status: "approved",
          humanDecision: {
            decision: "approved",
            reviewer: "self-authored",
          },
          affected: [{
            kind: "plugin",
            id: "example-plugin",
            version: "1.0.0",
            blocker: {
              code: "host-capability-review-required",
              note: "docs/host-capability-requests/example-request.md",
            },
          }],
        }],
      }),
    ).toThrow("trusted, externally verified human decision receipt");
  });

  test("fails closed before publishing blocked packages", () => {
    const policy = blockedPublication([{
      code: "unverified-runtime-dependency",
        note: "Uses ambient PATH.",
    }]);
    const blocked = {
      ...metadata(),
      publication: { status: policy.status, blockers: policy.blockers },
    };
    expect(() =>
      assertPackagesPublishable(
        [{ metadata: blocked, manifest: manifest() }],
        "release plan",
      ),
    ).toThrow("blocked packages cannot be published");
  });

  test("admits a structured missing-Host review blocker without authorizing Host work", () => {
    const blocked = blockedPublication([{
        code: "host-capability-review-required",
        note: "The generated Catalog does not define the required generic API.",
      }]);
    expect(blocked).toEqual({
      kind: "plugin",
      id: "example-plugin",
      version: "1.0.0",
      status: "blocked",
      blockers: [{
        code: "host-capability-review-required",
        note: expect.stringContaining("The generated Catalog does not define the required generic API."),
      }],
    });
  });

  test("uses canonical Canvas commands with toolbar and overflow-menu references", () => {
    const parsed = parsePluginManifest(manifest({
      contributes: {
        canvas: {
          commands: [
            {
              id: "context.refresh",
              title: {
                default: "Refresh context",
                "zh-CN": "刷新上下文",
              },
              icon: "refresh",
              target: {
                type: "renderer-message",
                message: "renderer.context.refresh",
              },
            },
          ],
          renderer: { create: true },
          toolbar: [
            { id: "refresh", command: "context.refresh", order: 10 },
          ],
          menus: [
            {
              id: "refresh-overflow",
              command: "context.refresh",
              placement: "overflow",
              group: "context",
            },
          ],
        },
      },
    }));
    expect(parsed.contributes.canvas.commands[0]).toEqual({
      id: "context.refresh",
      title: {
        default: "Refresh context",
        "zh-CN": "刷新上下文",
      },
      icon: "refresh",
      target: {
        type: "renderer-message",
        message: "renderer.context.refresh",
      },
    });
    expect(parsed.contributes.canvas.toolbar).toEqual([
      { id: "refresh", command: "context.refresh", order: 10 },
    ]);
    expect(parsed.contributes.canvas.menus).toEqual([
      {
        id: "refresh-overflow",
        command: "context.refresh",
        placement: "overflow",
        group: "context",
      },
    ]);

    const legacyToolbar = structuredClone(parsed);
    legacyToolbar.contributes.canvas.toolbar[0].title = "Refresh";
    expect(() => parsePluginManifest(legacyToolbar)).toThrow(
      "unsupported or missing fields",
    );

    const unknownReference = structuredClone(parsed);
    unknownReference.contributes.canvas.toolbar[0].command = "missing";
    expect(() => parsePluginManifest(unknownReference)).toThrow(
      "references an unknown command",
    );

    const unsupportedTarget = structuredClone(parsed);
    unsupportedTarget.contributes.canvas.commands[0].target.type = "host-action";
    expect(() => parsePluginManifest(unsupportedTarget)).toThrow(
      "type must be renderer-message",
    );
  });

  test("keeps Skill Host APIs within top-level declaration and tools within contributions", () => {
    const base = manifest({
      hostApi: {
        major: 1,
        required: ["host.context.get"],
        optional: ["generation.tools.list"],
      },
      runtime: { type: "mcp-stdio", command: "example-mcp" },
      capabilities: ["generation.execute"],
      contributes: {
        agent: {
          tools: [{ id: "import_media", tool: "media.import" }],
        },
        canvas: { renderer: { create: true } },
        generation: {
          models: [],
          tools: [{
            id: "media.import",
            title: "Import",
            description: "Import media.",
            acceptedInputs: [],
            output: "text",
          }],
        },
        skills: [{
          name: "example-skill",
          path: "skills/example-skill",
          uses: { pluginTools: ["import_media"] },
        }],
      },
    });
    expect(parsePluginManifest(base).contributes.skills[0].uses).toEqual({
      pluginTools: ["import_media"],
    });
    const outside = structuredClone(base);
    outside.contributes.skills[0].uses.optionalHostApis = ["generation.tools.list"];
    expect(() => parsePluginManifest(outside)).toThrow(
      "is not available to Agent Skills",
    );
    const optionalAsRequired = structuredClone(base);
    optionalAsRequired.contributes.skills[0].uses.requiredHostApis = [
      "generation.tools.list",
    ];
    expect(() => parsePluginManifest(optionalAsRequired)).toThrow(
      "must be required by the Plugin",
    );
    const unknownTool = structuredClone(base);
    unknownTool.contributes.skills[0].uses.pluginTools = ["missing_tool"];
    expect(() => parsePluginManifest(unknownTool)).toThrow("unknown Agent tool");
    const emptyUses = structuredClone(base);
    emptyUses.contributes.skills[0].uses = {};
    expect(() => parsePluginManifest(emptyUses)).toThrow(
      "must declare at least one Host API or Plugin tool",
    );
  });
});
