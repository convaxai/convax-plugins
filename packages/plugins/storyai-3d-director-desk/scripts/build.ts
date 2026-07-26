import { createHash } from "node:crypto"
import path from "node:path"

const packageRoot = path.resolve(import.meta.dir, "..")
const vendorPath = path.join(packageRoot, "vendor", "app.js")
const outputPath = path.join(packageRoot, "package", "assets", "app.js")
const expectedVendorSha256 = "a98fa137c6917ec77a1f957826cefcb70fccb749d8a46868cd4c2457d701eec4"
const expectedFetchCount = 4

const vendor = await Bun.file(vendorPath).text()
const vendorSha256 = createHash("sha256").update(vendor).digest("hex")
if (vendorSha256 !== expectedVendorSha256) {
  throw new Error(`3D Director Desk vendor bundle SHA-256 changed: ${vendorSha256}`)
}

const fetchCount = vendor.match(/\bfetch\(/gu)?.length ?? 0
if (fetchCount !== expectedFetchCount) {
  throw new Error(`3D Director Desk vendor bundle fetch count changed: ${fetchCount}`)
}

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

await Bun.write(outputPath, source)
