import { describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import path from "node:path"

import {
  buildRelightGenerationRequest,
  normalizeGenerationTools,
} from "../packages/plugins/relight-studio/package/assets/generation.js"
import {
  assertPluginStatic,
  collectFiles,
  discoverPackages,
  parsePluginManifest,
  readJson,
  root,
} from "./lib.mjs"

const sourceRoot = path.join(root, "packages", "plugins", "relight-studio")
const packageRoot = path.join(sourceRoot, "package")
const skillRoot = path.join(root, "packages", "skills", "relight-studio")

describe("relight-studio package", () => {
  test("declares a v8 Web caller admitted by automated Catalog contracts", async () => {
    const packages = await discoverPackages({
      kind: "plugin",
      id: "relight-studio",
    })
    const metadata = packages.find((pkg) => pkg.kind === "plugin").metadata
    const manifest = parsePluginManifest(
      await readJson(path.join(packageRoot, "manifest.json")),
      "plugin/relight-studio manifest",
    )

    expect(metadata).toEqual({
      schema: "convax.package/2",
      kind: "plugin",
      id: "relight-studio",
      name: "重打光",
      description: manifest.description,
      version: "0.2.2",
      publication: {
        status: "ready",
        blockers: [],
      },
      yanked: false,
    })
    expect(manifest).toEqual(
      expect.objectContaining({
        schema: "convax.plugin/8",
        id: metadata.id,
        name: metadata.name,
        description: metadata.description,
        version: metadata.version,
        entry: "index.html",
        capabilities: [
          "canvas.connectedInputs.read",
          "canvas.connectedImages.read",
          "canvas.node.write",
          "generation.execute",
          "ui.fullscreen",
        ],
        hostApi: {
          major: 3,
          required: [
            "canvas.inputs.image.close",
            "canvas.inputs.image.open",
            "canvas.inputs.list",
            "canvas.node.state.replace",
            "generation.execute",
            "generation.tools.list",
            "host.context.get",
          ],
          optional: [],
        },
      }),
    )
    expect(manifest.contributes).toEqual({
      canvas: {
        renderer: { create: true, width: 1080, height: 720 },
      },
      skills: [
        {
          name: "relight-studio",
          path: "skills/relight-studio",
        },
      ],
    })
    expect(metadata).not.toHaveProperty("compatibility")
    expect(manifest).not.toHaveProperty("skill")
    expect(manifest).not.toHaveProperty("runtime")
    expect(manifest.contributes).not.toHaveProperty("generation")
    expect(metadata).not.toHaveProperty("companions")
  })

  test("selects only generic reference-image generation tools", () => {
    expect(
      normalizeGenerationTools({
        tools: [
          {
            id: "example-vendor/image-a",
            title: "Image A",
            description: "Accepts image references.",
            kind: "model",
            output: "image",
            acceptedInputs: ["reference_image"],
          },
          {
            id: "example-vendor/image-without-reference",
            title: "Prompt-only image",
            kind: "model",
            output: "image",
            acceptedInputs: [],
          },
          {
            id: "example-vendor/video-a",
            title: "Video A",
            kind: "model",
            output: "video",
            acceptedInputs: ["reference_image"],
          },
          {
            id: "example-vendor/image-operation",
            title: "Image operation",
            kind: "operation",
            output: "image",
            acceptedInputs: ["reference_image"],
          },
          {
            id: "example-vendor/image-a",
            title: "Duplicate Image A",
            kind: "model",
            output: "image",
            acceptedInputs: ["reference_image"],
          },
        ],
      }),
    ).toEqual([
      {
        id: "example-vendor/image-a",
        title: "Image A",
        description: "Accepts image references.",
      },
    ])
  })

  test("drains Plugin state before requesting a pending Canvas generation node", async () => {
    const request = buildRelightGenerationRequest({
      prompt: "Relight this image.",
      referenceInputKey: "source-image",
      toolId: "example-vendor/image-a",
    })
    expect(request).toEqual({
      output: "image",
      prompt: "Relight this image.",
      references: [{ inputKey: "source-image", role: "reference_image" }],
      resultMode: "create-pending-node",
      toolId: "example-vendor/image-a",
    })
    expect(request).not.toHaveProperty("nodeId")

    const app = await fs.readFile(
      path.join(packageRoot, "assets", "app.js"),
      "utf8",
    )
    const resultValidationStart = app.indexOf(
      "function validGenerationResult(value)",
    )
    const generateStart = app.indexOf("async function generateRelight()")
    const generateEnd = app.indexOf("\nfunction bindControls()", generateStart)
    expect(resultValidationStart).toBeGreaterThanOrEqual(0)
    expect(generateStart).toBeGreaterThanOrEqual(0)
    expect(generateEnd).toBeGreaterThan(generateStart)
    const resultValidation = app.slice(resultValidationStart, generateStart)
    const generate = app.slice(generateStart, generateEnd)
    const drainIndex = generate.indexOf("await drainStateSave()")
    const executeIndex = generate.indexOf(
      'hostRequest(\n      "generation.execute"',
    )
    expect(drainIndex).toBeGreaterThanOrEqual(0)
    expect(executeIndex).toBeGreaterThan(drainIndex)
    expect(generate.slice(0, executeIndex)).not.toContain(
      "void flushStateSave()",
    )
    expect(generate.slice(executeIndex)).toContain("void flushStateSave()")
    expect(resultValidation).toContain(
      'hasOwnProperty.call(value, "operationReceipt")',
    )
    expect(resultValidation).toContain(
      'hasOwnProperty.call(value, "projection")',
    )
    expect(resultValidation).not.toContain(".revision")
    expect(generate).not.toContain(".revision")

    const queueStart = app.indexOf("function queueStateSave()")
    const queueEnd = app.indexOf("\nasync function flushStateSave", queueStart)
    expect(app.slice(queueStart, queueEnd)).toContain(
      "if (generationInFlight) return",
    )
    const flushStart = queueEnd
    const flushEnd = app.indexOf("\nasync function drainStateSave", flushStart)
    expect(app.slice(flushStart, flushEnd)).toContain(
      "(!allowDuringGeneration && generationInFlight)",
    )
  })

  test("ships Radix Select, Slider, and Tooltip as a self-contained local browser bundle", async () => {
    const workspace = await readJson(path.join(sourceRoot, "package.json"))
    expect(workspace.scripts).toMatchObject({
      build: "bun scripts/build.ts",
      typecheck: expect.stringContaining("tsc --noEmit"),
    })
    expect(workspace.devDependencies).toMatchObject({
      "radix-ui": "1.6.2",
      react: "19.2.4",
      "react-dom": "19.2.4",
    })

    const [html, source, bundle] = await Promise.all([
      fs.readFile(path.join(packageRoot, "index.html"), "utf8"),
      fs.readFile(path.join(sourceRoot, "src", "radix-controls.tsx"), "utf8"),
      fs.readFile(
        path.join(packageRoot, "assets", "radix-controls.js"),
        "utf8",
      ),
    ])
    expect(html.match(/data-radix-select/g)).toHaveLength(2)
    expect(html.match(/data-radix-slider/g)).toHaveLength(8)
    expect(source).toContain(
      'import { Select, Slider, Tooltip } from "radix-ui"',
    )
    expect(source).toContain("<Select.Root")
    expect(source).toContain("<Slider.Root")
    expect(source).toContain("<Tooltip.Root")
    expect(bundle.length).toBeGreaterThan(1_000)
    expect(bundle).not.toMatch(/https?:\/\//)
    expect(bundle).not.toMatch(/from\s*["'](?:radix-ui|react|react-dom)/)
  })

  test("keeps the install package inert and documents real host generation", async () => {
    const files = await collectFiles(packageRoot, "plugin/relight-studio")
    const names = files.map((file) => file.relativePath)

    expect(names).toEqual(
      expect.arrayContaining([
        "LICENSE",
        "assets/radix-controls.js",
        "index.html",
        "manifest.json",
      ]),
    )
    expect(names).not.toContain("SKILL.md")
    expect(() =>
      assertPluginStatic(files, "plugin/relight-studio"),
    ).not.toThrow()

    const packages = await discoverPackages({
      kind: "plugin",
      id: "relight-studio",
    })
    const skillMetadata = packages.find((pkg) => pkg.kind === "skill").metadata
    expect(skillMetadata).toMatchObject({
      schema: "convax.package/2",
      kind: "skill",
      id: "relight-studio",
      ownerPluginId: "relight-studio",
      version: "0.2.0",
      publication: { status: "ready", blockers: [] },
    })
    const skill = await fs.readFile(
      path.join(skillRoot, "package", "SKILL.md"),
      "utf8",
    )
    expect(skill).toContain("references/convax-capabilities.md")
    expect(skill).toMatch(/generated Convax\s+capability reference/u)
    expect(skill).toContain("live availability/error state")
    expect(skill).toContain("Skill or")
    expect(skill).not.toContain("generation.tools.list")
    expect(skill).not.toContain("generation.execute")
  })
})
