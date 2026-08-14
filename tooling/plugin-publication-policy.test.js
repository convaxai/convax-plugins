import { describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import { root } from "./lib.mjs"
import { verifyPluginPublicationPolicy } from "./plugin-publication-policy.mjs"

async function createFixture() {
  const fixture = await fs.mkdtemp(
    path.join(os.tmpdir(), "convax-publication-policy-"),
  )
  await fs.mkdir(path.join(fixture, ".github", "workflows"), {
    recursive: true,
  })
  await fs.mkdir(path.join(fixture, "tooling"), { recursive: true })
  const files = [
    ".github/workflows/release-on-main.yml",
    ".github/workflows/pages.yml",
    "tooling/host-sigstore-bundle.mjs",
  ]
  await Promise.all(
    files.map(async (relativePath) => {
      await fs.copyFile(
        path.join(root, relativePath),
        path.join(fixture, relativePath),
      )
    }),
  )
  return fixture
}

describe("automatic Plugin publication policy", () => {
  test("keeps immutable artifact verification without approval gates", async () => {
    await expect(verifyPluginPublicationPolicy(root)).resolves.toEqual({
      artifactOnlyPublish: true,
      automaticPublish: true,
      hostPackageEvidence: true,
    })

    for (const relativePath of [
      ".github/CODEOWNERS",
      ".github/workflows/approve-host-capability.yml",
      ".github/workflows/host-capability-governance.yml",
    ]) {
      await expect(
        fs.stat(path.join(root, relativePath)),
      ).rejects.toMatchObject({
        code: "ENOENT",
      })
    }

    const release = Bun.YAML.parse(
      await fs.readFile(
        path.join(root, ".github", "workflows", "release-on-main.yml"),
        "utf8",
      ),
    )
    expect(release.jobs.publish.environment).toBeUndefined()
  })

  test("stages FFmpeg evidence only when that exact Plugin release is selected", async () => {
    const source = await fs.readFile(
      path.join(root, ".github", "workflows", "release-on-main.yml"),
      "utf8",
    )
    const workflow = Bun.YAML.parse(source)
    const steps = workflow.jobs.verify.steps
    const plan = steps.find(
      (step) => step.name === "Select exact unpublished version changes",
    )
    const stage = steps.find(
      (step) =>
        step.name ===
        "Stage verified FFmpeg source and SBOM beside the companion",
    )

    expect(plan.run).toContain(
      'ffmpeg_count=$(jq \'[.[] | select(.kind == "plugin" and .id == "ffmpeg-tools")] | length\' dist/release-plan.json)',
    )
    expect(stage.if).toBe(
      "env.CONVAX_FFMPEG_REQUIRE_PGP == '1' && steps.plan.outputs.ffmpeg_count != '0'",
    )
  })

  test("rejects approval environments and mutations to artifact-only publishing", async () => {
    const fixture = await createFixture()
    try {
      const releasePath = path.join(
        fixture,
        ".github",
        "workflows",
        "release-on-main.yml",
      )
      const release = await fs.readFile(releasePath, "utf8")
      await fs.writeFile(
        releasePath,
        release.replace(
          "    timeout-minutes: 20\n    permissions:",
          "    timeout-minutes: 20\n    environment: manual-approval\n    permissions:",
        ),
      )
      await expect(verifyPluginPublicationPolicy(fixture)).rejects.toThrow(
        "automatic after verification",
      )

      await fs.writeFile(
        releasePath,
        release.replace(
          "steps:\n      - name: Download verified exact bytes",
          "steps:\n      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0\n      - name: Download verified exact bytes",
        ),
      )
      await expect(verifyPluginPublicationPolicy(fixture)).rejects.toThrow(
        "must never check out",
      )

      await fs.writeFile(releasePath, release)
      await fs.appendFile(
        path.join(fixture, "tooling", "host-sigstore-bundle.mjs"),
        "\n",
      )
      await expect(verifyPluginPublicationPolicy(fixture)).rejects.toThrow(
        "prior protected-base digest transition",
      )
    } finally {
      await fs.rm(fixture, { force: true, recursive: true })
    }
  })
})
