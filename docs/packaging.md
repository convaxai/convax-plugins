# Packaging and publishing

Repository tooling reads package files as inert bytes. It never runs a package's
scripts, installs its dependencies, or follows symlinks.

The repository is a Bun monorepo. Every Plugin, Skill, and Tool owns a workspace
`package.json`, while one root `bun.lock` freezes the complete dependency graph.
CI runs one `bun install --frozen-lockfile --ignore-scripts`; validation and packing
remain separate inert-byte operations and never install dependencies themselves. A
trusted `workspaces:build:packages` phase runs first for workspaces that declare
`build`; each build must emit a complete self-contained `package/` tree. Released
archives never contain `node_modules` and installation never runs a package manager.

## Source and ZIP roots

```text
packages/<kind>/<id>/convax-package.json  # catalog metadata, not shipped
packages/<kind>/<id>/package.json         # workspace dependencies/scripts, not shipped
packages/<kind>/<id>/package/             # exact ZIP root
packages/<kind>/<id>/showcase/            # optional catalog media, not shipped
packages/mcp-servers/<id>/server.json     # standard MCP identity and version
packages/mcp-servers/<id>/convax-mcp.json # managed-stdio only; never HTTP
```

Plugin ZIPs require root `manifest.json`; Skill ZIPs require root `SKILL.md`.
Entries are sorted by UTF-8 path, stored with fixed timestamps/modes, and use the ZIP
STORE method. Thus identical source bytes produce identical SHA-256 digests across
machines. Uncompressed storage is intentional: packages are already size-bounded,
and avoiding compressor-version drift makes releases reproducible.

New Plugin and Skill source uses only `convax.package/2`. Every source package has
no portable publication field. `registry/host-capability-policy.json` is the sole
policy owner and reverse-binds every pending Host capability request to exact
package versions plus its sorted accepted Plugin API ids and exact Catalog
contract digests. Every affected workspace independently lists the request id in
`package.json#convax.hostCapabilityRequests`; tooling requires an exact two-way
match before deriving blocked state in memory. Normal source admission reports
blocked packages without publishing them. Exact packing rejects a blocked target;
Marketplace and release selection omit the blocked owner/owned-Skill closure and
continue with unrelated ready packages. New Plugin manifests use only
`convax.plugin/8`; older manifests are explicit rejection-test fixtures only.

The reverse binding is a bounded set: one exact package version may list at most
16 unique, orthogonal request ids. Derived blockers are deterministically sorted
and retain every request even when several requests use the same blocker code.
Each request is resolved and receipt-verified independently; partial resolution
keeps the remaining requests blocked.

The protected CI/release path runs `tooling/host-capability-history.mjs` against
the exact prior protected-main commit before version selection. Every pending
request and affected package identity from that base is monotonic until an
externally issued human receipt passes the immutable-Release and workflow
attestation verifier. The normalized request semantic core is also monotonic while
generated Catalog evidence may refresh. Simultaneously
deleting declarations, rewriting the pending contract, or copying a blocked
implementation to a new Plugin id cannot produce a ready release. New and renamed
Plugin identities enter pending human review by default.

`.github/CODEOWNERS` covers the governance and publishing paths. The
`pull_request_target` governance job executes the checker from protected base and
never executes candidate code; configure it as a required status check. Host
decisions use `plugin-host-capability-governance`, while the publish job declares
`plugin-marketplace-production`. Branch protection must require a named human
code-owner, dismiss stale approvals, reject bot approval, and require current CI.
Both Environments must be protected, and immutable Releases must be enabled for
the Host and Plugin repositories. Those remote settings remain mandatory external
controls and must be verified outside repository source.

A headless `convax.plugin/8` local Tool Plugin may contain only `manifest.json` and
a license notice. It still declares
`hostApi: {"major":2,"required":[],"optional":[]}` and must not claim Web APIs.
Its executable contributions use one declared `mcp-stdio` executable that is a
separate distributable and must never appear anywhere below `package/`; validation
and packing do not install, build, or execute companion source under
`packages/tools/`.

## Pet feature Plugin assets

A `convax.plugin/8` Pet feature package remains inert, offline Web content. Its ZIP
contains the manifest, license, documentation, static overlay and settings pages,
browser JavaScript/CSS, a `convax.pet-library/1` document, and its referenced PNG
or WebP atlases. The manifest's `contributes.pet` object names the packaged library
and both static surfaces. The ZIP must not contain a runtime, executable,
dependency tree, installer, remote script, or server. The Plugin uses the narrow
`convax.pet-host/1` surface protocol; a top-level Web entry would instead use the
`@convax/plugin-sdk/client` `convax.plugin-host/8` ABI.

For `spriteVersion: 2`, the sprite sheet is exactly 1536×1872 pixels: eight columns
of 192-pixel cells and nine rows of 208-pixel cells. The ordinary 2 MiB per-file
limit still applies. Keep asset paths package-relative and let Convax inspect
dimensions, format, transparency, and decoded image safety before installation.
The Plugin owns presentation, animation rules, collection, and selection. The host
owns the native floating window and exposes only bounded, content-free Agent
activity data.

## Remote Agent MCP metadata

A v8 remote `contributes.agent.mcp` Plugin may also be manifest-only, but it has no
companion or local command for that contribution. The manifest contains only an
HTTPS endpoint, OAuth mode, and optional bounded literal non-credential headers;
never package credentials, tokens, local executables, or an adapter. OpenCode/the
native host owns the remote connection and standard OAuth flow. A pure headless
remote MCP Plugin explicitly declares
`hostApi: {"major":2,"required":[],"optional":[]}`. The concrete manifest and any
owned Skill source remain under this repository's package workspaces.

The matching source metadata declares the reviewed tool directory and build output
for each target. For example:

```json
"companions": [{
  "command": "creative-tools-mcp",
  "version": "1.2.3",
  "source": "packages/tools/creative-tools-mcp",
  "targets": [{
    "platform": "darwin",
    "arch": "arm64",
    "path": "dist/darwin-arm64/creative-tools-mcp"
  }]
}]
```

`source` is exactly one workspace below `packages/tools/`; target `path` is relative to it.
Both are publishing inputs and never enter the Registry or Plugin ZIP. Packing
rejects missing files, symlinks at any path component, non-files, oversized files,
non-executable POSIX artifacts, duplicate targets, and files resolving outside the
reviewed source. It derives size and SHA-256 from the bytes it copies rather than
trusting contributor-authored values.

Each reviewed tool exposes one `build:release:<platform>-<arch>` package script per
declared target. `bun run build:companions` discovers those declarations and invokes
only that fixed reviewed script name (never a command supplied by package metadata),
then immediately applies the same path, symlink, executable-mode, size, and digest
admission checks used by packing.

A reviewed Bun companion may publish a bundle beginning exactly with
`#!/usr/bin/env convax-bun`. Compatible Convax hosts run that verified script through
their app-owned shared Bun runtime, avoiding one embedded Bun runtime per companion.
The script remains an immutable executable Release asset and follows the same target,
mode, size and SHA-256 checks as a native companion. Native companions remain valid.

## Plugin-owned Skill composition

A `convax.plugin/8` manifest may declare `contributes.skills` entries such as:

```json
{
  "name": "ffmpeg-canvas",
  "path": "skills/ffmpeg-canvas",
  "uses": {
    "pluginTools": ["run_video"]
  }
}
```

The named Skill remains an independent workspace and standard portable Skill
package. Its `convax.package/2` source metadata declares `ownerPluginId`. Any Host
API required by the Skill must be top-level required; an optional Skill API may be in
either top-level list. Every selected API must have `agent-skill` audience in the
catalog exported by `@convax/plugin-api`. Web-only Host APIs must never leak into the Skill.
`pluginTools` names lower_snake_case Agent tool ids from
`contributes.agent.tools`, not the underlying generation tool ids.

The Plugin directory must not contain a copied Skill tree. Discovery verifies the
two ownership declarations, reads the Skill workspace as inert bytes, and injects
those bytes below the declared Plugin ZIP path. The resulting ZIP is deterministic,
while the source of truth remains singular. npm workspace dependencies are build
relationships only and never imply Convax lifecycle ownership.

The authoring check renders both generated references in memory from the installed
SDK packages and validates the two stable `SKILL.md` links:

```sh
bun run skill-api:check
```

Authors must not create `references/convax-capabilities.md` or
`references/plugin-capabilities.md`; both are reserved generated paths.
`@convax/marketplace-kit` injects them from the canonical
`renderPluginApiReference` and `renderPluginCapabilityReference` functions during
build and publication. The first page records Host API catalog version, `since`,
availability, and Plugin tools; the second records cross-Plugin imports, compatible
version intervals, exports, operations, and closed schemas. Missing, unknown,
Web-only, or malformed declarations fail closed.

Generated references are artifact bytes, not authoring source, and they are not
rewritten in an installed Skill when the Host upgrades. Changing an owned Skill,
its manifest declaration, or an SDK-rendered reference changes both its portable
Skill ZIP and the owner Plugin ZIP. Both versions must be bumped and released.
Catalog deployment recomputes every deterministic ZIP and requires its size and
SHA-256 to match the immutable Release entry, preventing an old owner Plugin from
being paired with a newer Skill presentation artifact.

Scanning authored Markdown for copied API ids, prose metadata, or schemas is a
drift-prevention lint, not a security boundary. The publication boundary is the
reserved generated paths, SDK renderer build-time injection, and the resulting
portable Skill and owner Plugin snapshot digests.

Paths must be portable POSIX relative paths. Symlinks, traversal, control characters,
Windows device names, alternate data streams, case/Unicode-normalization collisions,
files over 2 MiB, combined packages over 10 MiB, Plugin inventories over 2,000
entries, and Skill inventories over 512 entries are rejected. Runtime CDN URLs, executable file
modes, native extensions, shebang scripts, and packaged Node/server entrypoints are
rejected for Plugins.

## Local output

Run the explicitly reviewed companion build before packing packages that declare
one; packing itself never executes tool source:

```sh
bun run build:companions
bun run skill-api:check
bun run pack
```

`bun run pack -- --kind plugin --id hello-convax` writes only the selected
deterministic package artifacts below `dist/packages/`. Generated owned-Skill
references are injected from the exact external Catalog and SDK renderers before
the ZIP digest is computed. A package with `companions` additionally emits the
declared target assets. It does not generate a second Registry or Showcase parser.

`bun run marketplace:check` runs Catalog-bound preflight and Marketplace Kit
validation. `bun run marketplace:build` is the sole official v2 composition path:
it produces Registry v2, Showcase v2, grouped immutable Release assets, the Builtin
bundle, and product-lock input. `bun run marketplace:verify` independently closes
those outputs before publication.

## Protected default-branch release

Authors change an extension's identity version and merge through the protected
default branch. The low-privilege job compares the Git tree recorded by the
currently deployed Registry v2 metadata Release with the protected-branch candidate,
rejects any changed package bytes whose version did not change, runs the complete
check, verifies SDK-owned Skill reference inputs and generated artifact bytes,
omits blocked exact versions into an explicit diagnostics artifact, continues with
unrelated ready versions, and uploads only the exact verified publication plan and
artifacts.
A separate minimal
high-privilege job consumes those bytes, creates the deterministic tag, attests the
artifacts, and publishes the immutable Release. Pull requests never receive release
credentials and `pull_request_target` is not used.

The current protected release selects `CONVAX_PLUGIN_SDK_SOURCE=workspace`
because the required Host authoring packages are not yet available from npm.
For every selected Plugin, the low-privilege job emits one canonical
`convax.vendored-host-package-closure/1` artifact. It rejects lock/workspace
version drift, unexpected Host package directories, symlinks in admitted package
bytes, installed dependency paths that do not resolve to the exact vendored
directories, Catalog contract drift, and package byte drift. The publisher runs
no repository code; it validates the closed artifact shape, binds it through
`PUBLICATION-SHA256SUMS`, and attests it with the immutable release assets.
The dormant npm path retains the stronger Host Release and Sigstore checks for
the later registry migration. Workspace delivery never resolves or bypasses a
Host capability request.

Plugin and Skill tags retain `<kind>-<id>-v<version>`. Namespaced MCP Server ids are
never embedded in native paths or tags; the release tag uses the stable hashed item
key emitted by the Kit. Published versions are
immutable; never move or reuse a tag. Change bytes by publishing a higher SemVer. To
disable a compromised version for new installs, publish a reviewed higher package
version with `yanked: true`. Existing immutable assets remain available for
inventory, recovery, and audit.

The serialized workflow fetches and strictly validates the complete current v2
production closure: descriptor, Registry, Showcase, and immutable metadata
Release. Initial publication uses an explicit empty marker; a missing or malformed
deployed v2 closure otherwise stops publication. The Kit then writes
one grouped directory per immutable package Release plus one content-addressed
Registry metadata Release. A changed Storyboard source also publishes the matching
Builtin bundle Release. The privileged job consumes only those verified directories,
supports exact-byte retry recovery, and invokes the reusable Pages deployment before
releasing the repository-wide publication lock. Every protected-main push rebuilds,
reverifies, and redeploys the current Pages catalog even when the selected
package-version plan is empty. Existing immutable Releases are accepted only after
an exact-byte comparison. This lets a reviewed publication-workflow repair restore
the descriptor, Registry v2, and Showcase without inventing a package version
change or bypassing the ordinary release closure.

The one-time Plugin v8 cutover additionally admits only the pinned production
Registry sequence 55 and revision
`47c67a00afd6d3d5aba9373eab742f14597100945ef4d29873ff799bc001521f`.
Its package-array digest, descriptor URLs, identities, and versions are checked
before use. Every legacy identity must remain in source and advance to a new
immutable version; blocked packages are then omitted through the normal
publication policy. The replacement v8-only Registry is sequence 56. Any other
legacy closure fails closed, and later v8 publications return to the ordinary
strict selective path.

The production Registry is:

`https://microvoid.github.io/convax-plugins/registry/v2/index.json`

The matching presentation sidecar is:

`https://microvoid.github.io/convax-plugins/showcase/v2/index.json`

Each content-changing deployment advances from the validated production v2
sequence and binds its revision and immutable release identity to the exact
candidate bytes.
