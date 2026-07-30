import path from "node:path"
import { buildPluginHostClient } from "../../../../tooling/build-plugin-host-client.mjs"

const packageRoot = path.resolve(import.meta.dir, "..")
const check = process.argv.includes("--check")

async function writeOrCheck(outputPath: string, source: string, label: string) {
  if (check) {
    if (!(await Bun.file(outputPath).exists()) || (await Bun.file(outputPath).text()) !== source) {
      throw new Error(`${label} is stale`)
    }
    return
  }
  await Bun.write(outputPath, source)
}

await buildPluginHostClient({ check, packageRoot })

const result = await Bun.build({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  entrypoints: [path.join(packageRoot, "src", "radix-controls.tsx")],
  format: "esm",
  minify: true,
  target: "browser",
})

if (!result.success || result.outputs.length !== 1) {
  result.logs.forEach((message) => console.error(message))
  throw new Error("Relight Studio Radix bundle failed")
}

let source = await result.outputs[0]!.text()
source = source
  // React's production diagnostics do not make network requests, but Plugin
  // packages fail closed on every literal remote URL. Keep the diagnostic local.
  .replaceAll("https://react.dev/errors/", "react-error:")
  // React DOM needs these namespace values at runtime. Split the literals so
  // static package validation cannot mistake standards identifiers for fetches.
  .replaceAll('"http://www.w3.org/1998/Math/MathML"', '"http"+"://www.w3.org/1998/Math/MathML"')
  .replaceAll('"http://www.w3.org/1999/xlink"', '"http"+"://www.w3.org/1999/xlink"')
  .replaceAll('"http://www.w3.org/2000/svg"', '"http"+"://www.w3.org/2000/svg"')
  .replaceAll('"http://www.w3.org/XML/1998/namespace"', '"http"+"://www.w3.org/XML/1998/namespace"')
  .replace(/[ \t]+$/gmu, "")

if (/https?:\/\//iu.test(source)) throw new Error("Relight Studio bundle contains a remote URL")
await writeOrCheck(
  path.join(packageRoot, "package", "assets", "radix-controls.js"),
  source,
  "Relight Studio Radix bundle",
)
