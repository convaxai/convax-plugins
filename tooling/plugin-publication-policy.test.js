import { describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import { root } from "./lib.mjs"
import { verifyPluginPublicationPolicy } from "./plugin-publication-policy.mjs"

describe("protected Plugin publication policy", () => {
  test("keeps capability high-water first and the privileged job artifact-only", async () => {
    await expect(verifyPluginPublicationPolicy(root)).resolves.toEqual({
      artifactOnlyPublish: true,
      capabilityEvidenceIndependent: true,
      protectedBaseVerifier: true,
    })
  })

  test("stages FFmpeg evidence only when that exact Plugin release is selected", async () => {
    const source = await fs.readFile(
      path.join(root, ".github", "workflows", "release-on-main.yml"),
      "utf8",
    )
    const workflow = Bun.YAML.parse(source)
    const steps = workflow.jobs.verify.steps
    const plan = steps.find((step) =>
      step.name === "Select exact unpublished version changes")
    const stage = steps.find((step) =>
      step.name === "Stage verified FFmpeg source and SBOM beside the companion")

    expect(plan.run).toContain(
      'ffmpeg_count=$(jq \'[.[] | select(.kind == "plugin" and .id == "ffmpeg-tools")] | length\' dist/release-plan.json)',
    )
    expect(stage.if).toBe(
      "env.CONVAX_FFMPEG_REQUIRE_PGP == '1' && steps.plan.outputs.ffmpeg_count != '0'",
    )
  })

  test("rejects candidate self-approval through checkout or Host package evidence", async () => {
    const fixture = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-publication-policy-"),
    )
    try {
      await fs.mkdir(path.join(fixture, ".github", "workflows"), {
        recursive: true,
      })
      await fs.mkdir(path.join(fixture, "tooling"), { recursive: true })
      const [release, pages, governance, approval, decision, sigstoreVerifier] =
        await Promise.all([
        fs.readFile(
          path.join(root, ".github", "workflows", "release-on-main.yml"),
          "utf8",
        ),
        fs.readFile(
          path.join(root, ".github", "workflows", "pages.yml"),
          "utf8",
        ),
        fs.readFile(
          path.join(root, ".github", "workflows", "host-capability-governance.yml"),
          "utf8",
        ),
        fs.readFile(
          path.join(
            root,
            ".github",
            "workflows",
            "approve-host-capability.yml",
          ),
          "utf8",
        ),
        fs.readFile(
          path.join(root, "tooling", "host-capability-decision.mjs"),
          "utf8",
        ),
        fs.readFile(
          path.join(root, "tooling", "host-sigstore-bundle.mjs"),
          "utf8",
        ),
      ])
      await Promise.all([
        fs.writeFile(
          path.join(fixture, ".github", "workflows", "release-on-main.yml"),
          release.replace(
            "steps:\n      - name: Download verified exact bytes",
            "steps:\n      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0\n      - name: Download verified exact bytes",
          ),
        ),
        fs.writeFile(
          path.join(fixture, ".github", "workflows", "pages.yml"),
          pages,
        ),
        fs.writeFile(
          path.join(
            fixture,
            ".github",
            "workflows",
            "host-capability-governance.yml",
          ),
          governance,
        ),
        fs.writeFile(
          path.join(
            fixture,
            ".github",
            "workflows",
            "approve-host-capability.yml",
          ),
          approval,
        ),
        fs.writeFile(
          path.join(fixture, "tooling", "host-capability-decision.mjs"),
          decision,
        ),
        fs.writeFile(
          path.join(fixture, "tooling", "host-sigstore-bundle.mjs"),
          sigstoreVerifier,
        ),
      ])
      await expect(verifyPluginPublicationPolicy(fixture)).rejects.toThrow(
        "must never check out",
      )

      await fs.writeFile(
        path.join(fixture, ".github", "workflows", "release-on-main.yml"),
        release,
      )
      await fs.writeFile(
        path.join(fixture, "tooling", "host-capability-decision.mjs"),
        `${decision}\n// convax.host-package-release/1\n`,
      )
      await expect(verifyPluginPublicationPolicy(fixture)).rejects.toThrow(
        "must never enter capability decision",
      )

      await fs.writeFile(
        path.join(fixture, "tooling", "host-capability-decision.mjs"),
        decision,
      )
      await fs.writeFile(
        path.join(
          fixture,
          ".github",
          "workflows",
          "approve-host-capability.yml",
        ),
        approval.replace(
          '            --format json > "$evidence/catalog-verification.json"',
          '            --format json > "$evidence/catalog-verification.json"\n' +
            '          --format json > "$evidence/catalog-verification.json"',
        ),
      )
      await expect(verifyPluginPublicationPolicy(fixture)).rejects.toThrow(
        "must retain Release and public receipt attestation",
      )

      await fs.writeFile(
        path.join(
          fixture,
          ".github",
          "workflows",
          "approve-host-capability.yml",
        ),
        approval,
      )
      await fs.writeFile(
        path.join(fixture, ".github", "workflows", "release-on-main.yml"),
        release.replace(
          "CONVAX_PLUGIN_SDK_SOURCE: workspace",
          "CONVAX_PLUGIN_SDK_SOURCE: npm",
        ),
      )
      await expect(verifyPluginPublicationPolicy(fixture)).rejects.toThrow(
        "must remain the reviewed workspace closure",
      )

      await fs.writeFile(
        path.join(fixture, ".github", "workflows", "release-on-main.yml"),
        release.replace(
          'gh release create "$tag" \\\n              --repo "$GITHUB_REPOSITORY"',
          'gh release create "$tag"',
        ),
      )
      await expect(verifyPluginPublicationPolicy(fixture)).rejects.toThrow(
        "does not re-verify exact artifact-only provenance",
      )

      await fs.writeFile(
        path.join(fixture, ".github", "workflows", "release-on-main.yml"),
        release.replace(
          '[.packages[].version] == ["0.2.1", "0.2.2", "2.0.0", "0.1.1", "0.1.0"]',
          '[.packages[].version] == ["0.2.1", "0.2.3", "2.0.0", "0.1.1", "0.1.0"]',
        ),
      )
      await expect(verifyPluginPublicationPolicy(fixture)).rejects.toThrow(
        "vendored Host package version assertion drifted",
      )

      await fs.writeFile(
        path.join(fixture, ".github", "workflows", "release-on-main.yml"),
        release.replace(
          'cmp -s "$candidate_asset" "$published_asset"',
          'test -f "$published_asset"',
        ),
      )
      await expect(verifyPluginPublicationPolicy(fixture)).rejects.toThrow(
        "does not re-verify exact artifact-only provenance",
      )

      await fs.writeFile(
        path.join(fixture, ".github", "workflows", "release-on-main.yml"),
        release.replace(
          "Tag was not visible after bounded retry",
          "Tag was not visible",
        ),
      )
      await expect(verifyPluginPublicationPolicy(fixture)).rejects.toThrow(
        "does not re-verify exact artifact-only provenance",
      )

      await fs.writeFile(
        path.join(fixture, ".github", "workflows", "release-on-main.yml"),
        release.replace(
          "tooling/vendored-host-package-closure.mjs",
          "tooling/workspace-closure-disabled.mjs",
        ),
      )
      await expect(verifyPluginPublicationPolicy(fixture)).rejects.toThrow(
        "must contain vendored-host-package-closure.mjs",
      )

      await fs.writeFile(
        path.join(fixture, ".github", "workflows", "release-on-main.yml"),
        release,
      )
      await fs.writeFile(
        path.join(
          fixture,
          ".github",
          "workflows",
          "approve-host-capability.yml",
        ),
        approval,
      )
      await fs.writeFile(
        path.join(fixture, "tooling", "host-sigstore-bundle.mjs"),
        `${sigstoreVerifier}\n`,
      )
      await expect(verifyPluginPublicationPolicy(fixture)).rejects.toThrow(
        "prior protected-base digest transition",
      )

      await fs.writeFile(
        path.join(fixture, "tooling", "host-sigstore-bundle.mjs"),
        sigstoreVerifier,
      )
      await fs.writeFile(
        path.join(fixture, ".github", "workflows", "pages.yml"),
        pages.replace(
          "bun install --frozen-lockfile --ignore-scripts",
          "bun install",
        ),
      )
      await expect(verifyPluginPublicationPolicy(fixture)).rejects.toThrow(
        "Pages build must install frozen workspace dependencies",
      )
    } finally {
      await fs.rm(fixture, { force: true, recursive: true })
    }
  })
})
