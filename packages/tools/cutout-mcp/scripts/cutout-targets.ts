import os from "node:os"

export type SupportedPlatform = "darwin"
export type SupportedArch = "arm64"

// ONNX Runtime 1.23.2's reviewed Apple Silicon release targets macOS 13.4.
export const macosDeploymentTarget = "13.4" as const

export interface CutoutTarget {
  arch: SupportedArch
  platform: SupportedPlatform
}

export const sources = {
  model: {
    name: "BritishWerewolf U-2-Netp ONNX",
    revision: "7112208dbac3a3642496c8d54e2f0f9bb3dc1dc8",
    sha256: "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8",
    size: 4_574_861,
    url: "https://huggingface.co/BritishWerewolf/U-2-Netp/resolve/7112208dbac3a3642496c8d54e2f0f9bb3dc1dc8/onnx/model.onnx",
  },
  onnxRuntime: {
    archiveSha256: "b4d513ab2b26f088c66891dbbc1408166708773d7cc4163de7bdca0e9bbb7856",
    archiveSize: 9_999_931,
    archiveUrl: "https://github.com/microsoft/onnxruntime/releases/download/v1.23.2/onnxruntime-osx-arm64-1.23.2.tgz",
    directory: "onnxruntime-osx-arm64-1.23.2",
    dylibName: "libonnxruntime.1.23.2.dylib",
    version: "1.23.2",
  },
} as const

export const targets: readonly CutoutTarget[] = [{ arch: "arm64", platform: "darwin" }]

export function targetFor(platform: string, arch: string) {
  const target = targets.find((candidate) => candidate.platform === platform && candidate.arch === arch)
  if (!target) throw new Error(`Unsupported Cutout target: ${platform}-${arch}`)
  return target
}

export function hostTarget() {
  return targetFor(os.platform(), os.arch())
}
