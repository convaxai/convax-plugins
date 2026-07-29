import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function officialBuildArgs({
  bootstrapPreviousV1,
  changed,
  previous,
  previousDescriptor,
  previousShowcase,
  previousShowcaseV1,
  previousV1,
  v1Revision,
}) {
  if (bootstrapPreviousV1 && previous) {
    throw new Error("Official build accepts exactly one previous Registry mode")
  }
  if (previous && (!previousDescriptor || !previousShowcase || !previousShowcaseV1 || !previousV1)) {
    throw new Error("Official build requires a complete previous v2 closure")
  }
  if (bootstrapPreviousV1 && (!previousDescriptor || !previousShowcaseV1)) {
    throw new Error("Official build requires a complete previous v1 closure")
  }
  if (typeof v1Revision !== "string" || !/^[a-f0-9]{40}$/.test(v1Revision)) {
    throw new Error("Official v1 revision must be an exact Git SHA")
  }
  const args = [
    "build-index",
    ".",
    "--out",
    "dist/catalog",
    "--official",
  ]
  if (changed) args.push("--changed", changed)
  if (previous) {
    return [
      ...args,
      "--previous-descriptor",
      previousDescriptor,
      "--previous",
      previous,
      "--previous-showcase",
      previousShowcase,
      "--previous-v1",
      previousV1,
      "--previous-showcase-v1",
      previousShowcaseV1,
      "--v1-revision",
      v1Revision,
    ]
  }
  if (bootstrapPreviousV1) {
    return [
      ...args,
      "--previous-descriptor",
      previousDescriptor,
      "--bootstrap-previous-v1",
      bootstrapPreviousV1,
      "--previous-showcase-v1",
      previousShowcaseV1,
      "--v1-revision",
      v1Revision,
    ]
  }
  return [...args, "--initial", "--v1-revision", v1Revision]
}

export function officialBuildInvocation(args) {
  return {
    args: [fileURLToPath(import.meta.resolve("@convax/marketplace-kit/cli")), ...args],
    command: process.execPath,
  }
}

function main() {
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
  const v1Revision = process.env.GITHUB_SHA ?? spawnSync(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: root, encoding: "utf8" },
  ).stdout?.trim()
  const args = officialBuildArgs({
    bootstrapPreviousV1: process.env.CONVAX_MARKETPLACE_BOOTSTRAP_PREVIOUS_V1,
    changed: process.env.CONVAX_MARKETPLACE_CHANGED,
    previous: process.env.CONVAX_MARKETPLACE_PREVIOUS,
    previousDescriptor: process.env.CONVAX_MARKETPLACE_PREVIOUS_DESCRIPTOR,
    previousShowcase: process.env.CONVAX_MARKETPLACE_PREVIOUS_SHOWCASE,
    previousShowcaseV1: process.env.CONVAX_MARKETPLACE_PREVIOUS_SHOWCASE_V1,
    previousV1: process.env.CONVAX_MARKETPLACE_PREVIOUS_V1,
    v1Revision,
  })
  const invocation = officialBuildInvocation(args)
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    stdio: "inherit",
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`convax-marketplace exited with status ${String(result.status)}`)
  }
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
