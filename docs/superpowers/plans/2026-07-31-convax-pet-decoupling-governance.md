# Convax Pet Decoupling Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every public-contract gap that blocks a fully decoupled, design-aligned Convax Pet release, and make publication governance correctly support multiple independent pending requests for one exact package version.

**Architecture:** Keep concrete Pet behavior inside `packages/plugins/convax-pet` and represent missing public Host-owned contracts as independent append-only request documents. Change only the generic publication-policy projection so several request records may bind one package version while the package still exposes one bounded blocker per blocker category; do not inspect or modify Host implementation or migrate Pet runtime code before reviewed packages exist.

**Tech Stack:** Bun, JavaScript ESM, Bun Test, JSON publication policy, Markdown capability-request governance.

---

## File map

- `tooling/lib.mjs`: validates capability policy and projects request-level blockers into package-level publication state.
- `tooling/plugin-v8.test.js`: unit coverage for the generic policy parser and blocker aggregation.
- `tooling/marketplace-release.test.js`: integration coverage for reverse bindings and release snapshots.
- `docs/host-capability-requests/public-plugin-ui-foundation.md`: append-only request for a browser-safe public Plugin design foundation.
- `packages/plugins/convax-pet/package.json`: declares both exact Host capability requests required by the Pet package.
- `registry/host-capability-policy.json`: binds both requests to `plugin/convax-pet@0.2.3`.
- `tooling/plugin-authoring-governance.test.js`: verifies Pet request documents and two-way policy bindings.
- `tooling/governance-document-scan.test.js`: binds the new request to the current generated Catalog digest.
- `tooling/workspaces.test.js`: verifies discovery reports both request documents in Pet's aggregated publication blocker.

### Task 1: Support several request records for one package version

**Files:**
- Modify: `tooling/plugin-v8.test.js`
- Modify: `tooling/lib.mjs`

- [ ] **Step 1: Write the failing parser test**

Add a test that passes two distinct pending requests, each affecting `plugin/example-plugin@1.0.0` with the same `host-capability-review-required` blocker category and a note linking its own document. Assert that parsing succeeds with one package projection, one blocker category, and a merged note containing both document paths. Also assert that repeating the same package version twice inside one request is rejected.

```js
test("aggregates independent pending requests for one exact package version", () => {
  const affected = (document) => ({
    kind: "plugin",
    id: "example-plugin",
    version: "1.0.0",
    blocker: {
      code: "host-capability-review-required",
      note: `Missing published contract. ${document}`,
    },
  });
  const policy = parseHostCapabilityPolicy({
    schema: "convax.host-capability-policy/1",
    requests: ["first-contract", "second-contract"].map((id) => {
      const document = `docs/host-capability-requests/${id}.md`;
      return {
        id,
        document,
        status: "pending",
        humanDecision: null,
        affected: [affected(document)],
      };
    }),
  });
  expect(policy.packages).toHaveLength(1);
  expect(policy.packages[0].blockers).toHaveLength(1);
  expect(policy.packages[0].blockers[0].note).toContain("first-contract.md");
  expect(policy.packages[0].blockers[0].note).toContain("second-contract.md");
});
```

- [ ] **Step 2: Run the parser test and verify RED**

Run: `bun test tooling/plugin-v8.test.js`

Expected: FAIL because `parseHostCapabilityPolicy` currently throws `binds one package version to more than one pending request`.

- [ ] **Step 3: Implement bounded package-level aggregation**

In each request, reject duplicate affected package identities locally. Across different requests, group affected records by `kind/id@version`; retain one package projection and merge notes only when blocker codes match. Re-validate the grouped publication through `parsePublication`, preserving its maximum blocker count, unique blocker-code rule, and note length bound.

```js
const affectedIdentities = affected.map(
  (item) => `${item.kind}/${item.id}@${item.version}`,
);
if (new Set(affectedIdentities).size !== affectedIdentities.length) {
  error(requestLabel, "affected contains duplicate package versions");
}
```

The final `packages` array must be deterministic in request order and must contain one `status: "blocked"` record per exact package identity.

- [ ] **Step 4: Run the parser test and verify GREEN**

Run: `bun test tooling/plugin-v8.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the generic governance behavior**

```bash
git add tooling/lib.mjs tooling/plugin-v8.test.js
git commit -m "fix(governance): aggregate pending package requests"
```

### Task 2: Prove two-way loading and release projection with two requests

**Files:**
- Modify: `tooling/marketplace-release.test.js`

- [ ] **Step 1: Write the failing integration test**

Create two canonical request documents in one temporary marketplace fixture, call `writePolicy` with two requests affecting `example-plugin@1.0.0`, and assert:

```js
expect(packageJson["convax.hostCapabilityRequests"]).toEqual([
  "first-contract",
  "second-contract",
]);
expect(snapshot.get("plugin\0example-plugin")?.publication).toMatchObject({
  status: "blocked",
  blockers: [{
    code: "host-capability-review-required",
    note: expect.stringContaining("first-contract.md"),
  }],
});
expect(snapshot.get("plugin\0example-plugin")?.publication.blockers[0].note)
  .toContain("second-contract.md");
```

Then remove one workspace request id while keeping both policy records and assert that loading rejects the exact declaration/policy mismatch.

- [ ] **Step 2: Run the integration test and verify RED**

Run: `bun test tooling/marketplace-release.test.js`

Expected: FAIL until the test fixture and generic aggregation both preserve the two request bindings.

- [ ] **Step 3: Make only fixture-level adjustments required by the test**

Keep `writePolicy` additive and deterministic so one package can receive both unique request ids. Do not add Pet-specific logic or a concrete package-name branch.

- [ ] **Step 4: Run the integration test and verify GREEN**

Run: `bun test tooling/marketplace-release.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the release-governance coverage**

```bash
git add tooling/marketplace-release.test.js
git commit -m "test(governance): cover multiple package requests"
```

### Task 3: Add the public Plugin UI foundation request

**Files:**
- Create: `docs/host-capability-requests/public-plugin-ui-foundation.md`
- Modify: `tooling/governance-document-scan.test.js`

- [ ] **Step 1: Extend Catalog-evidence coverage and verify RED**

Add `docs/host-capability-requests/public-plugin-ui-foundation.md` to the explicit request list checked against `currentPluginApiCatalogEvidence()`, then run:

Run: `bun test tooling/governance-document-scan.test.js`

Expected: FAIL with `ENOENT` because the new request document does not exist.

- [ ] **Step 2: Write the canonical append-only request document**

Use every heading and audit field from `packages/skills/convax-plugin-authoring/package/references/host-capability-request.md`. Bind evidence to `@convax/plugin-api@1.0.0` and SHA-256 `5647290670309c550c144b2746a17bc0fa0dd504484fb137952620896dc889e4`.

The requested contract must be generic and limited to:

- a versioned, browser-safe, build-time package for sandboxed Web Plugin author source;
- semantic light/dark tokens and accessible recipes for buttons, icon buttons, cards, badges, fields, notices, empty states, focus, disabled state, reduced motion, and scrolling;
- no runtime grant, IPC, filesystem, credentials, Host DOM, Host-private React/CSS import, or mutable global style injection;
- a clean external fixture and documented SemVer/integrity behavior;
- system light/dark only, with app-specific theme synchronization explicitly outside this request.

Include at least five falsifiable acceptance tests, including rejection if exact alignment requires private Host implementation or concrete Plugin identity.

- [ ] **Step 3: Run document governance and verify GREEN**

Run: `bun test tooling/governance-document-scan.test.js`

Expected: PASS with canonical structure, current digest, pending audit, and no forbidden cross-repository instruction.

- [ ] **Step 4: Commit the capability request**

```bash
git add docs/host-capability-requests/public-plugin-ui-foundation.md tooling/governance-document-scan.test.js
git commit -m "docs(governance): request public plugin UI foundation"
```

### Task 4: Bind both Pet blockers without changing released bytes

**Files:**
- Modify: `packages/plugins/convax-pet/package.json`
- Modify: `registry/host-capability-policy.json`
- Modify: `tooling/plugin-authoring-governance.test.js`
- Modify: `tooling/workspaces.test.js`

- [ ] **Step 1: Write failing Pet governance expectations**

Update the Pet governance test to load both `sdk-owned-pet-surface-client` and `public-plugin-ui-foundation`, assert both ids are present in the package declaration, and assert each policy request independently binds `plugin/convax-pet@0.2.3` to its own canonical document. Update the workspace discovery expectation so the aggregated blocker note contains both request paths.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun test tooling/plugin-authoring-governance.test.js tooling/workspaces.test.js`

Expected: FAIL because the package and policy currently declare only the Pet surface client request.

- [ ] **Step 3: Add the exact workspace and policy binding**

Set the package declarations to:

```json
"convax.hostCapabilityRequests": [
  "public-plugin-ui-foundation",
  "sdk-owned-pet-surface-client"
]
```

Add a pending `public-plugin-ui-foundation` policy record affecting only `plugin/convax-pet@0.2.3`, with blocker code `host-capability-review-required` and a note linking its own request document. Keep version `0.2.3`: this phase changes governance metadata and intentionally does not alter released Plugin bytes or claim a publishable release.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `bun test tooling/plugin-authoring-governance.test.js tooling/workspaces.test.js tooling/governance-document-scan.test.js tooling/plugin-v8.test.js tooling/marketplace-release.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the Pet bindings**

```bash
git add packages/plugins/convax-pet/package.json registry/host-capability-policy.json tooling/plugin-authoring-governance.test.js tooling/workspaces.test.js
git commit -m "chore(plugin): bind pet public contract blockers"
```

### Task 5: Verify the repository and record the external boundary

**Files:**
- Modify only if verification exposes a regression covered by this plan.

- [ ] **Step 1: Run frozen dependency verification**

Run: `bun install --frozen-lockfile --ignore-scripts`

Expected: success with no lockfile change.

- [ ] **Step 2: Run the complete repository check**

Run: `bun run check`

Expected: all build checks, package builds, validation, Skill API checks, workspace typechecks/tests, companion builds, Marketplace Kit check, repository tests, Official v2 build, and Builtin bundle pass. Validation may report Pet as `BLOCKED`, but must not fail or publish it.

- [ ] **Step 3: Verify exact Pet packing fails closed**

Run: `bun run pack -- --kind plugin --id convax-pet --catalog node_modules/@convax/plugin-api/dist/generated/plugin-api.json`

Expected: non-zero with a publication-blocked error containing both request documents. This is the intended safety result, not a failed implementation.

- [ ] **Step 4: Verify repository state and diff scope**

Run: `git status --short && git diff --check && git log --oneline --decorate -8`

Expected: no unstaged implementation changes, no whitespace errors, and only the approved design/governance commits on `codex/convax-pet-decoupling`.

- [ ] **Step 5: Stop only at the real external gate**

Report that Phase A is complete and publication remains intentionally blocked until independent human review publishes both the generic Pet surface client and public Plugin UI foundation with trusted receipts. Do not inspect or modify Host source, fabricate approval, remove either request, or migrate Pet runtime/CSS against unpublished contracts.
