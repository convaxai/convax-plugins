import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const designatedIdentifier = "io.convax.nexus-service"
const requestedTarget = process.argv[2]
const target = requestedTarget ? path.resolve(requestedTarget) : undefined

if (!target || !fs.statSync(target).isFile()) {
  throw new Error("A regular Darwin companion path is required")
}

run([
  "--force",
  "--sign",
  "-",
  "--identifier",
  designatedIdentifier,
  "--requirements",
  `=designated => identifier "${designatedIdentifier}"`,
  target,
])
run(["--verify", "--strict", target])

const inspection = run(["--display", "--requirements", "-", "--verbose=2", target])
const details = `${inspection.stdout}${inspection.stderr}`
if (
  !details.includes(`Identifier=${designatedIdentifier}`) ||
  !details.includes(`designated => identifier "${designatedIdentifier}"`)
) {
  throw new Error("Darwin companion does not carry the stable Nexus code identity")
}

function run(args) {
  const result = spawnSync("/usr/bin/codesign", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "codesign failed")
  }
  return result
}
