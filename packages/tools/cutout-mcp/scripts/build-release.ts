import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { gzipSync } from "node:zlib"

import { hostTarget, macosDeploymentTarget, targetFor } from "./cutout-targets.ts"
import { prepareAssets } from "./prepare-assets.ts"

const execute = promisify(execFile)
const toolRoot = path.join(import.meta.dir, "..")
const nativeRoot = path.join(toolRoot, "native")
const maximumExecutableBytes = 128 * 1024 * 1024

function selectedTarget(argv: readonly string[]) {
  if (argv.length === 1 && argv[0] === "--host") return { target: hostTarget(), host: true }
  if (argv.length === 2) return { target: targetFor(argv[0]!, argv[1]!), host: false }
  throw new Error("Usage: build-release.ts --host | darwin arm64")
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

async function resourceFiles(source: string, prefix: string, directory: string) {
  const bytes = await readFile(source)
  const compressed = gzipSync(bytes, { level: 9 })
  const dataPath = path.join(directory, `${prefix}.gz`)
  const hashPath = path.join(directory, `${prefix}.sha256`)
  const sizePath = path.join(directory, `${prefix}.size`)
  await Promise.all([
    writeFile(dataPath, compressed, { flag: "wx", mode: 0o600 }),
    writeFile(hashPath, sha256(bytes), { encoding: "ascii", flag: "wx", mode: 0o600 }),
    writeFile(sizePath, String(bytes.length), { encoding: "ascii", flag: "wx", mode: 0o600 }),
  ])
  return { dataPath, hashPath, sizePath }
}

const { host, target } = selectedTarget(process.argv.slice(2))
if (target.platform !== "darwin" || target.arch !== "arm64") {
  throw new Error("The native Cutout companion is reviewed only for darwin-arm64")
}
if (os.platform() !== "darwin" || os.arch() !== "arm64") {
  throw new Error("The darwin-arm64 Cutout companion must be built on native Apple Silicon")
}

const assets = await prepareAssets()
const outputDirectory = host
  ? path.join(toolRoot, "dist")
  : path.join(toolRoot, "dist", `${target.platform}-${target.arch}`)
await mkdir(outputDirectory, { recursive: true })
const outfile = path.join(outputDirectory, "convax-cutout-mcp")
const buildDirectory = await mkdtemp(path.join(os.tmpdir(), "convax-cutout-native-"))
const stagingDirectory = await mkdtemp(path.join(outputDirectory, ".convax-cutout-release-"))
const temporaryOutput = path.join(stagingDirectory, "convax-cutout-mcp")

try {
  const [
    { stdout: clangOutput },
    { stdout: clangCOutput },
    { stdout: swiftOutput },
    { stdout: sdkOutput },
  ] = await Promise.all([
    execute("/usr/bin/xcrun", ["--find", "clang++"], { encoding: "utf8" }),
    execute("/usr/bin/xcrun", ["--find", "clang"], { encoding: "utf8" }),
    execute("/usr/bin/xcrun", ["--find", "swiftc"], { encoding: "utf8" }),
    execute("/usr/bin/xcrun", ["--show-sdk-path"], { encoding: "utf8" }),
  ])
  const clang = clangOutput.trim()
  const clangC = clangCOutput.trim()
  const swiftc = swiftOutput.trim()
  const sdk = sdkOutput.trim()
  if (!clang || !clangC || !swiftc || !sdk) {
    throw new Error("Unable to locate the native Apple compiler toolchain")
  }

  const helper = path.join(buildDirectory, "convax-cutout-inference")
  await execute(clang, [
    "-arch", "arm64",
    `-mmacosx-version-min=${macosDeploymentTarget}`,
    "-isysroot", sdk,
    "-std=c++20",
    "-O3",
    "-fvisibility=hidden",
    "-I", assets.includeDirectory,
    path.join(nativeRoot, "CutoutInference.mm"),
    assets.onnxRuntimeDylibPath,
    "-Wl,-rpath,@executable_path",
    "-framework", "CoreFoundation",
    "-framework", "CoreGraphics",
    "-framework", "ImageIO",
    "-lc++",
    "-o", helper,
  ], { maxBuffer: 32 * 1024 * 1024 })

  const bridgeObject = path.join(buildDirectory, "EmbeddedSection.o")
  await execute(clangC, [
    "-arch", "arm64",
    `-mmacosx-version-min=${macosDeploymentTarget}`,
    "-isysroot", sdk,
    "-x", "c",
    "-I", nativeRoot,
    "-c", path.join(nativeRoot, "EmbeddedSection.c"),
    "-o", bridgeObject,
  ], { maxBuffer: 16 * 1024 * 1024 })

  const [helperResource, modelResource, runtimeResource] = await Promise.all([
    resourceFiles(helper, "helper", buildDirectory),
    resourceFiles(assets.modelPath, "model", buildDirectory),
    resourceFiles(assets.onnxRuntimeDylibPath, "ort", buildDirectory),
  ])

  const swiftSources = [
    "Models.swift",
    "SecurityPolicy.swift",
    "EmbeddedRuntime.swift",
    "CutoutExecutor.swift",
    "MCPServer.swift",
    "main.swift",
  ].map((name) => path.join(nativeRoot, name))

  const sections = [
    ["__helper", helperResource.dataPath],
    ["__helphash", helperResource.hashPath],
    ["__helpsize", helperResource.sizePath],
    ["__model", modelResource.dataPath],
    ["__modelhash", modelResource.hashPath],
    ["__modelsize", modelResource.sizePath],
    ["__ortlib", runtimeResource.dataPath],
    ["__orthash", runtimeResource.hashPath],
    ["__ortsize", runtimeResource.sizePath],
  ].flatMap(([name, file]) => ["-Xlinker", "-sectcreate", "-Xlinker", "__DATA", "-Xlinker", name!, "-Xlinker", file!])

  await rm(temporaryOutput, { force: true })
  await execute(swiftc, [
    "-target", `arm64-apple-macos${macosDeploymentTarget}`,
    "-sdk", sdk,
    "-O",
    "-whole-module-optimization",
    "-import-objc-header", path.join(nativeRoot, "Bridge.h"),
    ...swiftSources,
    bridgeObject,
    "-o", temporaryOutput,
    "-Xlinker", "-dead_strip",
    "-Xlinker", "-no_uuid",
    "-Xlinker", "-lz",
    ...sections,
  ], { maxBuffer: 64 * 1024 * 1024 })

  const built = await stat(temporaryOutput)
  if (!built.isFile() || built.size <= 0 || built.size >= maximumExecutableBytes) {
    throw new Error("Native Cutout companion exceeds the 128 MiB executable boundary")
  }
  const [{ stdout: fileOutput }, { stdout: loadCommands }] = await Promise.all([
    execute("/usr/bin/file", [temporaryOutput], { encoding: "utf8" }),
    execute("/usr/bin/otool", ["-l", temporaryOutput], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }),
  ])
  if (!fileOutput.includes("Mach-O 64-bit executable arm64")) {
    throw new Error("Native Cutout companion is not an arm64 Mach-O executable")
  }
  const buildVersion = loadCommands.match(/cmd LC_BUILD_VERSION[\s\S]*?\n\s*minos ([0-9.]+)/)
  if (buildVersion?.[1] !== macosDeploymentTarget) {
    throw new Error(`Native Cutout companion deployment target is ${buildVersion?.[1] ?? "unknown"}`)
  }
  await chmod(temporaryOutput, 0o755)
  await rename(temporaryOutput, outfile)
} finally {
  await rm(temporaryOutput, { force: true })
  await rm(stagingDirectory, { force: true, recursive: true })
  await rm(buildDirectory, { force: true, recursive: true })
}

console.log(`Built ${outfile}`)
