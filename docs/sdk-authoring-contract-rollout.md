# SDK authoring contract rollout blocker

Status: temporary vendored workspace publication active; npm/immutable Host evidence still unavailable

## Problem

- `convax-plugins` admits only `convax.package/2` and `convax.plugin/8`
  authoring input through the Host-owned SDK and Marketplace Kit.
- The required dependency versions are `@convax/plugin-api@2.0.0`,
  `@convax/plugin-sdk@0.1.1`, and `@convax/marketplace-kit@0.2.2`.
- As of 2026-07-31, npm returns 404 for Plugin API and SDK and does not yet expose
  Marketplace Kit `0.2.1`. A clean frozen install therefore cannot
  reproduce the approved local package set.

## Use case

- Plugin authors need one parser and canonical TypeScript model for manifests,
  package metadata, generated schemas, Marketplace discovery, packing, and Host
  installation.
- `convax-plugins` still owns repository-specific publication state, owned-source
  closure, companion-source closure, inert file collection, release identity, and
  digest checks.
- Parser failures must be deterministic, path-addressable, and safe to print in CI.

## Requested generic capability

Publish the three approved packages without changing their frozen public
contracts:

- `parsePluginManifestV8(value: unknown): PluginManifestV8`;
- `discoverMarketplacePackages(root)`, which owns package/2 parsing and returns
  canonical authoring metadata and parsed v8 manifests;
- canonical types for Canvas commands, toolbar/menu references, owned-Skill
  `uses`, and Plugin capability imports/exports;
- one portable validator surface for ids, SemVer ranges, relative package paths,
  localized text, and Host tokens used by those canonical types;
- deterministic Host API and Plugin capability reference renderers;
- deterministic Marketplace package, Registry v2, Showcase v2, bundle, and
  release-plan generation.

The SDK must define the exact `contributes.capabilities` import/export shape,
including required and optional imports, version-range grammar, availability
semantics, export contracts, and the rule that selects exports relevant to an
owned Agent tool. The Skill reference generator cannot safely invent these types.

## Alternatives considered

- Keep the repository parser: rejected because it already contains v1-v8 branches
  and duplicated portable validators.
- Copy the Host parser or inspect Host private source: prohibited by the repository
  boundary and would preserve the same drift problem.
- Commit `file:` dependencies or sibling Host paths: rejected because the source
  tree and lockfile would not be independently publishable.
- Pretend `0.1.1` is compatible: rejected because it does not expose the frozen
  v8 parser/reference/Registry v2 contract.
- Publish from an unbound local or sibling symlink: rejected because it would not
  identify the consumed bytes. The temporary selected alternative is the committed
  vendored workspace plus a canonical closure artifact that proves exact lock,
  resolution, Catalog, package versions, and package bytes.
- Treat Canvas UI and capability contributions as unvalidated objects: rejected
  because malformed refs, ranges, or targets would reach publication.

## Security and lifecycle

- Accept `unknown` and reject unknown fields, legacy source schemas, malformed
  ranges, unreferenced UI commands, undeclared capability imports, and unsafe
  portable paths.
- Parsing must be pure: no filesystem, network, executable loading, credential
  access, or ambient Host state.
- Parsed values must not retain mutable caller-owned nested objects.
- Stable errors must contain no package bytes or secret values.

## Compatibility

- New source admission accepts only package/2 and plugin/8.
- Historical Registry parsing remains in the Registry consumer package and is not
  re-exported as an authoring path.
- Source dependencies are pinned exactly and contain no `file:` override.
- The npm lockfile cannot be truthfully finalized until all three exact packages
  are available from the configured public registry. Until then the committed
  lock must resolve only the reviewed vendored workspaces and publication must
  bind those exact bytes through `convax.vendored-host-package-closure/1`.

## Acceptance tests

- package/1 and plugin/1-v7 fail every authoring entrypoint.
- package/2/plugin/8 with canonical Canvas commands and capability contracts parse
  identically in SDK, Kit, Host installation, and this repository.
- Unknown UI commands, legacy toolbar fields, invalid menu placement, malformed
  capability ranges, unknown imports/exports, and capability-reference drift fail
  closed.
- `convax-plugins` contains no manifest schema switch for v1-v7 and no duplicate
  SemVer/id/path/localized-text validator after integration.
- A generated Skill reference changes deterministically when a relevant capability
  import/export changes, and `--check` catches invalid inputs.
- A clean `bun install --frozen-lockfile --ignore-scripts` resolves the three
  exact npm versions with no `file:` dependency or sibling link.

## Publication boundary

- Local or sibling source links prove only that the current implementation can be
  exercised during development. Protected publication accepts only committed
  vendored bytes whose exact installed workspace resolutions and digests appear
  in the canonical closure artifact.
- This file is intentionally outside `docs/host-capability-requests/`; it is not a
  Host capability request and cannot change package publication policy.
- The npm migration remains blocked until the three exact npm versions are
  publicly resolvable, a clean frozen install succeeds without workspace links,
  and the committed lockfile records that public dependency closure. This no
  longer blocks the explicitly selected temporary workspace publication mode.
- Follow-up owner: Host package publisher, then the `convax-plugins` lockfile and
  release owner.

## Implemented consumer gates

The active `CONVAX_PLUGIN_SDK_SOURCE=workspace` gate refuses every selected
Plugin release unless the root declarations and frozen lock resolve the five
exact vendored Host packages (`marketplace@0.2.1`, `marketplace-kit@0.2.2`,
`plugin-api@2.0.0`, `plugin-sdk@0.1.1`, and `plugin-ui@0.1.0`), installed direct
and transitive paths resolve to those directories, the API Catalog is contract
v3 at `2.0.0`, the package manifests and dependencies match the admitted closure,
and every non-`node_modules` file is a bounded regular non-symlink byte included
in the package digest. The low-privilege job writes this evidence to
`dist/vendored-host-package-closure.json`; the artifact-only publisher validates
its closed schema and commit, includes it in `PUBLICATION-SHA256SUMS`, and attests
it with the selected release bytes.

The dormant npm gate in `release-on-main.yml` refuses every selected Plugin release
unless all of the following are true:

1. the committed root `bun.lock` resolves exactly one
   `@convax/plugin-sdk` and one `@convax/plugin-api` from
   `https://registry.npmjs.org`, with exact stable versions and SHA-512 SRI;
2. root declarations and the lock agree, install uses
   `--frozen-lockfile --ignore-scripts`, and the lock remains byte-identical;
3. the SDK npm tarball is byte-identical to the immutable
   `plugin-sdk-v<version>-<commit>` Host Release and its closed
   `convax.host-package-release/1` manifest;
4. the release-time API tarball/Catalog match that SDK manifest, while the actual
   locked API independently matches its immutable
   `plugin-api-v<version>-<commit>` runtime-conformance Release;
5. every Host Release payload has an exact `<asset>.sigstore.json` bundle and
   passes immutable Release verification, asset verification, pinned Cosign
   v3.0.6 keyless verification, and default Public Rekor inclusion verification
   for the exact protected workflow, `convax-next` source ref, Host commit,
   `workflow_dispatch` trigger, GitHub OIDC issuer, and GitHub-hosted runner;
   the canonical verification manifest additionally binds repository id
   `1293264965` and owner id `125447777` from both live GitHub metadata and
   bounded Fulcio certificate claims;
6. the actual API version satisfies the range inside the exact SDK tarball; and
7. every selected Plugin ZIP receives canonical
   `convax.plugin-bundle-provenance/1` evidence binding the lock digest, npm URLs,
   tarball SRI/SHA-256, Host release identities, package manifest, source
   entrypoints, and final ZIP bytes.

The environment-gated publisher does not check out source or execute Bun, Node,
Git, npm, or repository scripts. It consumes the uploaded candidate, verifies the
complete checksum manifest and closed statements, attests the bundles/statements/
checksums together, and rejects every existing tag or Release version.

`host-capability-governance.yml` runs the high-water checker first and then invokes
the protected-base copy of `plugin-publication-policy.mjs` against candidate bytes.
That ordering prevents a candidate from weakening its own SDK gate or treating an
SDK package Release as capability approval.

Once Host publishes the exact npm and immutable Release assets and their Sigstore
bundles, the release owner must change the explicit source selector to `npm`,
remove the SDK/API workspace resolution, pin the public versions, regenerate the
committed root lock with the official npm registry, and run a no-change frozen
install. npm SHA-512 SRI and byte identity are mirror consistency evidence only;
the Host Sigstore bundle is the package-origin trust chain.
