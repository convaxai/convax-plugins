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
const hostSigstoreVerifierSha256s = new Set([
  "a142b3a85b766f6fd4ff2737a65c1e4d782ac02a2ba184128438087991272425",
  "28c205f1b5d90895f40a5edc39d19a8f52790eabee5ca169f701f84b53dd37f2",
])
const hostIdentityProfiles = Object.freeze([
  Object.freeze({
    branch: "convax-next",
    ownerId: "125447777",
    repository: "microvoid/convax",
    repositoryId: "1293264965",
  }),
  Object.freeze({
    branch: "main",
    ownerId: "312877127",
    repository: "convaxai/convax",
    repositoryId: "1322708874",
  }),
])
const vendoredHostPackageProfiles = Object.freeze([
  Object.freeze([
    {
      name: "@convax/marketplace",
      version: "0.2.1",
      workspace: "vendor/host-packages/marketplace",
    },
    {
      name: "@convax/marketplace-kit",
      version: "0.2.2",
      workspace: "vendor/host-packages/marketplace-kit",
    },
    {
      name: "@convax/plugin-api",
      version: "2.0.0",
      workspace: "vendor/host-packages/plugin-api",
    },
    {
      name: "@convax/plugin-sdk",
      version: "0.1.1",
      workspace: "vendor/host-packages/plugin-sdk",
    },
    {
      name: "@convax/plugin-ui",
      version: "0.1.0",
      workspace: "vendor/host-packages/plugin-ui",
    },
  ]),
  Object.freeze([
    {
      name: "@convax/bounded-value",
      version: "0.1.0",
      workspace: "vendor/host-packages/bounded-value",
    },
    {
      name: "@convax/marketplace",
      version: "0.2.1",
      workspace: "vendor/host-packages/marketplace",
    },
    {
      name: "@convax/marketplace-kit",
      version: "0.2.2",
      workspace: "vendor/host-packages/marketplace-kit",
    },
    {
      name: "@convax/plugin-api",
      version: "3.0.0",
      workspace: "vendor/host-packages/plugin-api",
    },
    {
      name: "@convax/plugin-sdk",
      version: "0.1.1",
      workspace: "vendor/host-packages/plugin-sdk",
    },
    {
      name: "@convax/plugin-ui",
      version: "0.1.0",
      workspace: "vendor/host-packages/plugin-ui",
    },
  ]),
])

function requireVendoredHostPackageAssertion(shell) {
  const compactShell = shell.replace(/\s+/gu, "")
  const matches = vendoredHostPackageProfiles.filter((packages) =>
    ["name", "version", "workspace"].every((field) => {
      const values = packages.map((entry) => entry[field])
      const assertion = `[.packages[].${field}]==${JSON.stringify(values)}and`
      return compactShell.includes(assertion)
    }),
  )
  if (matches.length !== 1) {
    fail(
      "publish job must select one coherent admitted vendored Host package closure",
    )
  }
}

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

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1
}

function selectHostIdentityProfile({
  approvalShell,
  approvalSource,
  releaseSource,
  verifyShell,
}) {
  const matches = hostIdentityProfiles.filter(
    (profile) =>
      countOccurrences(
        releaseSource,
        `HOST_REPOSITORY: ${profile.repository}`,
      ) === 1 &&
      countOccurrences(
        approvalSource,
        `default: ${profile.repository}`,
      ) === 1 &&
      countOccurrences(
        approvalShell,
        `test "$HOST_REPOSITORY" = ${profile.repository}`,
      ) === 1,
  )
  if (matches.length !== 1) {
    fail("Host workflows must select one coherent admitted repository identity")
  }
  const profile = matches[0]
  const otherProfile = hostIdentityProfiles.find(
    (candidate) => candidate !== profile,
  )
  for (const [source, fragment, count, label] of [
    [
      verifyShell,
      `sdk_workflow="$HOST_REPOSITORY/.github/workflows/plugin-sdk-release.yml@refs/heads/${profile.branch}"`,
      1,
      "SDK workflow identity",
    ],
    [
      verifyShell,
      `api_workflow="$HOST_REPOSITORY/.github/workflows/plugin-api-release.yml@refs/heads/${profile.branch}"`,
      1,
      "API workflow identity",
    ],
    [
      approvalShell,
      `host_workflow="$HOST_REPOSITORY/.github/workflows/plugin-api-release.yml@refs/heads/${profile.branch}"`,
      1,
      "approval workflow identity",
    ],
    [
      verifyShell,
      `hostIdentity.repository.id == "${profile.repositoryId}"`,
      2,
      "publication repository id",
    ],
    [
      verifyShell,
      `hostIdentity.owner.id == "${profile.ownerId}"`,
      2,
      "publication owner id",
    ],
    [
      approvalShell,
      `hostIdentity.repository.id == "${profile.repositoryId}"`,
      1,
      "approval repository id",
    ],
    [
      approvalShell,
      `hostIdentity.owner.id == "${profile.ownerId}"`,
      1,
      "approval owner id",
    ],
  ]) {
    if (countOccurrences(source, fragment) !== count) {
      fail(`${label} must match the selected Host identity exactly`)
    }
  }
  for (const source of [releaseSource, approvalSource, verifyShell, approvalShell]) {
    if (
      source.includes(`hostIdentity.repository.id == "${otherProfile.repositoryId}"`) ||
      source.includes(`hostIdentity.owner.id == "${otherProfile.ownerId}"`)
    ) {
      fail("Host workflows must not mix admitted repository identities")
    }
  }
  return profile
}

function requireHostSigstoreCommands(shell, expectedCount, label, branch) {
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
        `--certificate-github-workflow-ref refs/heads/${branch}`,
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
  const pagesPath = path.join(
    workspaceRoot,
    ".github",
    "workflows",
    "pages.yml",
  )
  const governancePath = path.join(
    workspaceRoot,
    ".github",
    "workflows",
    "host-capability-governance.yml",
  )
  const [
    releaseSource,
    pagesSource,
    governanceSource,
    approvalSource,
    capabilityDecisionSource,
    hostSigstoreVerifierBytes,
  ] =
    await Promise.all([
      fs.readFile(releasePath, "utf8"),
      fs.readFile(pagesPath, "utf8"),
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
    !hostSigstoreVerifierSha256s.has(
      createHash("sha256").update(hostSigstoreVerifierBytes).digest("hex"),
    )
  ) {
    fail(
      "Host Sigstore verifier bytes changed without a prior protected-base digest transition",
    )
  }
  const release = Bun.YAML.parse(releaseSource)
  const pages = Bun.YAML.parse(pagesSource)
  const governance = Bun.YAML.parse(governanceSource)
  const approval = Bun.YAML.parse(approvalSource)
  if (
    !isRecord(release) ||
    !isRecord(release.jobs) ||
    !isRecord(pages) ||
    !isRecord(pages.jobs) ||
    !isRecord(governance) ||
    !isRecord(governance.jobs) ||
    !isRecord(approval) ||
    !isRecord(approval.jobs)
  ) {
    fail("workflow files must be valid mappings")
  }
  const verifySteps = stepsFor(release, "verify")
  const publishSteps = stepsFor(release, "publish")
  const pagesBuildSteps = stepsFor(pages, "build")
  const approvalSteps = stepsFor(approval, "issue")
  const verifyShell = commandText(verifySteps)
  const approvalShell = commandText(approvalSteps)
  const hostIdentity = selectHostIdentityProfile({
    approvalShell,
    approvalSource,
    releaseSource,
    verifyShell,
  })
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
    hostIdentity.branch,
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
    hostIdentity.branch,
  )
  if (
    !verifyShell.includes('--ignore-scripts') ||
    !verifyShell.includes("git diff --exit-code -- bun.lock") ||
    !verifyShell.includes(
      `sdk_workflow="$HOST_REPOSITORY/.github/workflows/plugin-sdk-release.yml@refs/heads/${hostIdentity.branch}"`,
    ) ||
    !verifyShell.includes(
      `api_workflow="$HOST_REPOSITORY/.github/workflows/plugin-api-release.yml@refs/heads/${hostIdentity.branch}"`,
    ) ||
    !verifyShell.includes("SHA256SUMS.sigstore.json") ||
    !verifyShell.includes("runtime-conformance.json.sigstore.json") ||
    !verifyShell.includes(
      `hostIdentity.repository.id == "${hostIdentity.repositoryId}"`,
    ) ||
    !verifyShell.includes(`hostIdentity.owner.id == "${hostIdentity.ownerId}"`) ||
    !verifyShell.includes("realpath node_modules/@convax/plugin-sdk") ||
    !verifyShell.includes("realpath node_modules/@convax/plugin-api")
  ) {
    fail("unprivileged publication workflow omits a frozen-lock or Host Sigstore gate")
  }
  const pagesInstallIndex = pagesBuildSteps.findIndex(
    (step) => step?.name === "Install inert workspace dependencies",
  )
  const pagesDownloadIndex = pagesBuildSteps.findIndex(
    (step) => step?.name === "Download the exact low-privilege build",
  )
  const pagesVerifyIndex = pagesBuildSteps.findIndex(
    (step) => step?.name === "Reverify and stage strict catalogs",
  )
  const pagesInstallShell = pagesBuildSteps[pagesInstallIndex]?.run
  if (
    pagesInstallIndex < 0 ||
    pagesDownloadIndex <= pagesInstallIndex ||
    pagesVerifyIndex <= pagesDownloadIndex ||
    typeof pagesInstallShell !== "string" ||
    !pagesInstallShell.includes(
      "bun install --frozen-lockfile --ignore-scripts",
    ) ||
    !pagesInstallShell.includes("git diff --exit-code -- bun.lock")
  ) {
    fail(
      "Pages build must install frozen workspace dependencies before catalog verification",
    )
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
      `host_workflow="$HOST_REPOSITORY/.github/workflows/plugin-api-release.yml@refs/heads/${hostIdentity.branch}"`,
    ) ||
    !approvalShell.includes(
      `hostIdentity.repository.id == "${hostIdentity.repositoryId}"`,
    ) ||
    !approvalShell.includes(
      `hostIdentity.owner.id == "${hostIdentity.ownerId}"`,
    ) ||
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
    !publishShell.includes(
      "Existing immutable Release does not match verified candidate",
    ) ||
    !publishShell.includes("Tag was not visible after bounded retry") ||
    !publishShell.includes(
      'gh release download "$tag" \\\n    --repo "$GITHUB_REPOSITORY"',
    ) ||
    !publishShell.includes(
      'cmp -s "$candidate_asset" "$published_asset"',
    ) ||
    !publishShell.includes(".immutable == true") ||
    !publishShell.includes(
      '"repos/$GITHUB_REPOSITORY/compare/$release_commit...$GITHUB_SHA"',
    ) ||
    !publishShell.includes(
      'gh release view "$tag" \\\n    --repo "$GITHUB_REPOSITORY"',
    ) ||
    !publishShell.includes(
      'gh release create "$tag" \\\n    --repo "$GITHUB_REPOSITORY"',
    ) ||
    !publishShell.includes('--target "$GITHUB_SHA"')
  ) {
    fail("publish job does not re-verify exact artifact-only provenance")
  }
  requireVendoredHostPackageAssertion(publishShell)
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
  for (const step of [...verifySteps, ...publishSteps, ...pagesBuildSteps]) {
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
