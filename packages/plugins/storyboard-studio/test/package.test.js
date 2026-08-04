import { describe, expect, test } from "bun:test"
import { lstat, readFile, readdir } from "node:fs/promises"
import path from "node:path"

const workspaceRoot = path.resolve(import.meta.dir, "..")
const packageRoot = path.join(workspaceRoot, "package")

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"))
}

async function inventory(root, prefix = "") {
  const result = []
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) result.push(...await inventory(root, relativePath))
    else result.push(relativePath)
  }
  return result.sort()
}

describe("storyboard-studio package contract", () => {
  test("keeps package identity, host ABI and owned Skill declarations aligned", async () => {
    const [manifest, metadata, workspace] = await Promise.all([
      readJson(path.join(packageRoot, "manifest.json")),
      readJson(path.join(workspaceRoot, "convax-package.json")),
      readJson(path.join(workspaceRoot, "package.json")),
    ])

    expect(manifest).toMatchObject({
      schema: "convax.plugin/8",
      id: "storyboard-studio",
      version: "0.2.1",
      entry: "index.html",
      contributes: {
        canvas: {
          renderer: {
            create: true,
            width: 760,
            height: 560,
          },
        },
        skills: [{ name: "storyboard-studio", path: "skills/storyboard-studio" }],
      },
    })
    expect(manifest.capabilities).toEqual([
      "agent.prompt",
      "canvas.document.read",
      "canvas.connectedInputs.read",
      "canvas.node.read",
      "canvas.node.write",
      "project.files.read",
      "ui.fullscreen",
    ])
    expect(manifest.contributes.canvas.renderer.extensions).toEqual([
      ".storyboard.json",
      ".character.card.json",
    ])
    expect(manifest.contributes.canvas.renderer).not.toHaveProperty("nodeKinds")
    expect(manifest.contributes.canvas.commands).toEqual([
      {
        id: "storyboard.refresh",
        title: {
          default: "Refresh storyboard",
          "zh-CN": "刷新故事板",
        },
        icon: "refresh",
        target: {
          type: "renderer-message",
          message: "renderer.storyboard.refresh",
        },
      },
    ])
    expect(manifest.contributes.canvas.toolbar).toEqual([
      {
        id: "storyboard-refresh-toolbar",
        command: "storyboard.refresh",
        order: 10,
      },
    ])
    expect(manifest.hostApi.required).toEqual([
      "agent.prompt",
      "canvas.document.get",
      "canvas.inputs.list",
      "canvas.node.get",
      "canvas.node.state.replace",
      "host.context.get",
      "project.file.text.read",
    ])

    expect(metadata).toMatchObject({
      schema: "convax.package/2",
      kind: "plugin",
      id: manifest.id,
      version: manifest.version,
      yanked: false,
    })
    expect(workspace).toMatchObject({
      name: "@microvoid/convax-plugin-storyboard-studio",
      version: manifest.version,
      private: true,
      type: "module",
      dependencies: {
        "@microvoid/convax-skill-storyboard-studio": "workspace:*",
      },
    })

    expect(manifest).not.toHaveProperty("runtime")
    expect(manifest).not.toHaveProperty("hooks")
    expect(manifest).not.toHaveProperty("network")
    expect(manifest.contributes).not.toHaveProperty("sidebar")
  })

  test("ships an explicit, self-contained offline inventory with only local entry references", async () => {
    const files = await inventory(packageRoot)
    expect(files).toEqual([
      "LICENSE",
      "README.md",
      "assets/app.js",
      "assets/demo-characters.jpg",
      "assets/demo-shots.jpg",
      "assets/host.js",
      "assets/model.js",
      "assets/plugin-host-client.js",
      "assets/styles.css",
      "index.html",
      "manifest.json",
    ])

    for (const relativePath of files) {
      expect((await lstat(path.join(packageRoot, relativePath))).isSymbolicLink()).toBeFalse()
    }
    expect(files.some((file) => file.includes("node_modules"))).toBeFalse()
    expect(files.some((file) => /(?:^|\/)(?:bun\.lock|package-lock\.json|yarn\.lock)$/u.test(file))).toBeFalse()
    expect(files.some((file) => /\.(?:node|wasm|dylib|so|dll|exe)$/u.test(file))).toBeFalse()

    const html = await readFile(path.join(packageRoot, "index.html"), "utf8")
    const references = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gu)].map((match) => match[1])
    expect(references).toEqual(["assets/styles.css", "assets/app.js"])
    for (const reference of references) {
      expect(reference).not.toMatch(/^(?:[a-z]+:|\/\/|\/)/iu)
      expect((await lstat(path.join(packageRoot, reference))).isFile()).toBeTrue()
    }

    const executableText = await Promise.all(
      files
        .filter((file) => /\.(?:html|css|js)$/u.test(file))
        .map((file) => readFile(path.join(packageRoot, file), "utf8")),
    )
    const joined = executableText.join("\n")
    expect(joined).not.toMatch(/https?:\/\//iu)
    expect(joined).not.toMatch(/\bfetch\s*\(/u)
    expect(joined).not.toMatch(/\b(?:XMLHttpRequest|WebSocket|EventSource)\b/u)
    expect(joined).not.toMatch(/\bnavigator\.sendBeacon\b/u)
    expect(joined).not.toMatch(/\bwindow\.open\s*\(/u)
    expect(joined).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB)\b/u)

    const application = await readFile(path.join(packageRoot, "assets/app.js"), "utf8")
    const hostAdapter = await readFile(path.join(packageRoot, "assets/host.js"), "utf8")
    const sdkClient = await readFile(
      path.join(packageRoot, "assets/plugin-host-client.js"),
      "utf8",
    )
    expect(application).toContain('host.request("canvas.inputs.list")')
    expect(application).toContain('.request("canvas.node.state.replace"')
    expect(application).toContain('host.request("project.file.text.read"')
    expect(application).not.toMatch(
      /canvas\.connectedInputs\.list|canvas\.node\.updateState|project\.file\.readText/,
    )
    expect(hostAdapter).toContain(
      'import { acceptPluginHostConnection } from "./plugin-host-client.js"',
    )
    expect(hostAdapter).not.toContain("postMessage")
    expect(hostAdapter).not.toContain("new Map")
    expect(sdkClient).toContain("@convax/plugin-sdk/client:createPluginHostClient")
    expect(sdkClient).toContain("convax.plugin-host/8")
  })
})
