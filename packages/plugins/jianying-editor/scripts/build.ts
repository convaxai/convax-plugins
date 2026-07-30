import path from "node:path"
import { buildPluginHostClient } from "../../../../tooling/build-plugin-host-client.mjs"

const packageRoot = path.resolve(import.meta.dir, "..")
await buildPluginHostClient({
  check: process.argv.includes("--check"),
  packageRoot,
})
