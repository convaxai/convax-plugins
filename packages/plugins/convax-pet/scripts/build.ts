import path from "node:path"
import { buildPetSurfaceAssets } from "../../../../tooling/build-plugin-host-client.mjs"

await buildPetSurfaceAssets({
  check: process.argv.includes("--check"),
  packageRoot: path.resolve(import.meta.dir, ".."),
})
