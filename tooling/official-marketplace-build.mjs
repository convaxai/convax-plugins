import { spawnSync } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  buildMarketplace,
  discoverMarketplacePackages,
} from "@convax/marketplace-kit"
import {
  createMarketplacePublicationView,
  disposeMarketplacePublicationView,
} from "./marketplace-publication-view.mjs"
import { marketplacePreflight } from "./marketplace-preflight.mjs"
import { effectivePublicationOmissions } from "./publication-eligibility.mjs"

export function officialBuildArgs({
  changed,
  initialSequence,
  previous,
  previousDescriptor,
  previousShowcase,
}) {
  const previousInputs = [previous, previousDescriptor, previousShowcase]
  const hasPrevious = previousInputs.some(Boolean)
  if (hasPrevious && !previousInputs.every(Boolean)) {
    throw new Error("Official build requires a complete previous v2 closure")
  }
  if (changed && !hasPrevious) {
    throw new Error("Selective Official build requires a complete previous v2 closure")
  }
  if (hasPrevious && !changed) {
    throw new Error(
      "Non-initial Official build requires an exact ready-only change selection",
    )
  }
  if (
    initialSequence !== undefined &&
    (!Number.isSafeInteger(initialSequence) || initialSequence <= 0)
  ) {
    throw new Error("Initial Official sequence must be a positive safe integer")
  }
  if (hasPrevious && initialSequence !== undefined) {
    throw new Error("Selective Official build cannot set an initial sequence")
  }
  const args = [
    "build-index",
    ".",
    "--out",
    "dist/catalog",
    "--official",
  ]
  if (changed) args.push("--changed", changed)
  if (hasPrevious) {
    return [
      ...args,
      "--previous-descriptor",
      previousDescriptor,
      "--previous",
      previous,
      "--previous-showcase",
      previousShowcase,
    ]
  }
  return [
    ...args,
    "--initial",
    ...(initialSequence === undefined
      ? []
      : ["--sequence", String(initialSequence)]),
  ]
}

export function officialBuildInvocation(args) {
  return {
    args: [fileURLToPath(import.meta.resolve("@convax/marketplace-kit/cli")), ...args],
    command: process.execPath,
  }
}

export async function runOfficialBuild({
  build = buildMarketplace,
  createView = createMarketplacePublicationView,
  discover = discoverMarketplacePackages,
  disposeView = disposeMarketplacePublicationView,
  environment = process.env,
  preflight = marketplacePreflight,
  spawn = spawnSync,
} = {}) {
  const workspaceRoot = fileURLToPath(new URL("..", import.meta.url))
  const catalogPath = environment.CONVAX_PLUGIN_API_CATALOG
  if (!catalogPath) {
    throw new Error("Official Marketplace build requires CONVAX_PLUGIN_API_CATALOG")
  }
  const admission = await preflight({
    catalogPath,
    workspaceRoot,
  })
  const omissions = {
    schema: "convax.marketplace-build-omissions/1",
    omitted: effectivePublicationOmissions(admission.packages),
  }
  const omissionsPath = path.join(
    workspaceRoot,
    "dist",
    "marketplace-build-omissions.json",
  )
  await fs.mkdir(path.dirname(omissionsPath), { recursive: true })
  await fs.writeFile(
    omissionsPath,
    `${JSON.stringify(omissions, null, 2)}\n`,
  )
  const hasPrevious = Boolean(
    environment.CONVAX_MARKETPLACE_PREVIOUS &&
    environment.CONVAX_MARKETPLACE_PREVIOUS_DESCRIPTOR &&
    environment.CONVAX_MARKETPLACE_PREVIOUS_SHOWCASE,
  )
  const initialSequence = environment.CONVAX_MARKETPLACE_INITIAL_SEQUENCE === undefined
    ? undefined
    : Number(environment.CONVAX_MARKETPLACE_INITIAL_SEQUENCE)
  if (
    initialSequence !== undefined &&
    (!Number.isSafeInteger(initialSequence) || initialSequence <= 0)
  ) {
    throw new Error(
      "CONVAX_MARKETPLACE_INITIAL_SEQUENCE must be a positive safe integer",
    )
  }
  if (!hasPrevious && omissions.omitted.length > 0) {
    const candidates = await discover(workspaceRoot)
    const view = await createView({
      candidates,
      packages: admission.packages,
      workspaceRoot,
    })
    try {
      await build({
        initialOfficial: true,
        official: true,
        outDir: path.join(workspaceRoot, "dist", "catalog"),
        root: view.root,
        ...(initialSequence === undefined ? {} : { sequence: initialSequence }),
      })
      return
    } finally {
      await disposeView(view)
    }
  }
  const args = officialBuildArgs({
    changed: environment.CONVAX_MARKETPLACE_CHANGED,
    initialSequence,
    previous: environment.CONVAX_MARKETPLACE_PREVIOUS,
    previousDescriptor: environment.CONVAX_MARKETPLACE_PREVIOUS_DESCRIPTOR,
    previousShowcase: environment.CONVAX_MARKETPLACE_PREVIOUS_SHOWCASE,
  })
  const invocation = officialBuildInvocation(args)
  const result = spawn(invocation.command, invocation.args, {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    env: environment,
    stdio: "inherit",
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`convax-marketplace exited with status ${String(result.status)}`)
  }
}

if (import.meta.main) {
  try {
    await runOfficialBuild()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
