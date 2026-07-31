import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

function fail(message) {
  throw new Error(`Plugin publication protected-base policy: ${message}`)
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function stepsFor(workflow, job) {
  const steps = workflow?.jobs?.[job]?.steps
  if (!Array.isArray(steps)) fail(`${job} must contain workflow steps`)
  return steps
}

function commandText(steps) {
  return steps.map((step) => step?.run ?? "").filter(Boolean).join("\n")
}

function requireOrdered(source, fragments, label) {
  let previous = -1
  for (const fragment of fragments) {
    const index = source.indexOf(fragment)
    if (index <= previous) {
      fail(`${label} must contain ${fragment} after the preceding gate`)
    }
    previous = index
  }
}

const cosignInstaller =
  "sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6"
const hostSigstoreVerifierSha256 =
  "a142b3a85b766f6fd4ff2737a65c1e4d782ac02a2ba184128438087991272425"

function requireCosignInstaller(steps, label, expectedCondition) {
  const installers = steps.filter((step) => step?.uses === cosignInstaller)
  if (
    installers.length !== 1 ||
    installers[0]?.with?.["cosign-release"] !== "v3.0.6" ||
    (expectedCondition !== undefined && installers[0]?.if !== expectedCondition)
  ) {
    fail(`${label} must install exact pinned Cosign v3.0.6 once`)
  }
}

function requireHostSigstoreCommands(shell, expectedCount, label) {
  const commands = shell.split(/^\s*cosign verify-blob \\\s*$/gmu).slice(1)
  if (
    commands.length !== expectedCount ||
    shell.includes("gh attestation verify") ||
    shell.includes("--insecure-ignore-tlog") ||
    shell.includes("--insecure-ignore-sct")
  ) {
    fail(`${label} must use only the expected fail-closed Host Cosign commands`)
  }
  for (const command of commands) {
    if (
      !command.includes('--bundle "$bundle"') ||
      !command.includes("--certificate-identity") ||
      !command.includes(
        "--certificate-oidc-issuer https://token.actions.githubusercontent.com",
      ) ||
      !command.includes("--certificate-github-workflow-repository") ||
      !command.includes(
        "--certificate-github-workflow-ref refs/heads/convax-next",
      ) ||
      !command.includes("--certificate-github-workflow-sha") ||
      !command.includes(
        "--certificate-github-workflow-trigger workflow_dispatch",
      )
    ) {
      fail(`${label} contains a Host Cosign command with incomplete identity binding`)
    }
  }
  if (
    !shell.includes("tooling/host-sigstore-bundle.mjs") ||
    !shell.includes("convax.host-sigstore-verification/1") ||
    !shell.includes("host-repository.json")
  ) {
    fail(`${label} omits immutable repository/owner identity verification`)
  }
}

export async function verifyPluginPublicationPolicy(workspaceRoot) {
  const releasePath = path.join(
    workspaceRoot,
    ".github",
    "workflows",
    "release-on-main.yml",
  )
  const governancePath = path.join(
    workspaceRoot,
    ".github",
    "workflows",
    "host-capability-governance.yml",
  )
  const [
    releaseSource,
    governanceSource,
    approvalSource,
    capabilityDecisionSource,
    hostSigstoreVerifierBytes,
  ] =
    await Promise.all([
      fs.readFile(releasePath, "utf8"),
      fs.readFile(governancePath, "utf8"),
      fs.readFile(
        path.join(
          workspaceRoot,
          ".github",
          "workflows",
          "approve-host-capability.yml",
        ),
        "utf8",
      ),
      fs.readFile(
        path.join(workspaceRoot, "tooling", "host-capability-decision.mjs"),
        "utf8",
      ),
      fs.readFile(
        path.join(workspaceRoot, "tooling", "host-sigstore-bundle.mjs"),
      ),
    ])
  if (
    createHash("sha256").update(hostSigstoreVerifierBytes).digest("hex") !==
    hostSigstoreVerifierSha256
  ) {
    fail(
      "Host Sigstore verifier bytes changed without a prior protected-base digest transition",
    )
  }
  const release = Bun.YAML.parse(releaseSource)
  const governance = Bun.YAML.parse(governanceSource)
  const approval = Bun.YAML.parse(approvalSource)
  if (
    !isRecord(release) ||
    !isRecord(release.jobs) ||
    !isRecord(governance) ||
    !isRecord(governance.jobs) ||
    !isRecord(approval) ||
    !isRecord(approval.jobs)
  ) {
    fail("workflow files must be valid mappings")
  }
  const verifySteps = stepsFor(release, "verify")
  const publishSteps = stepsFor(release, "publish")
  const approvalSteps = stepsFor(approval, "issue")
  const verifyShell = commandText(verifySteps)
  const approvalShell = commandText(approvalSteps)
  if (release.env?.CONVAX_PLUGIN_SDK_SOURCE !== "workspace") {
    fail("the temporary Plugin SDK source must remain the reviewed workspace closure")
  }
  requireOrdered(
    verifyShell,
    [
      "--governance-base",
      "bun run check",
      "vendored-host-package-closure.mjs",
      "plugin-sdk-provenance-cli.mjs inspect-lock",
      "cosign verify-blob",
      "plugin-sdk-provenance-cli.mjs build",
      "verify-marketplace-output.mjs",
      "publication-plan.mjs",
      "PUBLICATION-SHA256SUMS",
    ],
    "unprivileged publication workflow",
  )
  requireCosignInstaller(
    verifySteps,
    "unprivileged publication workflow",
    "steps.plan.outputs.plugin_count != '0'",
  )
  requireHostSigstoreCommands(
    verifyShell,
    2,
    "unprivileged publication workflow",
  )
  const workspaceClosureStep = verifySteps.find(
    (step) =>
      step?.name ===
      "Bind release inputs to the exact vendored Host package closure",
  )
  if (
    workspaceClosureStep?.if !==
      "steps.plan.outputs.plugin_count != '0' && env.CONVAX_PLUGIN_SDK_SOURCE == 'workspace'" ||
    !workspaceClosureStep?.run?.includes(
      "--output dist/vendored-host-package-closure.json",
    )
  ) {
    fail("workspace publication must emit one exact vendored Host package closure")
  }
  for (const name of [
    "Require an npm-only frozen Plugin SDK closure",
    "Fetch and verify immutable Host package evidence",
    "Bind every selected Plugin ZIP to its actual SDK/API closure",
    "Re-verify provenance-augmented release inputs",
  ]) {
    const step = verifySteps.find((candidate) => candidate?.name === name)
    if (
      step?.if !==
      "steps.plan.outputs.plugin_count != '0' && env.CONVAX_PLUGIN_SDK_SOURCE == 'npm'"
    ) {
      fail(`future npm publication step must stay disabled in workspace mode: ${name}`)
    }
  }
  requireCosignInstaller(approvalSteps, "Host capability approval workflow")
  requireHostSigstoreCommands(
    approvalShell,
    1,
    "Host capability approval workflow",
  )
  if (
    !verifyShell.includes('--ignore-scripts') ||
    !verifyShell.includes("git diff --exit-code -- bun.lock") ||
    !verifyShell.includes(
      'sdk_workflow="$HOST_REPOSITORY/.github/workflows/plugin-sdk-release.yml@refs/heads/convax-next"',
    ) ||
    !verifyShell.includes(
      'api_workflow="$HOST_REPOSITORY/.github/workflows/plugin-api-release.yml@refs/heads/convax-next"',
    ) ||
    !verifyShell.includes("SHA256SUMS.sigstore.json") ||
    !verifyShell.includes("runtime-conformance.json.sigstore.json") ||
    !verifyShell.includes('hostIdentity.repository.id == "1293264965"') ||
    !verifyShell.includes('hostIdentity.owner.id == "125447777"') ||
    !verifyShell.includes("realpath node_modules/@convax/plugin-sdk") ||
    !verifyShell.includes("realpath node_modules/@convax/plugin-api")
  ) {
    fail("unprivileged publication workflow omits a frozen-lock or Host Sigstore gate")
  }
  for (const asset of [
    "$CATALOG_ASSET",
    "$PACKAGE_ASSET",
    "$CONFORMANCE_ASSET",
  ]) {
    if (
      !approvalShell.includes(`--pattern "${asset}"`) ||
      !approvalShell.includes(`--pattern "${asset}.sigstore.json"`)
    ) {
      fail(`Host capability approval omits exact Sigstore pair for ${asset}`)
    }
  }
  if (
    !approvalShell.includes("gh release verify") ||
    !approvalShell.includes("gh release verify-asset") ||
    !approvalShell.includes(
      'host_workflow="$HOST_REPOSITORY/.github/workflows/plugin-api-release.yml@refs/heads/convax-next"',
    ) ||
    !approvalShell.includes('hostIdentity.repository.id == "1293264965"') ||
    !approvalShell.includes('hostIdentity.owner.id == "125447777"') ||
    (approvalShell.match(
      /> "\$evidence\/catalog-verification\.json"/gu,
    ) ?? []).length !== 1 ||
    !approvalSource.includes("actions/attest-build-provenance@")
  ) {
    fail("Host capability approval must retain Release and public receipt attestation")
  }

  const publish = release.jobs.publish
  if (
    publish.environment !== "plugin-marketplace-production" ||
    publish.needs !== "verify" ||
    JSON.stringify(publish.permissions) !==
      JSON.stringify({
        attestations: "write",
        contents: "write",
        "id-token": "write",
      })
  ) {
    fail("publish job authority must remain exact and environment-gated")
  }
  const publishShell = commandText(publishSteps)
  if (
    !publishShell.includes("sha256sum --check PUBLICATION-SHA256SUMS") ||
    !publishShell.includes("convax.vendored-host-package-closure/1") ||
    !publishShell.includes("convax.plugin-bundle-provenance/1") ||
    !publishShell.includes("Release version reuse is forbidden") ||
    !publishShell.includes('--target "$GITHUB_SHA"')
  ) {
    fail("publish job does not re-verify exact artifact-only provenance")
  }
  const workspaceAttestation = publishSteps.find(
    (step) =>
      step?.name ===
      "Attest immutable Plugin bundles, workspace closure, and checksums together",
  )
  if (
    workspaceAttestation?.if !==
      "needs.verify.outputs.plugin_count != '0' && needs.verify.outputs.sdk_source == 'workspace'" ||
    !workspaceAttestation?.with?.["subject-path"]?.includes(
      "dist/vendored-host-package-closure.json",
    ) ||
    !workspaceAttestation?.with?.["subject-path"]?.includes(
      "dist/PUBLICATION-SHA256SUMS",
    )
  ) {
    fail("workspace publication attestation must bind the closure and checksums")
  }
  for (const step of publishSteps) {
    if (step?.uses?.startsWith("actions/checkout@")) {
      fail("publish job must never check out repository source")
    }
    if (step?.["working-directory"] !== undefined) {
      fail("publish job must not use a repository working directory")
    }
    if (
      typeof step?.run === "string" &&
      /(?:^|[\n;&|`]|\$\()\s*(?:bun|deno|git|node|npm|perl|python[0-9.]*|ruby|source|zsh)\b/u.test(
        step.run,
      )
    ) {
      fail("publish job must not execute repository-capable runtimes")
    }
  }
  for (const step of [...verifySteps, ...publishSteps]) {
    if (typeof step?.uses === "string" &&
      !/^[^@\s]+@[a-f0-9]{40}$/u.test(step.uses)) {
      fail(`workflow Action must be pinned by full SHA: ${step.uses}`)
    }
  }

  const protectedSteps = stepsFor(governance, "protected-base")
  const protectedShell = commandText(protectedSteps)
  requireOrdered(
    protectedShell,
    [
      "trusted/tooling/host-capability-history.mjs",
      "trusted/tooling/plugin-publication-policy.mjs",
    ],
    "protected-base workflow",
  )
  if (
    !governanceSource.includes("Check out the trusted protected-base verifier") ||
    !governanceSource.includes("Check out candidate bytes as untrusted data") ||
    !protectedShell.includes('--workspace "$GITHUB_WORKSPACE/candidate"')
  ) {
    fail("protected-base workflow must treat candidate publication logic as data")
  }
  if (
    capabilityDecisionSource.includes("convax.host-package-release/1") ||
    capabilityDecisionSource.includes("plugin-sdk-authoring-package")
  ) {
    fail("SDK Host package evidence must never enter capability decision verification")
  }
  return {
    artifactOnlyPublish: true,
    capabilityEvidenceIndependent: true,
    protectedBaseVerifier: true,
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 2 || args[0] !== "--workspace") {
    fail("--workspace <candidate-root> is required")
  }
  const result = await verifyPluginPublicationPolicy(path.resolve(args[1]))
  process.stdout.write(
    `Verified protected Plugin publication policy: ${JSON.stringify(result)}\n`,
  )
}

if (import.meta.main) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
