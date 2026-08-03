[English](README.md) | [简体中文](README.zh-CN.md)

# Convax Plugins and Marketplace

The official source registry, authoring kit, and release catalog for Convax
Plugins, portable [Agent Skills](https://agentskills.io/), and standard MCP
Servers. Published Skills
follow the open `SKILL.md` format and can be used by compatible agents such as
OpenAI Codex; they are not designed exclusively for Convax.

This repository lets people and AI agents start from a template and produce a
Plugin, Skill, or MCP Server that can be validated independently and published deterministically,
and downloaded safely by Convax. Package source is reviewed in Git, immutable ZIPs
are published through GitHub Releases, and GitHub Pages hosts the lightweight
Marketplace descriptor at
`https://microvoid.github.io/convax-plugins/marketplace.json`. Current clients use
Registry v2. Legacy Registry projections are not authored or published here.

![Animated previews of the Image Remix, Audiobook, and Ecommerce Image Skills](docs/assets/skill-showcases.gif)

Featured Skills can publish a poster and an animation beside their immutable
Release ZIP. Convax verifies that media through the separate Showcase index and
plays it in the catalog; the media never becomes part of the portable Skill.

## Quick start

Requirements: [Bun](https://bun.sh/) 1.3.14 or newer.

Install the complete workspace graph once. Every Plugin, Skill, and Tool owns its
dependencies in its own `package.json`; the root lockfile keeps the monorepo
reproducible without CI-specific package lists.

```sh
bun install --frozen-lockfile --ignore-scripts
```

```sh
cp -R templates/plugin-basic packages/plugins/my-plugin
# Replace every __TOKEN__ and implement package/index.html.
bun run validate
bun test
bun run pack -- --kind plugin --id my-plugin
```

For a Skill, start from the portable Skill template instead:

```sh
cp -R templates/skill-basic packages/skills/my-skill
# Replace every __TOKEN__ in convax-package.json, SKILL.md, and agents/openai.yaml.
bun run validate
bun test
bun run pack -- --kind skill --id my-skill
```

The generated Plugin ZIP has `manifest.json` at its root. A Skill ZIP has
`SKILL.md` at its root. No dependency install or contributor build script is run
while validating or packing a package.

Authoring source has exactly one publishable shape: package metadata uses
`convax.package/2`, and every Plugin manifest uses `convax.plugin/8`.
`convax.package/2` has no compatibility escape hatch. Its explicit
publication eligibility is not portable package metadata. The sole owner is
`registry/host-capability-policy.json`, which reverse-binds every pending
`docs/host-capability-requests/*.md` request to exact package versions and a sorted
list of accepted Plugin API ids plus exact Catalog contract digests. Each
affected workspace independently declares the request id in
`package.json#convax.hostCapabilityRequests`, so rewriting business code cannot
silently erase the obligation. Normal source validation admits and reports these
blocked packages. Exact package packing rejects them; release selection and
Marketplace composition omit them and their owner/owned-Skill closure while
continuing with unrelated ready packages.

Current Official catalog omissions are declared separately in
`catalogs/excluded.json`. They keep reviewed source and immutable historical
Releases intact while removing the package identity and presentation from the
current Registry/Showcase through an exact-baseline selective publication.

One exact package version may carry up to 16 orthogonal request ids. Tooling
deduplicates and deterministically orders that blocker set; it never merges
requests or lets one decision receipt resolve another request. Resolving only a
subset leaves the remaining exact request ids publication-blocking.

Resolution is not a repository-local status edit. It requires a protected human
decision receipt, an immutable Host Release containing the exact generated Catalog
and runtime conformance evidence, exact matching accepted API contracts, and an
immutable attested decision Release. The
required-check verifier is loaded from protected base and treats author PR bytes
only as data. See
[`docs/host-capability-resolution.md`](docs/host-capability-resolution.md).

Plugin SDK provenance is a separate release gate, not capability approval.
Until the Host packages exist on npm, selected Plugin ZIPs use the reviewed
vendored workspace closure. One canonical artifact binds the protected Plugin
repository commit, frozen `bun.lock`, generated API Catalog, exact package
versions, dependency graph, installed workspace resolutions, and every admitted
vendored package byte. The environment-gated publisher checksums and attests that
closure with the release bytes. The npm-only provenance path remains present but
disabled until the public packages and immutable Host evidence exist. Neither
path grants or substitutes for Host capability approval. See
[`docs/sdk-authoring-contract-rollout.md`](docs/sdk-authoring-contract-rollout.md).

Immutable Registry history may still contain pre-cutover package and Plugin
schemas. Clients may continue reading that history, but templates, source
validation, packing, Marketplace builds, and release planning never admit those
schemas as a new publication candidate.

Plugin-owned Skill capability references are rendered from the installed
`@convax/plugin-api` and `@convax/plugin-sdk` packages during Marketplace Kit
build and publication. Check declarations and stable links without creating
generated source:

```sh
bun run skill-api:check
```

`contributes.skills[].uses.requiredHostApis` and `optionalHostApis` select only
SDK catalog APIs whose audience includes `agent-skill`. `uses.pluginTools` names
lower_snake_case Agent tool ids declared by that Plugin under
`contributes.agent.tools`; it does not name a raw generation tool, provider, or
Host API.

The generated `references/convax-capabilities.md` and
`references/plugin-capabilities.md` are reserved artifact paths and must not exist
in authoring source. They are part of both the portable Skill bytes and the owner
Plugin snapshot. They record the selected API subset, `since` versions, runtime
availability rules, and cross-Plugin import/export schemas. `SKILL.md` keeps only
stable index links. Installed Skill copies are never rewritten merely because the
Host upgrades.

## Create a third-party Marketplace

The public scaffold and Kit use the same Plugin, Skill, and MCP Server contracts
as this Official Marketplace:

```sh
bunx create-convax-marketplace@0.1.0 my-market \
  --owner my-org \
  --repository my-market \
  --starter mcp-server
cd my-market
bun run check
bun run build-index
```

Add another package with `bun run marketplace -- new plugin --id my-plugin`.
For a reviewed managed-stdio MCP companion, admit one target with
`bun run marketplace -- add-target packages/mcp-servers/example-mcp --target darwin-arm64 --file /path/to/reviewed-companion`;
the bare executable is copied into the private authoring input area and the source
path is never published.

Executable `convax.plugin/8` Tool Plugins may be headless. Declarative contributions
separate executable tools, model-picker entries, Agent tools, Canvas selection
actions, and Plugin-owned Skills. Local executable contributions
declare a separately installed bare `mcp-stdio` command and never embed that
executable, its dependencies, vendor credentials, or provider configuration. See
[`docs/plugin-authoring.md`](docs/plugin-authoring.md#declarative-tool-plugin).
For reviewed first-party tools, the Registry publishes exact
platform/architecture companion artifacts beside the ZIP. Convax verifies their
size and SHA-256 into host-owned storage, so users do not install a sidecar through
`PATH` and executables still never enter a Plugin package.

The v8 manifest may declare an LLM provider as bounded provider/model
metadata. It may opt into a fixed, bounded runtime model catalog while keeping
model ids opaque. The verified sidecar supplies that display catalog and a random,
Main-only loopback gateway at runtime; manifests and service projections never
contain upstream URLs, Cookies, headers, or credentials.

Executable Service contributions use the breaking
`convax.plugin-service-status/2` projection for account, current Plan, Billing/
Checkout availability, credits, and usage. A declared fixed `checkout` action
accepts only an advertised Plan Key; its canonical HTTPS URL remains Main-only and
is opened by the host in the system browser. Status v1 plugins must be upgraded
before they can load in the current Services surface.

A Plugin may also declare one self-contained OpenCode Hook module with `hooks`.
Convax snapshots and fingerprints its exact JavaScript bytes during an explicit
install or update, then lets OpenCode load that private snapshot. Hook events stay
native to OpenCode; Convax does not add another Hook API. Because this module is
executable Agent code rather than iframe content, default/background provisioning
never authorizes new Hook bytes. See
[`docs/plugin-authoring.md`](docs/plugin-authoring.md#agent-hooks).

`convax.plugin/8` Web entries bundle `createPluginHostClient` from
`@convax/plugin-sdk/client` at build time and use its `convax.plugin-host/8` ABI
with an explicit versioned `hostApi` declaration. Handwritten request envelopes,
pending maps, and MessagePort response dispatch are rejected. It supports Project/Canvas grants,
generic LLM display metadata, and one HTTPS remote Agent MCP endpoint. Convax
delegates that endpoint to OpenCode/the native MCP host,
including standard OAuth, while the remote service retains its own account and
authentication system. The declaration contains no local command, adapter, or
secret. Only bounded literal non-credential headers are allowed. Concrete Plugin,
Skill, and reviewed companion source remains in this repository rather than moving
into the Convax host.

Canvas UI in v8 has one canonical `commands` registry. `toolbar` and `menus` are
placement-only lists that reference those commands; command title, Host icon token,
and `renderer-message` target are never repeated or overridden at a placement. A
menu is limited to the owning node's `overflow`, and activating either surface
delivers the declared message only to that node's live sandbox renderer. It does
not grant Host API authority. Legacy inline toolbar or menu definitions are not
accepted. See
[`docs/plugin-authoring.md`](docs/plugin-authoring.md#canvas-commands-and-placements).

v8 image selection operations may declare one `editor: "immediate"` step with
the Host-rendered `cutout-scan` presentation. The referenced generic tool must
accept `reference_image` and return one image; the Host preserves the source and
owns the adjacent pending/result node lifecycle without branching on Plugin id.

v8 supports Canvas sink operations: a Web node can inspect pathless metadata
for directly connected media, while a manifest-declared local operation can bind
its Agent references to those exact incoming edges and return a bounded text result
without creating another Canvas node. Edge changes only refresh pending input
metadata; external transfer still requires an explicit user action.

`convax.plugin/8` supports Plugin-owned Skills. The Plugin declares
`contributes.skills`, and the packer injects each referenced standard Skill
workspace into the Plugin ZIP. Convax may show that Skill in its catalog, but its
install, update, and removal lifecycle belongs to the Plugin. The standalone Skill
ZIP remains portable to Codex and other Agent Skills clients. Because the same source
changes both archives, an owned Skill release must also bump and publish its owner
Plugin. Pages withholds an incomplete owner/Skill update and keeps their previous
published pair visible until both new Releases exist.

Each owned Skill may declare a minimal `uses` subset:
`requiredHostApis`, `optionalHostApis`, and `pluginTools`. The first two are
validated against the `@convax/plugin-api` catalog and top-level `hostApi`
declaration. `pluginTools` refers to the Agent-facing id in
`contributes.agent.tools`; the SDK renderer resolves that id to the underlying
Plugin tool description, while the runtime `tools/list` response remains
authoritative.

The v8 contract includes transport-neutral host capabilities, including a sandboxed
desktop pet feature. One Pet feature Plugin contributes static overlay and
settings surfaces plus a `convax.pet-library/1` packaged collection through
`contributes.pet`. The surfaces use the scoped `convax.pet-host/1` protocol; Convax
retains only the native window, content-free activity projection, validated
navigation, installed asset serving, and bounded persistence. See the working package in
[`packages/plugins/convax-pet`](packages/plugins/convax-pet).

See the working Web Plugin example in
[`packages/plugins/video-timeline`](packages/plugins/video-timeline), then read:

- [`docs/plugin-authoring.md`](docs/plugin-authoring.md) for the sandbox and host protocol;
- [`docs/video-timeline-plugin.md`](docs/video-timeline-plugin.md) for its connected-media and fullscreen Timeline contract;
- [`docs/panorama-viewer.md`](docs/panorama-viewer.md) for the Panorama Viewer source-ownership and clean-profile release boundary;
- [`docs/cutout-studio.md`](docs/cutout-studio.md) for the local model, companion, and adjacent-result contract;
- [`docs/storyboard-studio.md`](docs/storyboard-studio.md) for the episodic story files, character-card contract, Agent grouping workflow, and current host boundary;
- [`docs/storyai-3d-director-desk.md`](docs/storyai-3d-director-desk.md) for the 3D Director Desk source-ownership, upstream, and clean-profile release boundary;
- [`docs/skill-authoring.md`](docs/skill-authoring.md) for safe, portable Skills;
- [`docs/packaging.md`](docs/packaging.md) for ZIP and release rules;
- [`docs/registry-spec.md`](docs/registry-spec.md) for the client contract;
- [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request.

## Portable Skill boundary

For a Skill package, only the contents of `package/` are placed in the published
ZIP. That directory is a standard Agent Skill root: `SKILL.md` is required, while
`scripts/`, `references/`, `assets/`, and client metadata such as
`agents/openai.yaml` are optional. A compatible client may ignore metadata intended
for another client without changing the Skill workflow.

Do not add a `README.md`, installation guide, changelog, or publishing notes to an
individual Skill bundle. `SKILL.md` is the agent-facing entry point; repository and
marketplace documentation belongs outside `package/`. Likewise,
`convax-package.json` stays beside `package/`. It describes Convax catalog and
release metadata and is deliberately excluded from the portable Skill ZIP.

A Skill may name a host integration, but it must first use capabilities actually
available in the current session. Optional tool absence, denial, cancellation, or
failure must have an honest fallback: produce a useful handoff when possible, or
stop and identify the unavailable operation. Never invent a tool call or claim an
artifact, installation, or mutation succeeded when it did not.

## Install in Convax

Open **Settings → Skills and Plugins** in a compatible Convax build. The catalog is
loaded from the public Registry above; selecting **Install Plugin** or **Install
Skill** sends only the package id to Convax main, which downloads and validates the
corresponding immutable Release ZIP.
If a v8 Plugin declares Registry companions for a local runtime, the
same install transaction selects
only the exact local platform/architecture artifact and verifies its immutable URL,
byte count, and SHA-256 separately from the static ZIP.
Plugin-owned Skills are admitted and removed in that same Plugin
transaction;
they are never an independent Convax install action.

The `microvoid/convax-plugins` repository, Registry, and Release assets are public
and require no GitHub account or token. The main `microvoid/convax` application
repository may remain private without affecting package installation.

## Repository layout

```text
packages/plugins/<id>/
  package.json             # workspace dependencies and contributor scripts
  convax-package.json      # Convax publishing metadata; excluded from the ZIP
  package/                 # ZIP root; manifest.json must be here
packages/skills/<id>/
  package.json             # workspace dependencies and contributor scripts
  convax-package.json      # Convax publishing metadata; excluded from the ZIP
  package/                 # portable Skill root; SKILL.md must be here
  showcase/                # optional catalog poster/animation; excluded from ZIP
packages/mcp-servers/<id>/
  server.json              # standard MCP identity/version and fixed HTTPS profile
  convax-mcp.json          # managed-stdio only
packages/tools/<id>/       # reviewed Tool workspace; separately distributed
templates/                 # copy-only author starters
tooling/                   # validation and deterministic ZIP
dist/                      # generated; never committed
```

## Commands

```sh
bun run validate            # validate all source packages
bun run pack -- --kind plugin --id video-timeline # pack one current-format package
bun run workspaces:build:packages # build self-contained Skill/Plugin package trees
bun run workspaces:typecheck # type-check workspaces that declare the script
bun run workspaces:test     # test workspaces that declare the script
bun test                    # validator, ZIP, Registry, and protocol tests
bun run skill-api:check     # validate owned-Skill SDK inputs, reserved paths, and stable links
bun run build:companions    # compile explicitly reviewed platform targets
bun run marketplace:check  # fail-closed authoring validation through the packed Kit
bun run marketplace:build  # fail-closed Registry v2, Release, Builtin, and lock-input build
bun run check               # complete fail-closed local CI sequence
```

Marketplace publication consumes the public authoring contracts
`@convax/plugin-api@2.0.0`, `@convax/plugin-sdk@0.1.1`, and
`@convax/marketplace-kit@0.2.2`. Local source links are validation aids, not valid
publication dependencies. All three exact packages must be available from the
configured registry before a clean frozen install or publication can succeed.
See the [SDK authoring rollout blocker](docs/sdk-authoring-contract-rollout.md).

Authors change a Plugin, Skill, or MCP Server version and merge through protected `main`;
they do not create release tags. The default-branch workflow rejects changed bytes
without a version change, builds deterministic artifacts in a low-privilege job,
then lets a minimal privileged job tag and publish only those verified bytes.
Registry v2, Showcase v2, and the immutable Builtin bundle are generated rather
than hand-edited; no Registry v1 authoring or publication path remains.

`bun run check` admits policy-consistent blocked source and reports it explicitly.
It still fails closed when source uses an obsolete package or Plugin schema, a
request declaration/policy/document binding is missing, an owned Skill reference
is stale, or a declared Host API or Agent tool is unknown. Exact packing rejects a
blocked target. Marketplace and release outputs contain only ready closures and
emit machine-readable omission diagnostics for blocked versions.

## Troubleshooting installation

- `Redirect was cancelled` indicates an older Convax host that did not adapt
  Electron's manual redirect behavior for GitHub Release downloads. Update to a
  build containing the Electron Release redirect adapter.
- `Unable to connect` usually indicates a proxy, DNS, firewall, or offline problem.
  Verify that both the Registry URL and the package's `artifact.url` are reachable
  from the same machine.
- HTTP `404` or `403` should be checked against the public URLs in the Registry. No
  request should depend on access to the private Convax application repository.
- A size, SHA-256, schema, compatibility, or ZIP validation failure is intentional
  fail-closed behavior. Do not bypass it; inspect the published Registry entry and
  Release asset instead.

## Trust boundary

Third-party Plugin ZIPs are inert during validation and packing. Web surfaces are static HTML/CSS/JavaScript
rendered by Convax in an iframe with exactly `sandbox="allow-scripts"`; they cannot
contain native executables, Node/Electron code, network permissions, or a generic
host bridge. A current `convax.plugin/8` Tool Plugin may name a separately installed external command.
Convax resolves and fingerprints it during explicit Plugin install/update; that
transaction is consent to the exact binding, so later calls do not show a separate
command prompt. It never becomes part of the ZIP. A Registry companion is an
independent immutable Release asset,
admitted only after exact target, size, and digest verification. Every host call is
scoped to the mounted Plugin node and checked
against the manifest capability allowlist. Skills are instructions, not executable
capability grants.

The explicit exception is a manifest-declared `hooks` module: one bundled
JavaScript ESM file executed as a native OpenCode Plugin. Installation consent is
bound to its normalized manifest and exact bytes; OpenCode loads only a private
host snapshot. It is not sandboxed, so silent default installation or background
updates cannot authorize it.

A `convax.plugin/8` remote Agent MCP contribution is different: it names only an HTTPS endpoint
that the native Agent host connects through its standard MCP/OAuth support. It does
not authorize iframe networking, ship a local command, or carry credentials.

## License

Repository tooling and templates are MIT licensed. Each submitted package must
declare its license and include notices its dependencies require.
