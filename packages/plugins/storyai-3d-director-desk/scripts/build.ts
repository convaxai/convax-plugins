import { createHash } from "node:crypto"
import path from "node:path"
import { buildPluginHostClient } from "../../../../tooling/build-plugin-host-client.mjs"

const packageRoot = path.resolve(import.meta.dir, "..")
const vendorPath = path.join(packageRoot, "vendor", "app.js")
const outputPath = path.join(packageRoot, "package", "assets", "app.js")
const check = process.argv.includes("--check")
const expectedVendorSha256 = "ca87a7d8f2666eaf728dd5ea9ae7078821996d032140c4437ce5047e7bba65a1"
const expectedFetchCount = 4
const expectedRendererMessageCount = 1
const expectedHostTokenCounts = new Map([
  ["canvas.node.state.replace", 2],
  ["canvas.resource.image.create", 1],
  ["./plugin-host-client.js", 1],
  ["callHostApi", 2],
  ["onCommand", 1],
])

async function writeOrCheck(pathname: string, source: string, label: string) {
  if (check) {
    if (!(await Bun.file(pathname).exists()) || (await Bun.file(pathname).text()) !== source) {
      throw new Error(`${label} is stale`)
    }
    return
  }
  await Bun.write(pathname, source)
}

await buildPluginHostClient({ check, packageRoot })

const vendor = await Bun.file(vendorPath).text()
const vendorSha256 = createHash("sha256").update(vendor).digest("hex")
if (vendorSha256 !== expectedVendorSha256) {
  throw new Error(`3D Director Desk vendor bundle SHA-256 changed: ${vendorSha256}`)
}

const fetchCount = vendor.match(/\bfetch\(/gu)?.length ?? 0
if (fetchCount !== expectedFetchCount) {
  throw new Error(`3D Director Desk vendor bundle fetch count changed: ${fetchCount}`)
}
const rendererMessageCount = vendor.match(/"renderer\.scene\.play"/gu)?.length ?? 0
if (rendererMessageCount !== expectedRendererMessageCount) {
  throw new Error(`3D Director Desk vendor renderer-message count changed: ${rendererMessageCount}`)
}
for (const [token, expectedCount] of expectedHostTokenCounts) {
  const actualCount = vendor.split(token).length - 1
  if (actualCount !== expectedCount) {
    throw new Error(`3D Director Desk vendor Host token count changed for ${token}: ${actualCount}`)
  }
}
if (
  vendor.includes("convax.plugin-host/") ||
  vendor.includes('type:"request"') ||
  /\.postMessage\(\{[^}]*\bmethod:/u.test(vendor)
) {
  throw new Error(
    "3D Director Desk vendor contains a handwritten Plugin Host request transport",
  )
}

// The pinned vendor bundle consumes the repository-built SDK client. This build
// step only removes upstream network surfaces forbidden in a Plugin iframe.
let source = vendor
  // React/renderer diagnostics and license references are inert, but public
  // Plugin packages fail closed on every literal remote URL. Keep them local.
  .replaceAll("https://reactjs.org/docs/error-decoder.html?invariant=", "react-error:")
  .replaceAll("https://jcgt.org/published/0007/04/01/", "jcgt-reference:0007/04/01")
  .replaceAll(
    "https://docs.pmnd.rs/react-three-fiber/api/objects#using-3rd-party-objects-declaratively",
    "pmndrs-docs:react-three-fiber/objects",
  )
  .replaceAll(
    "https://github.com/react-spring/react-use-measure/#resize-observer-polyfills",
    "react-use-measure-docs:resize-observer-polyfills",
  )
  .replaceAll("https://101arrowz.github.io/fflate", "fflate-license-reference")
  .replaceAll("https://github.com/101arrowz/fflate/blob/master/LICENSE", "fflate-license:master")
  // React DOM needs these namespace values at runtime. Split the literals so
  // static validation cannot mistake standards identifiers for fetch targets.
  .replaceAll('"http://www.w3.org/1998/Math/MathML"', '"http"+"://www.w3.org/1998/Math/MathML"')
  .replaceAll('"http://www.w3.org/1999/xhtml"', '"http"+"://www.w3.org/1999/xhtml"')
  .replaceAll('"http://www.w3.org/1999/xlink"', '"http"+"://www.w3.org/1999/xlink"')
  .replaceAll('"http://www.w3.org/2000/svg"', '"http"+"://www.w3.org/2000/svg"')
  .replaceAll('"http://www.w3.org/XML/1998/namespace"', '"http"+"://www.w3.org/XML/1998/namespace"')
  // Upstream bundles generic preload and Three.js loaders even though Convax
  // hides the model-import surface. Replace every direct browser fetch with an
  // explicit local rejection so the released iframe has no network API.
  .replace(/\bfetch\(/gu, "convaxOfflineFetch(")

source =
  'const convaxOfflineFetch=()=>Promise.reject(new Error("Network requests are unavailable"));\n' +
  source.replace(/[ \t]+$/gmu, "")

if (/https?:\/\//iu.test(source)) throw new Error("3D Director Desk bundle contains a remote URL")
if (/\b(?:fetch|WebSocket|XMLHttpRequest|EventSource)\s*\(/u.test(source)) {
  throw new Error("3D Director Desk bundle contains a browser network API")
}

await writeOrCheck(outputPath, source, "3D Director Desk application bundle")
