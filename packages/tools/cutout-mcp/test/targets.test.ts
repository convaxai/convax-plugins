import { describe, expect, test } from "bun:test"

import {
  macosDeploymentTarget,
  targetFor,
  targets,
} from "../scripts/cutout-targets.ts"

describe("Cutout release inputs", () => {
  test("pins one native Apple Silicon target", () => {
    expect(targets).toEqual([{ arch: "arm64", platform: "darwin" }])
    expect(macosDeploymentTarget).toBe("13.4")
    expect(targetFor("darwin", "arm64")).toEqual(targets[0]!)
    expect(() => targetFor("linux", "x64")).toThrow("Unsupported Cutout target")
  })

  test("pins the exact U-2-Netp model and ONNX Runtime", async () => {
    const build = await Bun.file(new URL("../scripts/build-release.ts", import.meta.url)).text()
    const targets = await Bun.file(new URL("../scripts/cutout-targets.ts", import.meta.url)).text()
    expect(build).toContain("prepareAssets")
    expect(build).toContain("assets.modelPath")
    expect(build).not.toContain('"Vision"')
    expect(targets).toContain("BritishWerewolf/U-2-Netp")
    expect(targets).toContain("309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8")
  })
})
