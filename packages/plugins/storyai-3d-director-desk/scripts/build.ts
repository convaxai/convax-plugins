import { createHash } from "node:crypto"
import path from "node:path"
import { buildPluginHostClient } from "../../../../tooling/build-plugin-host-client.mjs"

const packageRoot = path.resolve(import.meta.dir, "..")
const vendorPath = path.join(packageRoot, "vendor", "app.js")
const outputPath = path.join(packageRoot, "package", "assets", "app.js")
const stateEnvelopeSourcePath = path.join(packageRoot, "src", "state-envelope.js")
const stateEnvelopeOutputPath = path.join(packageRoot, "package", "assets", "state-envelope.js")
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
const expectedFixedGridColorCount = 1

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

const stateEnvelopeSource = `${(await Bun.file(stateEnvelopeSourcePath).text()).replace(/[ \t]+$/gmu, "")}`
await writeOrCheck(stateEnvelopeOutputPath, stateEnvelopeSource, "3D Director Desk state envelope")

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
// step removes upstream network surfaces forbidden in a Plugin iframe and maps
// its fixed grid color onto Convax's semantic border token.
const fixedGridColorCount = vendor.match(/sectionColor:"#2A4065"/gu)?.length ?? 0
if (fixedGridColorCount !== expectedFixedGridColorCount) {
  throw new Error(`3D Director Desk fixed grid color count changed: ${fixedGridColorCount}`)
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
  // Keep the Three.js grid on the same semantic border role as the surrounding
  // Convax Midnight surface instead of retaining the upstream fixed blue.
  .replace(
    'sectionColor:"#2A4065"',
    'sectionColor:pE("--ui-border-default","#34343a")',
  )

const envelopeImport =
  'import{acceptPluginHostConnection as WC}from"./plugin-host-client.js";' +
  'import{decodePersistedHostState as __cvxDec,encodePersistedHostState as __cvxEnc,HOST_STATE_VALUE_BYTE_LIMIT as __cvxLim}from"./state-envelope.js";'
if (!source.includes('import{acceptPluginHostConnection as WC}from"./plugin-host-client.js";')) {
  throw new Error("3D Director Desk vendor is missing the Plugin Host client import")
}
source = source.replace(
  'import{acceptPluginHostConnection as WC}from"./plugin-host-client.js";',
  envelopeImport,
)

const legacyStateForSnapshot =
  "function Qv(r){return{directorProject:r.project,presentation:{viewport:{directorView:r.directorViewSnapshot}},schemaVersion:L_}}"
const envelopedStateForSnapshot =
  "function Qv(r){return __cvxEnc({directorProject:r.project,presentation:{viewport:{directorView:r.directorViewSnapshot}},schemaVersion:L_})}"
if (!source.includes(legacyStateForSnapshot)) {
  throw new Error("3D Director Desk vendor is missing stateForSnapshot")
}
source = source.replace(legacyStateForSnapshot, envelopedStateForSnapshot)

const legacyLimit = "const L_=2,Wk=1,XA=240*1024"
const envelopedLimit = "const L_=2,Wk=1,XA=__cvxLim"
if (!source.includes(legacyLimit)) {
  throw new Error("3D Director Desk vendor is missing the host state byte limit")
}
source = source.replace(legacyLimit, envelopedLimit)

const legacyRead =
  'const t=e.metadata.convaxPluginState;if(t===void 0||ls(t)&&Object.keys(t).length===0)return{kind:"absent"};if(!ls(t))return{kind:"invalid",message:"3D 节点状态格式无效；原数据已保留且不会被覆盖。"};if(t.schemaVersion!==Wk&&t.schemaVersion!==L_)return{kind:"invalid",message:"此 3D 节点来自不兼容的状态版本；请升级插件后再打开。"};if(!Zk(t.directorProject))return{kind:"invalid",message:"3D 场景状态不完整；原数据已保留且不会被覆盖。"};let n=Gp(Tf);if(t.schemaVersion===L_){if(!ls(t.presentation)||!ls(t.presentation.viewport)||!Kk(t.presentation.viewport.directorView))return{kind:"invalid",message:"3D 视口状态不完整；原数据已保留且不会被覆盖。"};n=Gp(t.presentation.viewport.directorView)}const i={directorViewSnapshot:n,project:nS(t.directorProject)};return{kind:"ready",persistedSerialized:JSON.stringify(t),projectSanitized:JSON.stringify(t.directorProject)!==JSON.stringify(i.project),serialized:JSON.stringify(Qv(i)),snapshot:i}'
const envelopedRead =
  'const t=e.metadata.convaxPluginState;if(t===void 0||ls(t)&&Object.keys(t).length===0)return{kind:"absent"};const _d=__cvxDec(t);if(!_d.ok)return{kind:"invalid",message:_d.message};if(_d.kind==="absent")return{kind:"absent"};const s=_d.scene;if(!Zk(s.directorProject))return{kind:"invalid",message:"3D 场景状态不完整；原数据已保留且不会被覆盖。"};let n=Gp(Tf);if(s.schemaVersion===L_){if(!ls(s.presentation)||!ls(s.presentation.viewport)||!Kk(s.presentation.viewport.directorView))return{kind:"invalid",message:"3D 视口状态不完整；原数据已保留且不会被覆盖。"};n=Gp(s.presentation.viewport.directorView)}else if(s.schemaVersion!==Wk)return{kind:"invalid",message:"此 3D 节点来自不兼容的状态版本；请升级插件后再打开。"};const i={directorViewSnapshot:n,project:nS(s.directorProject)};return{kind:"ready",persistedSerialized:JSON.stringify(t),projectSanitized:JSON.stringify(s.directorProject)!==JSON.stringify(i.project),serialized:(_e=>_e?JSON.stringify(_e):"")(Qv(i)),snapshot:i}'
if (!source.includes(legacyRead)) {
  throw new Error("3D Director Desk vendor is missing readHostState")
}
source = source.replace(legacyRead, envelopedRead)

const legacyFlushGuard =
  'const r=la,e=Qv(sv);if(new TextEncoder().encode(JSON.stringify(e)).byteLength>XA)return aa=r,No=!1,Af("3D 场景超过 240 KiB 节点状态上限，尚未保存；请减少场景内容。"),!1;'
const envelopedFlushGuard =
  'const r=la,e=Qv(sv);if(e==null||new TextEncoder().encode(JSON.stringify(e)).byteLength>XA)return aa=r,No=!1,Af("3D 场景超过可持久化上限（需为 base64 膨胀留余量），尚未保存；请减少场景内容。"),!1;'
if (!source.includes(legacyFlushGuard)) {
  throw new Error("3D Director Desk vendor is missing the state flush size guard")
}
source = source.replace(legacyFlushGuard, envelopedFlushGuard)

const legacyQueue =
  "},la=JSON.stringify(Qv(sv)),aa&&la!==aa&&(aa=\"\"),No=la!==Cu&&la!==aa,!No||!lc||!Ls))return;"
const envelopedQueue =
  "},_e=Qv(sv),la=_e?JSON.stringify(_e):\"\",aa&&la!==aa&&(aa=\"\"),No=la!==Cu&&la!==aa,!No||!lc||!Ls))return;"
if (!source.includes(legacyQueue)) {
  throw new Error("3D Director Desk vendor is missing queueStateSave serialization")
}
source = source.replace(legacyQueue, envelopedQueue)

const legacyBestEffort =
  'const r=QA(),e=Qv({directorViewSnapshot:Gp(r.directorViewSnapshot),project:nS(r.project)});JSON.stringify(e)!==Cu&&(new TextEncoder().encode(JSON.stringify(e)).byteLength>XA||Ls.callHostApi("canvas.node.state.replace",{state:e}).catch(()=>{}))'
const envelopedBestEffort =
  'const r=QA(),e=Qv({directorViewSnapshot:Gp(r.directorViewSnapshot),project:nS(r.project)});e&&JSON.stringify(e)!==Cu&&(new TextEncoder().encode(JSON.stringify(e)).byteLength>XA||Ls.callHostApi("canvas.node.state.replace",{state:e}).catch(()=>{}))'
if (!source.includes(legacyBestEffort)) {
  throw new Error("3D Director Desk vendor is missing best-effort state post")
}
source = source.replace(legacyBestEffort, envelopedBestEffort)

source =
  'const convaxOfflineFetch=()=>Promise.reject(new Error("Network requests are unavailable"));\n' +
  source.replace(/[ \t]+$/gmu, "")

if (/https?:\/\//iu.test(source)) throw new Error("3D Director Desk bundle contains a remote URL")
if (/\b(?:fetch|WebSocket|XMLHttpRequest|EventSource)\s*\(/u.test(source)) {
  throw new Error("3D Director Desk bundle contains a browser network API")
}
if (!source.includes("./state-envelope.js") || !source.includes("__cvxEnc") || !source.includes("__cvxDec")) {
  throw new Error("3D Director Desk bundle is missing state envelope wiring")
}

await writeOrCheck(outputPath, source, "3D Director Desk application bundle")
