---
name: convax-plugin-authoring
version: 0.1.3
description: Create, modify, or debug a Convax Plugin. Use for Plugin manifests, Web assets, contributions, owned Skills, companion integration, Host API availability, protocol failures, and missing-capability design in a Convax Plugin repository.
---

# Convax Plugin Authoring

Keep concrete integration work in the current Plugin repository. Treat the
catalog and reference renderer exported by the installed `@convax/plugin-api` as
the only authoring-time Host API authority. Treat `@convax/plugin-sdk` as the
authority for inter-Plugin capability declarations and generated references.

1. Read the repository contract, Plugin manifest, package publication state, and
   installed SDK versions used by the build and release environment.
2. For every Host call, verify the exact API id, catalog major, `since`,
   `audience`, grant, scope, side effect, errors, and documentation. A Web Plugin
   may use only APIs whose audience includes `web-plugin`; an Agent Skill may use
   only APIs whose audience includes `agent-skill`.
3. Declare required and optional APIs precisely in `hostApi`. Use
   `host.context.get` availability results for runtime negotiation and fail closed
   when a required API is unavailable. Never reuse a legacy protocol or invent an
   undeclared method as a fallback.
4. In a Web Plugin, use portable relative URLs for the entry document and every
   HTML/CSS/JavaScript subresource. Never use root-relative, absolute,
   Plugin-id-derived, or version-derived asset URLs; they omit the immutable
   snapshot identity and must fail closed. Import `createPluginHostClient` from
   `@convax/plugin-sdk/client` in author source and bundle it through the
   repository's shared Web-client build helper. Never construct Host request or
   response envelopes, call the transferred port directly, or maintain a second
   pending-request state machine.
5. If the generic capability or contribution point is absent, stop Host-dependent
   implementation. Do not inspect, edit, or switch to the Host repository. Create
   a structured proposal in the current Plugin repository using
   [the Host capability request template](references/host-capability-request.md),
   add the request id to each affected workspace's
   `package.json#convax.hostCapabilityRequests`, bind those exact package versions
   in `registry/host-capability-policy.json`, and hand the proposal to a human
   reviewer. A v2 policy request carries sorted `acceptedApiContracts`; use an
   explicit empty list until a human has accepted exact API ids and Catalog
   contract digests. Never infer accepted digests from a writable Host checkout or
   from a business-code rewrite.
6. Follow the generated result contract, not a guessed broader meaning.
   `canvas.inputs.open` is a valid audio/video stream API and admits only
   `probe.kind: "audio" | "video"`; image bytes require the pending image-input
   request. A `convax.pet-host/1` contribution always requires the pending SDK
   Pet-client request because that gap is explicit in the Manifest. Do not hide a
   known gap through a source rewrite, and do not fabricate a Host request for a
   new Plugin that uses only existing Catalog APIs.
7. Never remove or rename a pending request to unblock a package. The protected
   CI/release gate retains every pending request, its normalized semantic core, and
   each affected package identity from protected main across version bumps.
   Catalog evidence may refresh, but changing the problem, requested contract,
   authority, compatibility, acceptance tests, or Plugin-side plan must fail.
   Renaming or copying a package that already carries a pending dependency does
   not reset that gap.
8. Resume Host-dependent implementation only after an explicit human decision,
   a protected external receipt accepted by the repository's human-owned
   governance verifier, and an updated `@convax/plugin-api` catalog that contains
   the approved API. The Catalog must use exactly
   `convax.plugin-api-catalog/3`. The receipt must come from the protected
   default-branch workflow, bind the request semantic digest, affected identities,
   exact Host PR/commit, published npm tarball/integrity, Catalog version/SHA-256
   and strictly parsed `convax.plugin-api-runtime-conformance/1` evidence, and be
   published as an attested immutable Release. The closed conformance check set
   must be all-passed and include the exact Plugin asset-protocol CSP suite.
   For an API-backed request, the protected policy and receipt must contain the
   same sorted accepted API ids and exact Catalog `contract.digest` values; every
   named API must exist unchanged in the receipt-bound Catalog. Whole-Catalog
   SHA-256 alone is insufficient.
   Catalog, tarball, and conformance assets must each be attested by the protected
   Host release workflow for the exact Host commit; an evidence field that merely
   names that workflow is insufficient. The package tarball must contain the exact
   Catalog bytes. A later resolution PR keeps the append-only receipt tombstone; it
   cannot author, replace, or locally approve the receipt. Re-run protocol
   conformance, package tests, structural validation, SDK reference input checks,
   and release gates. A Host API receipt does not prove `@convax/plugin-sdk`
   provenance; when the Plugin bundles the SDK client, require a separately
   protected, npm-identical SDK release bound to the exact API version and Catalog
   digest rather than accepting repository-local SDK bytes.
9. Treat SDK provenance as a release concern independent from Host capability
   approval; it is never part of request resolution. A local vendor workspace can
   support development, but it can never authorize a Plugin Release. Before
   publication, require the root frozen lock to
   resolve exact npm `@convax/plugin-sdk` and `@convax/plugin-api` tarballs, verify
   the immutable protected Host package/API Releases and their attestations, and
   bind the actual closure plus source manifest, build entrypoints, and final
   Plugin ZIP in canonical `convax.plugin-bundle-provenance/1` evidence. The actual
   locked API must satisfy the SDK tarball range and must have its own runtime
   evidence even when it differs from the SDK release-time API baseline. Missing
   npm bytes, workspace/file/Git resolution, lock mutation, evidence drift, an
   existing version, or network verification failure blocks publication. Never add
   SDK package evidence to a capability request or decision receipt.

Repository CODEOWNERS and the protected
`plugin-marketplace-production` and `plugin-host-capability-governance`
environments are required external controls. The governance Environment must
require named reviewers, prevent self-review and administrator bypass, and both
Host and Plugin repositories must enable immutable Releases. The repository
ruleset must require a named human code-owner, dismiss stale approvals, reject bot
approval, require the protected-base governance check, and prevent a candidate
change from approving its own checker.

For every Plugin-owned Skill, keep the two stable `SKILL.md` links but never author
`references/convax-capabilities.md` or
`references/plugin-capabilities.md`. Marketplace Kit injects those reserved files
from the SDK renderers during build and publication so the exact bytes participate
in the Skill and owner Plugin digests. Do not copy generated API or capability
tables into this file.
