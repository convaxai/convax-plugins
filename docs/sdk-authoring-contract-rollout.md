# SDK authoring contract rollout blocker

Status: rollout design record only; not a capability approval or publication receipt

## Problem

- `convax-plugins` admits only `convax.package/2` and `convax.plugin/8`
  authoring input through the Host-owned SDK and Marketplace Kit.
- The required dependency versions are `@convax/plugin-api@1.0.0`,
  `@convax/plugin-sdk@0.1.0`, and `@convax/marketplace-kit@0.2.0`.
- As of 2026-07-30, npm returns 404 for Plugin API and SDK and exposes
  Marketplace Kit only through `0.1.1`. A clean frozen install therefore cannot
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
- Keep local symlinks as a release solution: rejected; they are only a temporary
  validation mechanism and are not committed.
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
- The lockfile cannot be truthfully finalized until all three exact packages are
  available from the configured public registry. Publication remains blocked
  until a clean frozen install succeeds without sibling links.

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

- Local source links prove only that the current implementation can be exercised
  during development. They are not a human decision receipt and do not authorize
  publication.
- This file is intentionally outside `docs/host-capability-requests/`; it is not a
  Host capability request and cannot change package publication policy.
- The repository remains rollout-blocked until the three exact npm versions are
  publicly resolvable, a clean frozen install succeeds without sibling links, and
  the committed lockfile records that public dependency closure.
- Follow-up owner: Host package publisher, then the `convax-plugins` lockfile and
  release owner.
