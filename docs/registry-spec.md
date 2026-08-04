# Marketplace and Registry contracts

`marketplace.json` is the strict `convax.marketplace/1` descriptor for
`convax-official`. New Convax clients read its `convax.registry/2` and
`convax.showcase/2` links. Registry v2 is source-qualified by
`marketplaceId: "convax-official"` and supports `plugin`, `skill`, and
`mcp-server` as first-class kinds.

Every v2 item contains `kind`, `id`, `version`, Convax compatibility,
presentation, delivery, and yanked state. Plugin items retain their complete
validated manifest and companion closure; Skill items retain `ownerPluginId`.
Artifact delivery fixes an immutable Release URL, byte size, and SHA-256.
HTTP MCP delivery embeds the reviewed standard `server.json`, its digest, and one
normalized fixed HTTPS runtime. Managed-stdio delivery additionally embeds the
strict `convax-mcp.json` and an exact target-specific companion closure. MCP
metadata is not a ZIP and HTTP MCP never has a companion.

Each revision contains at most one current entry per `{kind,id}`. The sequence is
monotonic, and reusing one `{kind,id,version}` for changed metadata or artifact
bytes is invalid. Source history and installed immutable bytes, not a range
resolver, retain old versions.

## Source admission versus historical consumption

Source admission and Registry consumption are deliberately different contracts.
Every new Plugin or Skill Release candidate is admitted from
`convax.package/2`. New Plugin candidates additionally require
`convax.plugin/8`. Source metadata contains neither publication policy nor
`compatibility`. `registry/host-capability-policy.json` reverse-binds pending Host
capability requests to exact package versions and sorted accepted API
`{id,digest}` pairs, and tooling merges that policy before validation, packing,
Marketplace builds, or release selection.

The builder derives, rather than accepts, the Registry compatibility envelope:

- a current Plugin becomes `convax.plugin/8` +
  `convax.plugin-host/8`;
- a current Skill becomes `opencode.skill/1`.

Older schemas are rejected by this authoring repository. Historical consumption
belongs to the Host packages and is not reimplemented here. The Official builder
emits only Registry v2 and Showcase v2 through `@convax/marketplace-kit`.

The abbreviated manifest above is explanatory only; production entries contain the
complete validated manifest. Historical pre-v8 compatibility tuples may remain in
immutable Registry data, but only
`convax.plugin/8` + `convax.plugin-host/8` may be emitted for a newly admitted
Plugin candidate. The embedded manifest schema must match that pair. Crossed pairs
and an older compatibility envelope around a newer manifest are rejected. Skill
compatibility is exactly
`{"skillSchema":"opencode.skill/1"}`.
Artifact objects contain only `url`, `size`, and lowercase hex `sha256`; URLs always
target `convaxai/convax-plugins` Release assets.

## Pet feature Plugins

One Pet feature Plugin is a `convax.plugin/8` capability published through the
normal Plugin Registry item. Its complete embedded manifest contains
`contributes.pet` with package-relative `library`, `overlay`, and `settings` paths
plus `protocol: "convax.pet-host/1"`. It requests exactly `pet.activity.read`,
`pet.activity.open`, and `pet.preferences.write`, may additionally request the
exact `pet.custom.manage` grant, and has no runtime or companion executable.
Convax Pet 0.2.3 requests all four. Pet surfaces use their separately scoped
`convax.pet-host/1` protocol rather than the top-level Web Plugin ABI.

Clients validate both static surface entries, the strict `convax.pet-library/1`
document, and every referenced atlas before activation. Installation does not
imply waking the pet. The Plugin owns presentation and its packaged collection;
Convax owns only native windowing, activity projection, navigation validation, and
bounded persistence.

## Plugin-owned Skills

A Skill item may additionally contain `ownerPluginId`. This is lifecycle metadata
for Convax, not an Agent Skills field. The id must resolve to a Plugin item whose
current `convax.plugin/8` manifest contains a matching `contributes.skills` item.
Historical Registry consumption retains the equivalent relationship for immutable
v4 through v7 entries. The Registry is rejected if either side is missing.

Convax may show an owned Skill as a normal Skill detail with a “Provided by”
relationship, but install, update, and removal actions target the owner Plugin.
The Skill artifact remains a standard root-`SKILL.md` ZIP, so clients such as Codex
may still download and use it independently.

An owned Skill source change also changes the owner Plugin ZIP. Both package versions
must be bumped and released. The package workflow builds and verifies each immutable
artifact from its exact tag. During catalog publication, an incomplete current
owner/Skill group is withheld and the previous published pair remains selected; the
new group becomes eligible only after all of its current source tags have Releases.

```json
{
  "kind": "skill",
  "id": "ffmpeg-canvas",
  "ownerPluginId": "ffmpeg-tools"
}
```

Each v8 owned-Skill contribution may declare:

```json
"uses": {
  "requiredHostApis": [],
  "optionalHostApis": [],
  "pluginTools": ["run_video"]
}
```

`uses` and each child list are optional. A Skill Host API must be a subset of the
owner manifest's top-level `hostApi` declaration and must have
`agent-skill` in its audience in the catalog exported by `@convax/plugin-api`.
Unknown APIs fail closed; Web-only Host APIs are never copied into an Agent Skill.
`pluginTools` must name lower_snake_case Agent aliases from
`contributes.agent.tools`; the SDK renderer resolves each alias to its underlying
generation tool while runtime `tools/list` remains authoritative for live
availability.

Before packing or publication, the authoring check renders both references in
memory and rejects missing stable links or authored reserved paths.
`@convax/marketplace-kit` injects `references/convax-capabilities.md` from
`@convax/plugin-api` and `references/plugin-capabilities.md` from
`@convax/plugin-sdk`. The first contains only the declared `agent-skill` API
subset, records catalog version, `since` and availability guidance, and describes
declared Plugin tools. The second records cross-Plugin imports, compatible version
intervals, exports, provider operations, and closed schemas. When no Agent-facing
Host API exists, the Host page still states that runtime Plugin tool discovery is
authoritative and does not invent Web API access. The Skill's `SKILL.md` contains
stable links to both references.

The generated bytes participate in both the standalone Skill artifact and the
owner Plugin's injected Skill snapshot and digest. Injection occurs during
Kit build/publication; a Host upgrade never rewrites an already installed Skill
in place.

## Verified companion executables

A current v8 external runtime is distributed beside, never inside, its static
Plugin ZIP. Immutable historical v2 through v7 entries remain consumable with the
same rule. Its Plugin item has the following optional strict field:

```json
"companions": [{
  "command": "creative-tools-mcp",
  "version": "1.2.3",
  "targets": [{
    "platform": "darwin",
    "arch": "arm64",
    "artifact": {
      "url": "https://github.com/convaxai/convax-plugins/releases/download/plugin-creative-tools-v1.0.0/convax-companion-creative-tools-mcp-1.2.3-darwin-arm64",
      "size": 123456,
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  }]
}]
```

`command` must match the manifest runtime command one-to-one. Companion commands
and each `platform`/`arch` target are unique. Platforms are `darwin`, `linux`, or
`win32`; architectures are `arm64` or `x64`. A binary is at most 128 MiB. Its URL
is not arbitrary: it must exactly equal the package's immutable Release tag plus
`convax-companion-<command>-<companion-version>-<platform>-<arch>` (`.exe` on
Windows). Clients select only their exact target, then verify byte count and SHA-256
before admitting the executable to host-owned storage. An absent target is an
unsupported platform, never permission to search `PATH` or download another URL.
Likewise, a candidate whose companion resolves `ffmpeg`, `ffprobe`, or another
runtime dependency from ambient `PATH` has an incomplete immutable closure and
remains publication-blocked until that dependency is host-verified.
An admitted asset beginning exactly with `#!/usr/bin/env convax-bun` is a bundled
Bun program for a compatible host's app-owned shared runtime; every other asset is
executed natively. This byte-level convention adds no alternate Registry shape;
Hosts that do not support the runner fail closed at execution.

## Remote Agent MCP

A current `convax.plugin/8` manifest may contain `contributes.agent.mcp` without
`companions` or a local `runtime`. The declaration is limited to one absolute HTTPS
URL, `oauth: "auto" | "none"`, and at most 16 literal non-credential headers; it
cannot carry secrets, local commands, or executable fallback metadata. Convax
delegates the connection and standard OAuth flow to OpenCode/the native MCP host.
The concrete manifest and any owned Skill source remain in this repository; the
Registry does not turn them into Convax-specific runtime code.

`opencode.skill/1` is a Registry compatibility label, not the bundle format.
Published Skill ZIPs follow the open Agent Skills `SKILL.md` layout and may
include client-specific metadata such as `agents/openai.yaml`.

The production builder reads historical Release entries but emits only the highest
stable SemVer for each kind/id; prereleases never replace a stable catalog item.
Packages are sorted by kind then id for deterministic output. Unknown fields are
rejected. Clients must ignore yanked items for new installs while still
allowing inventory/diagnostics for already-installed versions.

The Official source may also apply the reviewed policy in
`catalogs/excluded.json`. Unlike yanking, an exclusion removes the identity from
the current Registry and Showcase entirely. The selective builder binds each
removal to the exact production version, requires the package to be absent from
the candidate publication view, and preserves every unrelated production entry.
Immutable historical Releases remain available for audit and recovery.

## Showcase sidecars

The current Marketplace descriptor exposes `convax.showcase/2` at
`https://convaxai.github.io/convax-plugins/showcase/v2/index.json`.

Presentation media is published separately at
that v2 URL. It never enters a package ZIP. Its revision must exactly match the
Registry fetched by the client; otherwise the whole sidecar is ignored.

Each sidecar item identifies the same `kind`, `id`, and `version` as a current
Registry package and contains a required `poster` plus an optional `animation`.
Media objects contain exactly `url`, `mime`, `size`, `sha256`, `width`, `height`,
and `alt`. URLs target immutable assets on that package's own GitHub Release.
Clients verify identity, URL, MIME, byte count, digest, and file signature before
rendering media. A missing or invalid sidecar degrades to an unanimated catalog;
it must not prevent listing or installing packages.
