import path from "node:path"
import { parsePluginManifestV8 } from "@convax/plugin-sdk"

export const pluginSdkClientBundleMarker =
  "@convax/plugin-sdk/client:createPluginHostClient"
export const petSdkClientBundleMarker =
  "@convax/plugin-sdk/pet-client:connectPetHost"

export function createPluginClientManifestProjection(manifest) {
  const renderer = manifest?.contributes?.canvas?.renderer
  if (
    manifest?.schema !== "convax.plugin/8" ||
    typeof manifest.id !== "string" ||
    typeof manifest.entry !== "string" ||
    !renderer ||
    typeof renderer !== "object" ||
    Array.isArray(renderer)
  ) {
    throw new TypeError(
      "Plugin SDK client build requires a convax.plugin/8 Web manifest",
    )
  }
  const capabilityImports = manifest.contributes?.capabilities?.imports
  return {
    schema: manifest.schema,
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    entry: manifest.entry,
    capabilities: [],
    contributes: {
      canvas: { renderer },
      ...(capabilityImports === undefined
        ? {}
        : {
            capabilities: {
              exports: [],
              imports: capabilityImports,
            },
          }),
    },
    hostApi: manifest.hostApi,
  }
}

export async function buildPluginHostClient({
  check = false,
  packageRoot,
}) {
  if (typeof packageRoot !== "string" || !path.isAbsolute(packageRoot)) {
    throw new TypeError("Plugin packageRoot must be an absolute path")
  }
  const entrypoint = path.join(packageRoot, "src", "plugin-host-client.js")
  const outputPath = path.join(
    packageRoot,
    "package",
    "assets",
    "plugin-host-client.js",
  )
  const manifestPath = path.join(packageRoot, "package", "manifest.json")
  const manifest = JSON.parse(await Bun.file(manifestPath).text())
  const clientManifest = createPluginClientManifestProjection(manifest)
  if (!/^__[A-Z0-9_]+__$/u.test(clientManifest.id)) {
    parsePluginManifestV8(clientManifest)
  }
  const result = await Bun.build({
    entrypoints: [entrypoint],
    format: "esm",
    minify: true,
    plugins: [
      {
        name: "convax-plugin-client-manifest-projection",
        setup(build) {
          build.onLoad({ filter: /manifest\.json$/u }, (args) => {
            if (path.resolve(args.path) !== manifestPath) return undefined
            return {
              contents: `export default ${JSON.stringify(clientManifest)};`,
              loader: "js",
            }
          })
        },
      },
    ],
    target: "browser",
  })
  if (!result.success || result.outputs.length !== 1) {
    result.logs.forEach((message) => console.error(message))
    throw new Error("Plugin SDK client bundle failed")
  }
  const source = await result.outputs[0].text()
  if (
    !source.includes(pluginSdkClientBundleMarker) ||
    !source.includes("convax.plugin-host/8") ||
    !source.includes("createPluginHostClient")
  ) {
    throw new Error("Plugin SDK client bundle is missing its provenance marker")
  }
  if (
    source.includes("../convax/") ||
    source.includes("/Users/") ||
    /(?:^|\n)\/\/[^\n]*node_modules\//u.test(source) ||
    /https?:\/\//u.test(source)
  ) {
    throw new Error(
      "Plugin SDK client bundle leaked resolver-dependent source provenance",
    )
  }
  if (check) {
    if (
      !(await Bun.file(outputPath).exists()) ||
      (await Bun.file(outputPath).text()) !== source
    ) {
      throw new Error("Plugin SDK client bundle is stale")
    }
    return outputPath
  }
  await Bun.write(outputPath, source)
  return outputPath
}

export async function buildPetSurfaceAssets({ check = false, packageRoot }) {
  if (typeof packageRoot !== "string" || !path.isAbsolute(packageRoot)) {
    throw new TypeError("Pet Plugin packageRoot must be an absolute path")
  }
  const entrypoint = path.join(packageRoot, "src", "pet-host-client.js")
  const clientOutputPath = path.join(packageRoot, "package", "assets", "pet-host-client.js")
  const themeOutputPath = path.join(packageRoot, "package", "assets", "plugin-theme.css")
  const result = await Bun.build({
    entrypoints: [entrypoint],
    format: "esm",
    minify: true,
    target: "browser",
  })
  if (!result.success || result.outputs.length !== 1) {
    result.logs.forEach((message) => console.error(message))
    throw new Error("Pet SDK client bundle failed")
  }
  const clientSource = await result.outputs[0].text()
  if (
    !clientSource.includes(petSdkClientBundleMarker) ||
    !clientSource.includes("convax.pet-host/1") ||
    !clientSource.includes("connectPetHost")
  ) {
    throw new Error("Pet SDK client bundle is missing its provenance marker")
  }
  if (
    clientSource.includes('pluginId:"convax-pet"') ||
    clientSource.includes("../convax/") ||
    clientSource.includes("/Users/") ||
    /https?:\/\//u.test(clientSource)
  ) {
    throw new Error("Pet SDK client bundle leaked Plugin identity or build provenance")
  }

  const themePath = Bun.resolveSync("@convax/plugin-ui/theme.css", packageRoot)
  const themeSource = await Bun.file(themePath).text()
  if (
    !themeSource.includes("--ui-surface-canvas:") ||
    !themeSource.includes("@media (prefers-color-scheme: dark)") ||
    themeSource.includes("@import") ||
    /https?:\/\/|url\(/u.test(themeSource)
  ) {
    throw new Error("Plugin UI theme candidate is not standalone browser-safe CSS")
  }

  for (const [outputPath, source, label] of [
    [clientOutputPath, clientSource, "Pet SDK client bundle"],
    [themeOutputPath, themeSource, "Plugin UI theme"],
  ]) {
    if (check) {
      if (!(await Bun.file(outputPath).exists()) || (await Bun.file(outputPath).text()) !== source) {
        throw new Error(`${label} is stale`)
      }
    } else {
      await Bun.write(outputPath, source)
    }
  }
  return { clientOutputPath, themeOutputPath }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const packageRootIndex = args.indexOf("--package-root")
  const packageRoot =
    packageRootIndex >= 0 ? args[packageRootIndex + 1] : undefined
  if (!packageRoot || packageRoot.startsWith("--")) {
    throw new Error("--package-root <absolute-path> is required")
  }
  await buildPluginHostClient({
    check: args.includes("--check"),
    packageRoot: path.resolve(packageRoot),
  })
}
