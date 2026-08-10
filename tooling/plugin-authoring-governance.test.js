import { describe, expect, test } from "bun:test";
import os from "node:os";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  assertPluginHostCapabilityDeclarations,
  discoverPackages,
  loadPublicationPolicy,
  requiresSdkOwnedPetSurfaceClient,
  root,
} from "./lib.mjs";
import {
  assertCatalogContainsAcceptedApiContracts,
} from "./host-capability-api-contracts.mjs";
import { hostCapabilityRequestHeadings } from "./host-capability-request.mjs";

const requiredProposalSections = hostCapabilityRequestHeadings;

function unsafeHostMutationInstructions(source) {
  const normalized = source.replace(/\s+/gu, " ");
  return [
    /if .{0,120}(?:missing|absent).{0,120}(?:edit|modify|revise|change) (?:the )?(?:Host|`convax`)/iu,
    /(?:automatically|directly) (?:edit|modify|revise|change) (?:the )?(?:Host|`convax`)/iu,
    /switch to `?\.\.\/convax`? (?:and|to) (?:edit|modify|implement)/iu,
  ]
    .map((pattern) => normalized.match(pattern)?.[0])
    .filter(Boolean);
}

describe("Convax Plugin authoring governance", () => {
  test("publishes a concise standalone authoring Skill with a reusable request template", async () => {
    const packages = await discoverPackages();
    const pkg = packages.find(
      (candidate) =>
        candidate.metadata.kind === "skill" &&
        candidate.metadata.id === "convax-plugin-authoring",
    );
    expect(pkg?.metadata).toEqual(
      expect.objectContaining({
        schema: "convax.package/2",
        version: "0.1.3",
        publication: { status: "ready", blockers: [] },
      }),
    );
    const skill = pkg.files
      .find((file) => file.relativePath === "SKILL.md")
      ?.data.toString("utf8");
    const request = pkg.files
      .find(
        (file) =>
          file.relativePath === "references/host-capability-request.md",
      )
      ?.data.toString("utf8");
    expect(skill).toContain(
      "Create, modify, or debug a Convax Plugin.",
    );
    expect(skill).toContain(
      "[the Host capability request template](references/host-capability-request.md)",
    );
    expect(skill).toContain("@convax/plugin-api");
    expect(skill).toContain("@convax/plugin-sdk");
    expect(skill).toContain("convax.plugin-bundle-provenance/1");
    expect(skill).toContain("never part of request resolution");
    expect(skill).toContain("Do not inspect, edit, or switch to the Host repository");
    expect(skill).not.toMatch(/\|\s*(?:API|Host API)\s*\|/u);
    for (const section of requiredProposalSections) {
      expect(request).toContain(section);
    }
  });

  test("keeps repository rules, docs, and the Plugin template fail closed at the Host boundary", async () => {
    const relativePaths = [
      "AGENTS.md",
      "docs/plugin-authoring.md",
      "templates/plugin-basic/AUTHORING.md",
      "templates/plugin-basic/package/index.html",
    ];
    const sources = await Promise.all(
      relativePaths.map(async (relativePath) => ({
        relativePath,
        source: await fs.readFile(path.join(root, relativePath), "utf8"),
      })),
    );
    for (const { relativePath, source } of sources) {
      expect(source).toContain("convax-plugin-authoring");
      expect(unsafeHostMutationInstructions(source)).toEqual([]);
      expect(source).not.toContain(
        "add or revise the generic ABI in `convax`",
      );
    }
    expect(sources[0].source).toContain("wait for explicit human review");
    expect(sources[1].source).toContain(
      "host-capability-review-required",
    );
    expect(sources[2].source).toContain(
      "structured Host capability request",
    );
  });

  test("runs the protected-base request high-water gate before validation and release selection", async () => {
    const [codeowners, validateWorkflow, releaseWorkflow, historyGate] =
      await Promise.all([
        fs.readFile(
          path.join(root, ".github", "CODEOWNERS"),
          "utf8",
        ),
        fs.readFile(
          path.join(root, ".github", "workflows", "validate.yml"),
          "utf8",
        ),
        fs.readFile(
          path.join(root, ".github", "workflows", "release-on-main.yml"),
          "utf8",
        ),
        fs.readFile(
          path.join(root, "tooling", "host-capability-history.mjs"),
          "utf8",
        ),
      ]);
    expect(validateWorkflow).toContain("host-capability-history.mjs");
    expect(validateWorkflow).toContain("--base");
    expect(validateWorkflow).toContain("fetch-depth: 0");
    expect(releaseWorkflow).toContain(
      '--governance-base "${{ github.event.before }}"',
    );
    expect(releaseWorkflow).toContain(
      "environment: plugin-marketplace-production",
    );
    const packageBuild = releaseWorkflow.indexOf(
      "bun run workspaces:build:packages",
    );
    const ffmpegSourceVerification = releaseWorkflow.indexOf(
      "Fetch and verify the pinned official FFmpeg source",
    );
    const ffmpegSourceBinding = releaseWorkflow.indexOf(
      "CONVAX_FFMPEG_SOURCE_ARCHIVE=",
    );
    const companionBuild = releaseWorkflow.indexOf(
      "bun run build:companions",
    );
    const releaseSelection = releaseWorkflow.indexOf(
      "bun tooling/marketplace-release.mjs",
    );
    expect(packageBuild).toBeGreaterThanOrEqual(0);
    expect(ffmpegSourceVerification).toBeGreaterThanOrEqual(0);
    expect(ffmpegSourceBinding).toBeGreaterThan(ffmpegSourceVerification);
    expect(companionBuild).toBeGreaterThanOrEqual(0);
    expect(releaseSelection).toBeGreaterThanOrEqual(0);
    expect(ffmpegSourceBinding).toBeLessThan(companionBuild);
    expect(packageBuild).toBeLessThan(releaseSelection);
    expect(companionBuild).toBeLessThan(releaseSelection);
    expect(releaseWorkflow).toContain("--retry-all-errors");
    expect(releaseWorkflow.match(
      /Fetch and verify the pinned official FFmpeg source/g,
    )).toHaveLength(1);
    expect(codeowners).toContain("@convax-fc");
    expect(codeowners).toContain(
      "/tooling/host-capability-history.mjs",
    );
    const [protectedGovernance, decisionWorkflow, resolutionDocs] =
      await Promise.all([
        fs.readFile(
          path.join(
            root,
            ".github",
            "workflows",
            "host-capability-governance.yml",
          ),
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
          path.join(root, "docs", "host-capability-resolution.md"),
          "utf8",
        ),
      ]);
    expect(protectedGovernance).toContain("pull_request_target");
    expect(protectedGovernance).toContain("trusted/tooling/host-capability-history.mjs");
    expect(protectedGovernance).not.toContain("working-directory: candidate");
    expect(decisionWorkflow).toContain(
      "environment: plugin-host-capability-governance",
    );
    expect(decisionWorkflow).toContain("gh release verify");
    expect(decisionWorkflow).toContain("gh release verify-asset");
    expect(decisionWorkflow).toContain(
      "sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6",
    );
    expect(decisionWorkflow).toContain("cosign-release: v3.0.6");
    expect(decisionWorkflow).toContain(
      '"$HOST_REPOSITORY/.github/workflows/plugin-api-release.yml@refs/heads/main"',
    );
    expect(decisionWorkflow).toContain(
      "--certificate-oidc-issuer https://token.actions.githubusercontent.com",
    );
    expect(decisionWorkflow).toContain(
      '--certificate-github-workflow-repository "$HOST_REPOSITORY"',
    );
    expect(decisionWorkflow).toContain(
      "--certificate-github-workflow-ref refs/heads/main",
    );
    expect(decisionWorkflow).toContain(
      '--certificate-github-workflow-sha "$HOST_COMMIT"',
    );
    expect(decisionWorkflow).toContain(
      "--certificate-github-workflow-trigger workflow_dispatch",
    );
    expect(decisionWorkflow).toContain("tooling/host-sigstore-bundle.mjs");
    expect(decisionWorkflow).toContain(".sigstore.json");
    expect(decisionWorkflow).not.toContain("--insecure-ignore-tlog");
    expect(decisionWorkflow).not.toContain("--insecure-ignore-sct");
    expect(
      decisionWorkflow.match(/            cosign verify-blob \\/gu),
    ).toHaveLength(1);
    expect(decisionWorkflow).toContain("actions/attest-build-provenance@");
    expect(resolutionDocs).toContain("prevent self-review");
    expect(resolutionDocs).toMatch(/disallow administrator\s+bypass/u);
    expect(resolutionDocs).toMatch(/immutable\s+releases/iu);
    expect(historyGate).toContain(
      "cannot be removed without a protected external human-decision receipt",
    );
    expect(historyGate).toContain(
      '["merge-base", "--is-ancestor", baseCommit, "HEAD"]',
    );
  });

  test("routes ChatCut's PATH toolchain blocker through human review", async () => {
    const [policy, request] = await Promise.all([
      fs.readFile(
        path.join(root, "registry", "host-capability-policy.json"),
        "utf8",
      ).then(JSON.parse),
      fs.readFile(
        path.join(
          root,
          "docs",
          "host-capability-requests",
          "verified-companion-toolchain.md",
        ),
        "utf8",
      ),
    ]);
    const chatcut = policy.requests.flatMap((item) => item.affected).find(
      (item) => item.kind === "plugin" && item.id === "chatcut",
    );
    expect(chatcut.blocker).toEqual(
      expect.objectContaining({
        code: "unverified-runtime-dependency",
        note: expect.stringContaining(
          "docs/host-capability-requests/verified-companion-toolchain.md",
        ),
      }),
    );
    for (const section of requiredProposalSections) {
      expect(request).toContain(section);
    }
    for (const alternative of [
      "Pure JavaScript media processing",
      "Independent Host Tool capability",
      "Bundle a multi-file closure",
    ]) {
      expect(request).toContain(alternative);
    }
    expect(request).toContain("ffmpeg");
    expect(request).toContain("ffprobe");
    expect(request).toContain("must not fall back to `PATH`");
    expect(request).toContain("Decision: pending");
  });

  test("binds the image request to the accepted bearer-session contracts", async () => {
    const requestId = "web-plugin-image-input-read";
    const requestPath =
      `docs/host-capability-requests/${requestId}.md`;
    const [policy, request] = await Promise.all([
      fs.readFile(
        path.join(root, "registry", "host-capability-policy.json"),
        "utf8",
      ).then(JSON.parse),
      fs.readFile(path.join(root, requestPath), "utf8"),
    ]);
    const policyRequest = policy.requests.find(
      (item) => item.id === requestId,
    );
    expect(policyRequest.acceptedApiContracts).toEqual([
      {
        id: "canvas.inputs.image.close",
        digest:
          "sha256:419a4c7ebf078c5ec95bc193cbd07d66b96c3c4ebfe3a31f188ebec1995bbc2e",
      },
      {
        id: "canvas.inputs.image.open",
        digest:
          "sha256:3c5ee38bad065463f9abd292ef399a12777aa1530837dab2fdc1f017c7784e9d",
      },
    ]);
    expect(request).toContain("`canvas.inputs.image.open`");
    expect(request).toContain("`canvas.inputs.image.close`");
    expect(request).toContain("`canvas.connectedImages.read`");
    expect(request).toContain("`convax-connected-media://`");
    expect(request).not.toContain("canvas.inputs.image.read");
    expect(request).not.toContain("dataUrl");
  });

  test("requires a refreshed v3 vendor Catalog to match accepted contracts", async () => {
    const [catalog, policy] = await Promise.all([
      fs.readFile(
        path.join(
          root,
          "node_modules",
          "@convax",
          "plugin-api",
          "dist",
          "generated",
          "plugin-api.json",
        ),
        "utf8",
      ).then(JSON.parse),
      fs.readFile(
        path.join(root, "registry", "host-capability-policy.json"),
        "utf8",
      ).then(JSON.parse),
    ]);
    expect([
      "convax.plugin-api-catalog/2",
      "convax.plugin-api-catalog/3",
    ]).toContain(catalog.schema);
    if (catalog.schema === "convax.plugin-api-catalog/3") {
      const imageRequest = policy.requests.find(
        (item) => item.id === "web-plugin-image-input-read",
      );
      expect(() =>
        assertCatalogContainsAcceptedApiContracts(
          catalog,
          imageRequest.acceptedApiContracts,
          "vendored Plugin API Catalog",
        ),
      ).not.toThrow();
    }
  });

  test("keeps the SDK Pet client candidate publication-blocked until its protected receipt is verified", async () => {
    const requestId = "sdk-owned-pet-surface-client";
    const requestPath =
      `docs/host-capability-requests/${requestId}.md`;
    const [packageJson, policy, request] = await Promise.all([
      fs.readFile(
        path.join(root, "packages", "plugins", "convax-pet", "package.json"),
        "utf8",
      ).then(JSON.parse),
      fs.readFile(
        path.join(root, "registry", "host-capability-policy.json"),
        "utf8",
      ).then(JSON.parse),
      fs.readFile(path.join(root, requestPath), "utf8"),
    ]);
    expect(packageJson["convax.hostCapabilityRequests"]).toContain(requestId);
    const policyRequest = policy.requests.find((item) => item.id === requestId);
    expect(policyRequest).toEqual({
      id: requestId,
      document: requestPath,
      status: "pending",
      humanDecision: null,
      acceptedApiContracts: [],
      affected: [{
        kind: "plugin",
        id: "convax-pet",
        version: "0.3.3",
        blocker: {
          code: "host-capability-review-required",
          note: expect.stringContaining(requestPath),
        },
      }],
    });
    for (const section of requiredProposalSections) {
      expect(request).toContain(section);
    }
    expect(request).toContain("SDK-owned Pet surface client");
    expect(request).toContain("must not inspect or modify Host source");

    const fixture = await fs.mkdtemp(
      path.join(os.tmpdir(), "convax-pet-governance-"),
    );
    const fixturePackagePath = path.join(
      fixture,
      "packages",
      "plugins",
      "convax-pet",
      "package.json",
    );
    const fixturePolicyPath = path.join(
      fixture,
      "registry",
      "host-capability-policy.json",
    );
    const fixtureRequestPath = path.join(fixture, requestPath);
    try {
      await Promise.all([
        fs.mkdir(path.dirname(fixturePackagePath), { recursive: true }),
        fs.mkdir(path.join(fixture, "packages", "skills"), {
          recursive: true,
        }),
        fs.mkdir(path.dirname(fixturePolicyPath), { recursive: true }),
        fs.mkdir(path.dirname(fixtureRequestPath), { recursive: true }),
      ]);
      const fixturePackage = {
        name: packageJson.name,
        version: packageJson.version,
        "convax.hostCapabilityRequests": [requestId],
      };
      const fixturePolicy = {
        schema: policy.schema,
        resolutions: policy.resolutions,
        requests: [policyRequest],
      };
      await Promise.all([
        fs.writeFile(
          fixturePackagePath,
          `${JSON.stringify(fixturePackage, null, 2)}\n`,
        ),
        fs.writeFile(
          fixturePolicyPath,
          `${JSON.stringify(fixturePolicy, null, 2)}\n`,
        ),
        fs.writeFile(fixtureRequestPath, request),
      ]);
      await expect(loadPublicationPolicy(fixture)).resolves.toBeDefined();

      delete fixturePackage["convax.hostCapabilityRequests"];
      await fs.writeFile(
        fixturePackagePath,
        `${JSON.stringify(fixturePackage, null, 2)}\n`,
      );
      await expect(loadPublicationPolicy(fixture)).rejects.toThrow(
        "must exactly match workspace declarations and policy affected versions",
      );

      fixturePackage["convax.hostCapabilityRequests"] = [requestId];
      await Promise.all([
        fs.writeFile(
          fixturePackagePath,
          `${JSON.stringify(fixturePackage, null, 2)}\n`,
        ),
        fs.writeFile(
          fixturePolicyPath,
          `${JSON.stringify({
            schema: policy.schema,
            resolutions: policy.resolutions,
            requests: [],
          }, null, 2)}\n`,
        ),
      ]);
      await expect(loadPublicationPolicy(fixture)).rejects.toThrow(
        `required pending request ${requestId} is missing from publication policy`,
      );

      await Promise.all([
        fs.writeFile(
          fixturePolicyPath,
          `${JSON.stringify(fixturePolicy, null, 2)}\n`,
        ),
        fs.rm(fixtureRequestPath),
      ]);
      await expect(loadPublicationPolicy(fixture)).rejects.toThrow(
        "pending request documents and policy requests must match exactly",
      );
    } finally {
      await fs.rm(fixture, { force: true, recursive: true });
    }
  });

  test("keeps Pet design alignment blocked until a public UI foundation is reviewed", async () => {
    const requestId = "public-plugin-ui-foundation";
    const requestPath =
      `docs/host-capability-requests/${requestId}.md`;
    const [packageJson, policy, request] = await Promise.all([
      fs.readFile(
        path.join(root, "packages", "plugins", "convax-pet", "package.json"),
        "utf8",
      ).then(JSON.parse),
      fs.readFile(
        path.join(root, "registry", "host-capability-policy.json"),
        "utf8",
      ).then(JSON.parse),
      fs.readFile(path.join(root, requestPath), "utf8"),
    ]);

    expect(packageJson["convax.hostCapabilityRequests"]).toEqual([
      requestId,
      "sdk-owned-pet-surface-client",
    ]);
    expect(policy.requests.find((item) => item.id === requestId)).toEqual({
      id: requestId,
      document: requestPath,
      status: "pending",
      humanDecision: null,
      acceptedApiContracts: [],
      affected: [{
        kind: "plugin",
        id: "convax-pet",
        version: "0.3.3",
        blocker: {
          code: "host-capability-review-required",
          note: expect.stringContaining(requestPath),
        },
      }],
    });
    for (const section of requiredProposalSections) {
      expect(request).toContain(section);
    }
    expect(request).toContain("Public Plugin UI foundation");
    expect(request).toContain("no concrete package id");
    expect(request).toContain(
      "must not copy or depend on private application implementation",
    );
  });

  test("keeps the declared audio/video stream API usable while gating the known Pet gap", () => {
    const manifest = {
      hostApi: {
        required: ["canvas.inputs.open"],
      },
    };
    const files = [{
      relativePath: "assets/app.js",
      data: Buffer.from(
        'client.callHostApi(["canvas","inputs","open"].join("."))',
      ),
    }];
    expect(() =>
      assertPluginHostCapabilityDeclarations(
        manifest,
        files,
        [],
        "plugin/video-stream",
      ),
    ).not.toThrow();

    const petManifest = {
      contributes: { pet: { protocol: "convax.pet-host/1" } },
    };
    expect(
      requiresSdkOwnedPetSurfaceClient(
        petManifest,
        [],
      ),
    ).toBe(true);
    expect(() =>
      assertPluginHostCapabilityDeclarations(
        petManifest,
        [],
        [],
        "plugin/renamed-pet",
      ),
    ).toThrow(
      "declare sdk-owned-pet-surface-client and remain publication-blocked pending human review",
    );
  });
});
